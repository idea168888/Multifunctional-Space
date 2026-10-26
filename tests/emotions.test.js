import { test } from "node:test";
import assert from "node:assert/strict";
import { inferIntent, resolveIntent, poseFor } from "../emotions.js";
test("phrases map to meaning rather than character hashes", () => {
  for (const [text, expected] of [
    ["謝謝你", "thanks"],
    ["對不起", "sorry"],
    ["加油！", "cheer"],
    ["晚安", "sleep"],
    ["哈哈哈", "laugh"],
    ["愛你", "love"],
    ["難過想哭", "sad"],
    ["氣死我了", "angry"],
    ["哇！", "surprise"],
    ["你好", "greeting"],
    ["辛苦了", "tired"],
    ["為什麼？", "confused"],
    ["收到", "neutral"],
  ])
    assert.equal(inferIntent(text), expected, text);
});
test("negation, English and manual overrides remain predictable", () => {
  assert.equal(inferIntent("不要哭"), "cheer");
  assert.equal(inferIntent("不生氣"), "neutral");
  assert.equal(inferIntent("Thank you"), "thanks");
  assert.equal(resolveIntent("謝謝你", "angry"), "angry");
  assert.equal(resolveIntent("謝謝你", "__proto__"), "thanks");
});
test("semantic poses vary over time and fit finite transforms", () => {
  for (const motion of [
    "bow",
    "jump",
    "sleep",
    "love",
    "sad",
    "angry",
    "surprise",
    "wave",
    "tired",
    "confused",
    "laugh",
  ]) {
    const first = poseFor(motion, 0),
      next = poseFor(motion, 0.3);
    assert.notDeepEqual(first, next, motion);
    for (const value of Object.values(next)) assert.ok(Number.isFinite(value));
  }
  assert.ok(poseFor("bow", 0.5).sy < poseFor("bow", 0).sy);
  assert.ok(poseFor("jump", 0.5).y < 0);
});
