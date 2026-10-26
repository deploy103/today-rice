import http from "node:http";
import { URL } from "node:url";
import { annotateDishName } from "./allergen-infer.mjs";
import { kstWeekBounds, msUntilNextKstMidnight } from "./kst.mjs";

const LISTEN_HOST = "0.0.0.0";
const LISTEN_PORT = 8010;
const CALENDAR_URL = "https://hansei.sen.hs.kr/197900/subMenu.do";
const DETAIL_URL = "https://hansei.sen.hs.kr/dggb/module/mlsv/selectMlsvDetailPopup.do";
const SITE_ID = "SEI_00000617";
const USER_AGENT = "today-rice-school-meal-proxy/1.0";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RANGE_DAYS = 14;
const CACHE_TTL_MS = 6 * 60 * 60_000;

const MEAL_TYPE = {
  아침: "조식",
  점심: "중식",
  저녁: "석식",
  조식: "조식",
  중식: "중식",
  석식: "석식",
};

const responseCache = new Map();
let warmupTimer = null;

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, max-age=60",
  });
  response.end(payload);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00+09:00`));
}

function monthKey(isoDate) {
  return isoDate.slice(0, 7);
}

function cacheKey(from, to) {
  return `${from}:${to}`;
}

function readCachedRows(from, to) {
  const hit = responseCache.get(cacheKey(from, to));
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > CACHE_TTL_MS || !hit.rows.length) {
    responseCache.delete(cacheKey(from, to));
    return null;
  }
  return hit.rows;
}

function writeCachedRows(from, to, rows) {
  if (!rows.length) {
    responseCache.delete(cacheKey(from, to));
    return;
  }
  responseCache.set(cacheKey(from, to), { cachedAt: Date.now(), rows });
}

function enumerateMonths(from, to) {
  const months = [];
  let cursor = `${from.slice(0, 7)}-01`;
  const last = `${to.slice(0, 7)}-01`;
  while (cursor <= last) {
    months.push(monthKey(cursor));
    const [year, month] = cursor.split("-").map(Number);
    const next = month === 12 ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, month, 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return months;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`upstream ${response.status}`);
  }
  return response.text();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function stripTags(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCalendar(html, year, month) {
  const entries = [];
  const pattern = /fnDetail\('(\d+)'[^>]*>\s*([^<]+)/g;
  for (const match of html.matchAll(pattern)) {
    const id = match[1];
    const title = stripTags(match[2]);
    const dateMatch = title.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
    if (!dateMatch) continue;
    const day = Number(dateMatch[2]);
    if (day < 1 || day > 31) continue;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!isIsoDate(iso)) continue;
    entries.push({ id, date: iso, title });
  }
  return entries;
}

function parseDetail(html) {
  const rows = {};
  const pattern = /<th[^>]*>\s*([^<]+?)\s*<\/th>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>/gi;
  for (const match of html.matchAll(pattern)) {
    rows[stripTags(match[1])] = stripTags(match[2]);
  }
  return rows;
}

function toNeisRow(date, detail) {
  const menu = detail["식단"] || "";
  if (!menu) return null;
  const typeLabel = detail["급식"] || "중식";
  const calories = (detail["칼로리"] || "").replace(/\s+/g, " ").trim();
  const dishes = menu
    .split(",")
    .map((part) => annotateDishName(part.trim()))
    .filter(Boolean);
  if (dishes.length === 0) return null;
  return {
    MLSV_YMD: date.replaceAll("-", ""),
    MMEAL_SC_NM: MEAL_TYPE[typeLabel] || typeLabel,
    DDISH_NM: dishes.join("<br/>"),
    CAL_INFO: calories,
  };
}

async function fetchMonthEntries(yearMonth) {
  const [year, month] = yearMonth.split("-");
  const body = new URLSearchParams({
    viewType: "calendar",
    siteId: SITE_ID,
    arrMlsvId: "0",
    srhMlsvYear: year,
    srhMlsvMonth: month,
  });
  const html = await fetchText(CALENDAR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return parseCalendar(html, year, month);
}

async function fetchDetailRow(entry) {
  const html = await fetchText(DETAIL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Referer: CALENDAR_URL,
    },
    body: new URLSearchParams({ mlsvId: entry.id }),
  });
  return toNeisRow(entry.date, parseDetail(html));
}

async function loadSchoolMeals(from, to) {
  const months = enumerateMonths(from, to);
  const seen = new Set();
  const entries = [];
  for (const month of months) {
    for (const entry of await fetchMonthEntries(month)) {
      if (entry.date < from || entry.date > to) continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  const rows = (await Promise.all(entries.map(fetchDetailRow))).filter(Boolean);
  rows.sort((left, right) => left.MLSV_YMD.localeCompare(right.MLSV_YMD) || left.MMEAL_SC_NM.localeCompare(right.MMEAL_SC_NM, "ko"));
  return rows;
}

async function getSchoolMeals(from, to) {
  const cached = readCachedRows(from, to);
  if (cached) return cached;
  const rows = await loadSchoolMeals(from, to);
  writeCachedRows(from, to, rows);
  return rows;
}

async function warmupCurrentWeek(reason) {
  const [from, to] = kstWeekBounds();
  try {
    const rows = await loadSchoolMeals(from, to);
    writeCachedRows(from, to, rows);
    console.log(`warmed ${from}..${to} rows=${rows.length} reason=${reason}`);
  } catch (error) {
    console.error(`warmup failed reason=${reason}`, error);
  }
}

function scheduleMidnightWarmup() {
  if (warmupTimer) clearTimeout(warmupTimer);
  warmupTimer = setTimeout(() => {
    warmupCurrentWeek("kst-midnight").finally(scheduleMidnightWarmup);
  }, msUntilNextKstMidnight());
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, cacheEntries: responseCache.size });
      return;
    }
    if (request.method !== "GET" || url.pathname !== "/api/school-meals") {
      sendJson(response, 404, { error: "not found" });
      return;
    }
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      sendJson(response, 400, { error: "invalid date range" });
      return;
    }
    const daySpan = Math.round((Date.parse(`${to}T12:00:00+09:00`) - Date.parse(`${from}T12:00:00+09:00`)) / 86_400_000) + 1;
    if (daySpan > MAX_RANGE_DAYS) {
      sendJson(response, 400, { error: "range too large" });
      return;
    }
    const rows = await getSchoolMeals(from, to);
    sendJson(response, 200, { from, to, rows });
  } catch (error) {
    console.error(error);
    sendJson(response, 502, { error: "school meal lookup failed" });
  }
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`school-meal-proxy listening on ${LISTEN_HOST}:${LISTEN_PORT}`);
  warmupCurrentWeek("startup");
  scheduleMidnightWarmup();
});
