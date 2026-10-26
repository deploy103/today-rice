import test from "node:test";
import assert from "node:assert/strict";
import { mealSource, mergeNeisAndSchool, siriDaysToRows } from "../meal-merge.mjs";

test("keeps NEIS allergen codes when both sources have the same day", () => {
  const neis = [
    {
      MLSV_YMD: "20261016",
      MMEAL_SC_NM: "중식",
      DDISH_NM: "짜계치 (1.2.5.6.10.13.15.16)<br/>가쓰오장국 (5.6.7.13.18)",
    },
  ];
  const school = [
    {
      MLSV_YMD: "20261016",
      MMEAL_SC_NM: "중식",
      DDISH_NM: "짜계치(추가밥)<br/>가쓰오장국",
    },
  ];
  const merged = mergeNeisAndSchool(neis, school);
  assert.equal(merged.length, 1);
  assert.match(merged[0].DDISH_NM, /\(1\.2\.5\.6\.10/);
  assert.equal(mealSource(merged), "api");
});

test("keeps school menu on days NEIS does not have", () => {
  const neis = [];
  const school = [
    {
      MLSV_YMD: "20261026",
      MMEAL_SC_NM: "중식",
      DDISH_NM: "현미밥<br/>시래기된장국",
    },
  ];
  const merged = mergeNeisAndSchool(neis, school);
  assert.equal(merged[0].DDISH_NM, "현미밥<br/>시래기된장국");
  assert.equal(mealSource(merged), "school");
});

test("converts siri range meals into dish rows with codes", () => {
  const rows = siriDaysToRows([
    {
      date: "2026-10-16",
      meals: [
        {
          name: "중식",
          dishes: ["짜계치 (1.2.5.6.10.13.15.16)", "가쓰오장국 (5.6.7.13.18)"],
          calories: "1106.4 Kcal",
          nutrition: "탄수화물(g) : 124.3\n단백질(g) : 45.7",
          origin: "돼지고기 : 국내산",
        },
      ],
    },
  ]);
  assert.equal(rows[0].MLSV_YMD, "20261016");
  assert.match(rows[0].DDISH_NM, /\(1\.2\.5\.6\.10/);
  assert.match(rows[0].NTR_INFO, /탄수화물/);
  assert.match(rows[0].ORPLC_INFO, /돼지고기/);
});
