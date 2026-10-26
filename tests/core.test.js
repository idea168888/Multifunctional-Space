import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeState,
  filterWorks,
  lineTextLength,
  metadataIssues,
  crc32,
  makeZip,
  stickerDimensions,
  alphaBounds,
  pngInfo,
  pngWithDpi,
} from "../core.js";
const work = {
  id: "one",
  title: "第一件作品",
  body: "森林計畫",
  type: "research",
  date: "2026-10-26T00:00:00Z",
};
test("legacy backup migration preserves works, adds drafts safely", () => {
  const s = normalizeState({ themes: [], works: [work] });
  assert.equal(s.version, 2);
  assert.deepEqual(s.drafts, {});
  assert.equal(s.works[0].title, work.title);
});
test("invalid backups, duplicate IDs and invalid dates are rejected", () => {
  for (const value of [
    { themes: [], works: [{ ...work, date: "invalid" }] },
    { themes: [], works: [work, work] },
    { themes: [{ id: "art", name: "bad" }], works: [] },
    { themes: [{ id: "new", name: " " }], works: [] },
  ])
    assert.throws(() => normalizeState(value));
});
test("imported HTML stays text and extra executable metadata is dropped", () => {
  const s = normalizeState({
    themes: [],
    works: [{ ...work, title: "<img src=x onerror=alert(1)>", html: "bad" }],
  });
  assert.equal(s.works[0].title, "<img src=x onerror=alert(1)>");
  assert.ok(!("html" in s.works[0]));
});
test("filter combines query, topic, favorites and sort", () => {
  const works = [
    work,
    {
      ...work,
      id: "two",
      title: "第二件",
      type: "art",
      favorite: true,
      date: "2026-10-27T00:00:00Z",
    },
  ];
  assert.equal(filterWorks(works, "森林", "art", true)[0].id, "two");
  assert.equal(filterWorks(works, "", "", false, "old")[0].id, "one");
  assert.equal(filterWorks(works, "不存在").length, 0);
});
test("LINE counts full-width as 2 and rejects emoji and long metadata", () => {
  assert.equal(lineTextLength("你好Hi"), 6);
  const m = {
    title: "日常",
    creator: "Author",
    description: "Hello",
    copyright: "2026 Author",
  };
  assert.deepEqual(metadataIssues(m), []);
  assert.ok(
    metadataIssues({ ...m, title: "你".repeat(21) }).some((s) =>
      s.includes("超過"),
    ),
  );
  assert.ok(
    metadataIssues({ ...m, title: "😀" }).some((s) => s.includes("表情")),
  );
});
test("sticker dimensions require even pixels and exact main/tab dimensions", () => {
  assert.equal(stickerDimensions("sticker", 370, 320), true);
  assert.equal(stickerDimensions("sticker", 369, 320), false);
  assert.equal(stickerDimensions("sticker", 0, 0), false);
  assert.equal(stickerDimensions("main", 240, 240), true);
  assert.equal(stickerDimensions("tab", 96, 74), true);
  assert.equal(stickerDimensions("tab", 96, 76), false);
});
test("alpha check distinguishes transparent but blank image", () => {
  const empty = alphaBounds(new Uint8ClampedArray(20 * 20 * 4), 20, 20);
  assert.equal(empty.blank, true);
  const p = new Uint8ClampedArray(30 * 30 * 4);
  p[(15 * 30 + 15) * 4 + 3] = 255;
  const a = alphaBounds(p, 30, 30);
  assert.equal(a.blank, false);
  assert.equal(a.transparent, true);
  assert.equal(a.margin, 14);
});
test("CRC32 standard vector and ZIP directory offsets", () => {
  const bytes = new TextEncoder().encode("123456789");
  assert.equal(crc32(bytes), 0xcbf43926);
  const zip = makeZip([
    { name: "01.png", bytes },
    { name: "說明.txt", bytes },
  ]);
  const v = new DataView(zip.buffer),
    end = zip.length - 22;
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint16(12, true), 33);
  assert.equal(v.getUint16(end + 10, true), 2);
  assert.equal(v.getUint32(v.getUint32(end + 16, true), true), 0x02014b50);
});
test("PNG pHYs is added at >=72 dpi and malformed files rejected", () => {
  assert.throws(() => pngInfo(new Uint8Array(10)));
  const bytes = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const result = pngWithDpi(bytes);
  assert.ok(pngInfo(result).dpi >= 72);
  assert.equal(pngInfo(result).width, 1);
  assert.equal(pngWithDpi(result).length, result.length);
});
