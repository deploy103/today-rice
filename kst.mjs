const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstParts(now = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    weekday: kst.getUTCDay(),
  };
}

export function formatIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function kstTodayIso(now = new Date()) {
  const parts = kstParts(now);
  return formatIsoDate(parts.year, parts.month, parts.day);
}

export function nextKstMidnightUtc(now = new Date()) {
  const parts = kstParts(now);
  return Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0) - KST_OFFSET_MS;
}

export function msUntilNextKstMidnight(now = new Date()) {
  return Math.max(1_000, nextKstMidnightUtc(now) - now.getTime());
}

export function kstWeekBounds(now = new Date()) {
  const parts = kstParts(now);
  const mondayOffset = parts.weekday === 0 ? -6 : 1 - parts.weekday;
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + mondayOffset));
  const friday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 4));
  return [
    formatIsoDate(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    formatIsoDate(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate()),
  ];
}
