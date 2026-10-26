import test from "node:test";
import assert from "node:assert/strict";
import { kstTodayIso, kstWeekBounds, nextKstMidnightUtc } from "../kst.mjs";

test("maps UTC afternoon to the KST calendar date", () => {
  assert.equal(kstTodayIso(new Date("2026-10-26T12:12:00Z")), "2026-10-26");
  assert.equal(kstTodayIso(new Date("2026-10-26T15:00:00Z")), "2026-10-27");
});

test("current week is Monday through Friday in KST", () => {
  assert.deepEqual(kstWeekBounds(new Date("2026-10-26T12:00:00Z")), ["2026-10-26", "2026-10-30"]);
  assert.deepEqual(kstWeekBounds(new Date("2026-10-31T12:00:00Z")), ["2026-10-26", "2026-10-30"]);
});

test("next KST midnight is 15:00 UTC that calendar day", () => {
  assert.equal(nextKstMidnightUtc(new Date("2026-10-26T12:12:00Z")), Date.parse("2026-10-26T15:00:00Z"));
  assert.equal(nextKstMidnightUtc(new Date("2026-10-26T15:00:01Z")), Date.parse("2026-10-27T15:00:00Z"));
});
