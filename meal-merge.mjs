export function mealRowKey(row) {
  return `${row.MLSV_YMD}:${row.MMEAL_SC_NM || ""}`;
}

export function siriDaysToRows(days) {
  return (days || []).flatMap((day) =>
    (day.meals || []).map((meal) => ({
      MLSV_YMD: String(day.date || "").replaceAll("-", ""),
      MMEAL_SC_NM: meal.name || "중식",
      DDISH_NM: (meal.dishes || []).join("<br/>"),
      CAL_INFO: meal.calories || "",
      NTR_INFO: String(meal.nutrition || "").replaceAll("\n", "<br/>"),
      ORPLC_INFO: String(meal.origin || "").replaceAll("\n", "<br/>"),
    })),
  );
}

export function mergeNeisAndSchool(neisRows, schoolRows) {
  const merged = new Map();
  for (const row of schoolRows || []) merged.set(mealRowKey(row), row);
  for (const row of neisRows || []) merged.set(mealRowKey(row), row);
  return [...merged.values()].sort(
    (left, right) =>
      left.MLSV_YMD.localeCompare(right.MLSV_YMD) ||
      String(left.MMEAL_SC_NM).localeCompare(String(right.MMEAL_SC_NM), "ko"),
  );
}

export function mealSource(rows) {
  const hasCodes = (rows || []).some((row) => /\(\d/.test(row.DDISH_NM || ""));
  const hasRows = (rows || []).length > 0;
  if (hasCodes) return "api";
  if (hasRows) return "school";
  return "empty";
}
