const NEIS_BASE_URL = "https://open.neis.go.kr/hub";
const CACHE_KEY = "mealdesk.neis.weekCache";

const runtimeConfig = window.MEAL_CONFIG || {};
const SCHOOL_CONFIG = Object.freeze({
  name: runtimeConfig.name || "한세사이버보안고등학교",
  officeCode: runtimeConfig.officeCode || "B10",
  schoolCode: runtimeConfig.schoolCode || "7010911",
  apiKey: runtimeConfig.apiKey || "",
});

const ALLERGEN_LABELS = {
  1: "난류",
  2: "우유",
  3: "메밀",
  4: "땅콩",
  5: "대두",
  6: "밀",
  7: "고등어",
  8: "게",
  9: "새우",
  10: "돼지고기",
  11: "복숭아",
  12: "토마토",
  13: "아황산류",
  14: "호두",
  15: "닭고기",
  16: "쇠고기",
  17: "오징어",
  18: "조개류",
  19: "잣",
};

const SOURCE_LABELS = {
  loading: "불러오는 중",
  missing: "학교 코드 필요",
  api: "나이스 연결",
  empty: "등록된 급식 없음",
  cache: "저장 데이터",
  error: "불러오기 실패",
};

const state = {
  selectedDate: getInitialDate(),
  selectedMeal: "all",
  mealsByDate: new Map(),
  source: "loading",
  lastUpdated: null,
  isLoading: false,
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  loadWeek();
  createIcons();
});

function cacheElements() {
  [
    "schoolLabel",
    "todayButton",
    "refreshButton",
    "copyMenuButton",
    "prevDayButton",
    "nextDayButton",
    "dayName",
    "selectedDateLabel",
    "dateInput",
    "sourceStatus",
    "lastUpdated",
    "mealList",
    "weekRange",
    "weekStats",
    "weekGrid",
    "toast",
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.prevDayButton.addEventListener("click", () => moveDate(-1));
  elements.nextDayButton.addEventListener("click", () => moveDate(1));
  elements.todayButton.addEventListener("click", () => {
    state.selectedDate = todayKst();
    updateDateQuery();
    loadWeek();
  });
  elements.dateInput.addEventListener("change", () => {
    if (!isIsoDate(elements.dateInput.value)) {
      return;
    }

    state.selectedDate = elements.dateInput.value;
    updateDateQuery();
    loadWeek();
  });
  elements.refreshButton.addEventListener("click", () => loadWeek({ force: true }));
  elements.copyMenuButton.addEventListener("click", copyTodayMenu);

  document.querySelectorAll("[data-meal-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMeal = button.dataset.mealFilter;
      document.querySelectorAll("[data-meal-filter]").forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });
}

async function loadWeek(options = {}) {
  const [startDate, endDate] = getWeekBounds(state.selectedDate);
  const weekDates = enumerateDates(startDate, endDate);
  const hasSchoolConfig = Boolean(SCHOOL_CONFIG.officeCode && SCHOOL_CONFIG.schoolCode);

  state.isLoading = true;
  state.source = "loading";
  render();

  if (!hasSchoolConfig) {
    setEmptyWeek(weekDates);
    state.isLoading = false;
    state.source = "missing";
    state.lastUpdated = null;
    render();
    return;
  }

  try {
    if (!options.force) {
      const cached = loadCachedRows(startDate, endDate);
      if (cached) {
        hydrateWeekRows(cached.rows, weekDates);
        state.source = "cache";
        state.lastUpdated = new Date(cached.cachedAt);
        state.isLoading = false;
        render();
        return;
      }
    }

    const rows = await fetchMealRows(startDate, endDate);
    hydrateWeekRows(rows, weekDates);
    saveCachedRows(startDate, endDate, rows);
    state.source = rows.length ? "api" : "empty";
    state.lastUpdated = new Date();
  } catch (error) {
    console.error(error);
    const cached = loadCachedRows(startDate, endDate);

    if (cached) {
      hydrateWeekRows(cached.rows, weekDates);
      state.source = "cache";
      state.lastUpdated = new Date(cached.cachedAt);
      showToast("나이스 호출에 실패해 저장된 데이터를 표시합니다.");
    } else {
      setEmptyWeek(weekDates);
      state.source = "error";
      state.lastUpdated = null;
      showToast("나이스 급식 정보를 불러오지 못했습니다.");
    }
  } finally {
    state.isLoading = false;
    render();
    createIcons();
  }
}

async function fetchMealRows(startDate, endDate) {
  const params = new URLSearchParams({
    Type: "json",
    pIndex: "1",
    pSize: "100",
    ATPT_OFCDC_SC_CODE: SCHOOL_CONFIG.officeCode,
    SD_SCHUL_CODE: SCHOOL_CONFIG.schoolCode,
    MLSV_FROM_YMD: compactDate(startDate),
    MLSV_TO_YMD: compactDate(endDate),
  });

  if (SCHOOL_CONFIG.apiKey) {
    params.set("KEY", SCHOOL_CONFIG.apiKey);
  }

  const response = await fetch(`${NEIS_BASE_URL}/mealServiceDietInfo?${params}`);
  if (!response.ok) {
    throw new Error(`NEIS HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.RESULT) {
    if (data.RESULT.CODE === "INFO-200") {
      return [];
    }

    throw new Error(data.RESULT.MESSAGE || data.RESULT.CODE || "NEIS error");
  }

  return data.mealServiceDietInfo?.[1]?.row || [];
}

function hydrateWeekRows(rows, weekDates) {
  setEmptyWeek(weekDates);
  normalizeMealRows(rows).forEach((meal) => {
    const collection = state.mealsByDate.get(meal.date) || [];
    collection.push(meal);
    state.mealsByDate.set(meal.date, collection);
  });
}

function setEmptyWeek(weekDates) {
  state.mealsByDate.clear();
  weekDates.forEach((date) => state.mealsByDate.set(date, []));
}

function normalizeMealRows(rows) {
  return rows.map((row) => ({
    date: expandDate(row.MLSV_YMD),
    type: row.MMEAL_SC_NM || "급식",
    dishes: splitMealText(row.DDISH_NM).map(parseDish),
    calories: row.CAL_INFO || "-",
    nutrition: parseNutrition(row.NTR_INFO || ""),
    origin: stripTags(row.ORPLC_INFO || ""),
  }));
}

function saveCachedRows(startDate, endDate, rows) {
  const cache = loadCacheStore();
  cache[getCacheId(startDate, endDate)] = {
    cachedAt: new Date().toISOString(),
    rows,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function loadCachedRows(startDate, endDate) {
  return loadCacheStore()[getCacheId(startDate, endDate)] || null;
}

function loadCacheStore() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function getCacheId(startDate, endDate) {
  return [SCHOOL_CONFIG.officeCode, SCHOOL_CONFIG.schoolCode, startDate, endDate].join(":");
}

function render() {
  renderHeader();
  renderDate();
  renderMealList();
  renderWeek();
}

function renderHeader() {
  const sourceLabel = state.isLoading ? SOURCE_LABELS.loading : SOURCE_LABELS[state.source] || SOURCE_LABELS.error;
  elements.schoolLabel.textContent = SCHOOL_CONFIG.name;
  elements.sourceStatus.textContent = sourceLabel;
  elements.lastUpdated.textContent = state.lastUpdated ? `${formatTime(state.lastUpdated)} 업데이트` : "KST 기준";
}

function renderDate() {
  const date = parseIsoDate(state.selectedDate);
  elements.dayName.textContent = formatWeekday(date);
  elements.selectedDateLabel.textContent = formatMonthDay(date);
  elements.dateInput.value = state.selectedDate;
}

function renderMealList() {
  if (state.isLoading) {
    elements.mealList.innerHTML = `<div class="empty-state"><strong>불러오는 중</strong><span>나이스 급식 정보를 확인하고 있습니다.</span></div>`;
    return;
  }

  if (state.source === "missing") {
    elements.mealList.innerHTML = `<div class="empty-state"><strong>학교 코드 필요</strong><span>단일 학교용으로 사용할 교육청 코드와 학교 코드를 app.js에 입력해야 합니다.</span></div>`;
    return;
  }

  if (state.source === "error") {
    elements.mealList.innerHTML = `<div class="empty-state"><strong>불러오기 실패</strong><span>나이스 연결 상태나 학교 코드를 확인해 주세요.</span></div>`;
    return;
  }

  const meals = getFilteredMeals(state.selectedDate);
  if (!meals.length) {
    elements.mealList.innerHTML = `<div class="empty-state"><strong>급식 정보 없음</strong><span>방학, 주말, 미운영일이거나 아직 데이터가 등록되지 않았습니다.</span></div>`;
    return;
  }

  elements.mealList.innerHTML = meals.map(renderMealCard).join("") + renderAllergenLegend(meals);
}

function renderMealCard(meal) {
  const allergenSet = new Set(meal.dishes.flatMap((dish) => dish.allergens));
  const menuItems = meal.dishes
    .map(
      (dish) => `
        <li>
          <span>${escapeHtml(dish.name)}</span>
          ${dish.allergens.length ? `<span class="allergen-tag">${dish.allergens.join(".")}</span>` : ""}
        </li>
      `,
    )
    .join("");

  return `
    <article class="meal-card">
      <div class="meal-type">
        <strong>${escapeHtml(meal.type)}</strong>
        <span>${escapeHtml(meal.calories || "-")}</span>
        <span>${allergenSet.size ? `${allergenSet.size}개 알레르기 표기` : "알레르기 표기 없음"}</span>
      </div>
      <div>
        <ul class="menu-items">${menuItems}</ul>
        ${renderNutritionChips(meal.nutrition)}
        ${meal.origin ? `<p class="origin-line">${escapeHtml(meal.origin)}</p>` : ""}
      </div>
    </article>
  `;
}

function renderNutritionChips(nutrition) {
  const entries = Object.entries(nutrition).slice(0, 5);
  if (!entries.length) {
    return "";
  }

  return `
    <dl class="nutrition-chips">
      ${entries
        .map(
          ([label, value]) => `
            <div>
              <dt>${escapeHtml(label.replace(/\(.*?\)/g, ""))}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderAllergenLegend(meals) {
  const codes = [...new Set(meals.flatMap((meal) => meal.dishes.flatMap((dish) => dish.allergens)))].sort((a, b) => a - b);
  if (!codes.length) {
    return "";
  }

  return `
    <section class="allergen-legend" aria-label="알레르기 코드">
      <div>
        <strong>알레르기 코드</strong>
        <span>식단명 옆 숫자를 확인하세요.</span>
      </div>
      <div class="allergen-list">
        ${codes.map((code) => `<span>${code}. ${escapeHtml(ALLERGEN_LABELS[code])}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderWeek() {
  const [startDate, endDate] = getWeekBounds(state.selectedDate);
  const weekDates = enumerateDates(startDate, endDate);
  elements.weekRange.textContent = `${formatMonthDay(parseIsoDate(startDate))} - ${formatMonthDay(parseIsoDate(endDate))}`;
  renderWeekStats(weekDates);
  elements.weekGrid.innerHTML = weekDates
    .map((date) => {
      const meals = state.mealsByDate.get(date) || [];
      const lunch = meals.find((meal) => meal.type.includes("중식")) || meals[0];
      const weekday = formatShortWeekday(parseIsoDate(date));
      const summary = lunch?.dishes?.slice(0, 4).map((dish) => dish.name).join(" · ") || "급식 정보 없음";
      const chip = lunch?.calories || "미등록";

      return `
        <button class="day-card ${date === state.selectedDate ? "active" : ""}" type="button" data-date="${date}">
          <small>${weekday}</small>
          <strong>${formatMonthDay(parseIsoDate(date))}</strong>
          <span class="chip">${escapeHtml(chip)}</span>
          <p>${escapeHtml(summary)}</p>
        </button>
      `;
    })
    .join("");

  elements.weekGrid.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.date;
      updateDateQuery();
      render();
    });
  });
}

function renderWeekStats(weekDates) {
  const meals = weekDates.flatMap((date) => state.mealsByDate.get(date) || []);
  const operatingDays = weekDates.filter((date) => (state.mealsByDate.get(date) || []).length).length;
  const calorieValues = meals.map((meal) => parseFloat(String(meal.calories).replace(/[^\d.]/g, ""))).filter(Number.isFinite);
  const averageCalories = calorieValues.length
    ? `${Math.round(calorieValues.reduce((sum, value) => sum + value, 0) / calorieValues.length)} Kcal`
    : "-";

  elements.weekStats.innerHTML = `
    <div>
      <span>급식일</span>
      <strong>${operatingDays}일</strong>
    </div>
    <div>
      <span>평균 열량</span>
      <strong>${averageCalories}</strong>
    </div>
    <div>
      <span>등록 식사</span>
      <strong>${meals.length}개</strong>
    </div>
  `;
}

function getFilteredMeals(date) {
  const meals = state.mealsByDate.get(date) || [];
  if (state.selectedMeal === "all") {
    return meals;
  }
  return meals.filter((meal) => meal.type.includes(state.selectedMeal));
}

function moveDate(delta) {
  state.selectedDate = addDays(state.selectedDate, delta);
  updateDateQuery();
  const [startDate, endDate] = getWeekBounds(state.selectedDate);

  if (!state.mealsByDate.has(startDate) || !state.mealsByDate.has(endDate)) {
    loadWeek();
  } else {
    render();
  }
}

async function copyTodayMenu() {
  const meals = getFilteredMeals(state.selectedDate);
  if (!meals.length) {
    showToast("복사할 급식 정보가 없습니다.");
    return;
  }

  const lines = [
    `${SCHOOL_CONFIG.name} ${formatMonthDay(parseIsoDate(state.selectedDate))} ${formatWeekday(parseIsoDate(state.selectedDate))}`,
    "",
    ...meals.flatMap((meal) => [
      `[${meal.type}] ${meal.calories || ""}`.trim(),
      meal.dishes.map((dish) => `- ${dish.name}${dish.allergens.length ? ` (${dish.allergens.join(".")})` : ""}`).join("\n"),
      meal.origin ? `원산지: ${meal.origin}` : "",
      "",
    ]),
  ].filter((line) => line !== "");

  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    showToast("오늘 메뉴를 복사했습니다.");
  } catch {
    copyWithTextarea(lines.join("\n"));
    showToast("오늘 메뉴를 복사했습니다.");
  }
}

function copyWithTextarea(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function splitMealText(value) {
  return stripTags(value)
    .split(/\n|<br\s*\/?>/gi)
    .flatMap((part) => part.split(/\s{2,}/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseDish(rawDish) {
  const allergens = [...rawDish.matchAll(/\(([\d.]+)\)/g)]
    .flatMap((match) => match[1].split("."))
    .filter(Boolean)
    .map(Number)
    .filter((value) => ALLERGEN_LABELS[value]);

  const name = rawDish
    .replace(/\(([\d.]+)\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return { name, allergens };
}

function parseNutrition(value) {
  const result = {};
  splitMealText(value).forEach((item) => {
    const [key, rawValue] = item.split(":").map((part) => part.trim());
    if (key && rawValue) {
      result[key] = rawValue.replace(/[^\d.]/g, "");
    }
  });
  return result;
}

function stripTags(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function todayKst() {
  return formatIsoInKst(new Date());
}

function getInitialDate() {
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date");
  return isIsoDate(date) ? date : todayKst();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(parseIsoDate(value).getTime());
}

function updateDateQuery() {
  const url = new URL(window.location.href);
  url.searchParams.set("date", state.selectedDate);
  window.history.replaceState(null, "", url);
}

function formatIsoInKst(date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseIsoDate(isoDate) {
  return new Date(`${isoDate}T12:00:00+09:00`);
}

function addDays(isoDate, days) {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function getWeekBounds(isoDate) {
  const date = parseIsoDate(isoDate);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const startDate = toIsoDate(addDaysToDate(date, mondayOffset));
  const endDate = toIsoDate(addDaysToDate(parseIsoDate(startDate), 4));
  return [startDate, endDate];
}

function addDaysToDate(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function enumerateDates(startDate, endDate) {
  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function toIsoDate(date) {
  return formatIsoInKst(date);
}

function compactDate(isoDate) {
  return isoDate.replaceAll("-", "");
}

function expandDate(value) {
  const raw = String(value);
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
  }
  if (raw.length === 6) {
    return `20${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4)}`;
  }
  return raw;
}

function formatMonthDay(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatWeekday(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
  }).format(date);
}

function formatShortWeekday(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function createIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
