import test from "node:test";
import assert from "node:assert/strict";
import { annotateDishName, inferAllergenCodes } from "../allergen-infer.mjs";

test("infers egg and ketchup from school menu names without NEIS codes", () => {
  assert.deepEqual(inferAllergenCodes("계란말이/케첩"), [1, 12]);
});

test("infers milk from yogurt and pork from samgyeop", () => {
  assert.deepEqual(inferAllergenCodes("리얼딸기요거트"), [2]);
  assert.deepEqual(inferAllergenCodes("주꾸미삼겹덮밥"), [10, 17]);
});

test("does not mark plain rice or unnamed galbi as pork", () => {
  assert.deepEqual(inferAllergenCodes("현미밥"), []);
  assert.deepEqual(inferAllergenCodes("매콤마늘갈비찜"), []);
});

test("keeps official NEIS codes and only annotates names without them", () => {
  assert.equal(annotateDishName("제육볶음 (5.6.10)"), "제육볶음 (5.6.10)");
  assert.equal(annotateDishName("시래기된장국"), "시래기된장국 (5)");
});
