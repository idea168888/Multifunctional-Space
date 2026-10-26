import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  makeApng,
  pngChunk,
  pngChunks,
  animationInfo,
  removeEdgeBackground,
  soundWave,
  promptTask,
  automationScript,
} from "../creative.js";
function png(r) {
  const header = new Uint8Array(13),
    v = new DataView(header.buffer);
  v.setUint32(0, 4);
  v.setUint32(4, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = new Uint8Array(4 * (1 + 4 * 4));
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const o = y * 17 + 1 + x * 4;
      raw[o] = r;
      raw[o + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}
test("APNG has correct frame count, finite loops, contiguous sequence and total duration", () => {
  const bytes = makeApng(
      Array.from({ length: 10 }, (_, i) => png(i * 20)),
      { duration: 1000, loops: 4 },
    ),
    info = animationInfo(bytes);
  assert.equal(info.frames, 10);
  assert.equal(info.loops, 4);
  assert.ok(Math.abs(info.seconds - 4) < 0.001);
  const chunks = pngChunks(bytes),
    sequence = chunks
      .filter((c) => ["fcTL", "fdAT"].includes(c.type))
      .map((c) => new DataView(c.data.buffer).getUint32(0));
  assert.deepEqual(
    sequence,
    sequence.map((_, i) => i),
  );
});
test("APNG refuses still, too few frames and excessive duration", () => {
  assert.throws(() => makeApng(Array(10).fill(png(4))));
  assert.throws(() => makeApng([png(1), png(2)]));
  assert.throws(() =>
    makeApng(
      Array.from({ length: 10 }, (_, i) => png(i)),
      { duration: 3000, loops: 2 },
    ),
  );
});
test("PNG parser rejects bad CRC", () => {
  const p = new Uint8Array(png(1));
  p[20] ^= 1;
  assert.throws(() => pngChunks(p), /CRC/);
});
test("edge background removal preserves an enclosed same-color detail", () => {
  const w = 7,
    h = 7,
    data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([255, 255, 255, 255], i * 4);
  for (let y = 1; y < 6; y++)
    for (let x = 1; x < 6; x++) data.set([0, 0, 0, 255], (y * w + x) * 4);
  data.set([255, 255, 255, 255], (3 * w + 3) * 4);
  const out = removeEdgeBackground(data, w, h, 30, 5);
  assert.equal(out.data[3], 0);
  assert.equal(out.data[(3 * w + 3) * 4 + 3], 255);
  assert.equal(data[3], 255);
  assert.ok(out.removed > 0);
});
test("original generated sound is a nonempty PCM WAV", () => {
  const bytes = soundWave("boing"),
    v = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(v.getUint32(24, true), 22050);
  assert.equal(v.getUint32(40, true), bytes.length - 44);
  assert.ok(bytes.slice(44).some((n) => n !== 0));
});
test("prompt routing is deterministic and never executes arbitrary commands", () => {
  assert.equal(promptTask("做搞笑動態貼圖").target, "sticker");
  assert.equal(promptTask("復古海報").target, "art");
  assert.equal(promptTask("影片分鏡").target, "video");
  assert.equal(promptTask("刪除所有檔案").target, "research");
});
test("external automation exports literals, validates protocol and does not submit", () => {
  assert.throws(() => automationScript("javascript:alert(1)"));
  assert.throws(() => automationScript("https://user:secret@example.com"));
  const script = automationScript(
    "https://example.com/editor",
    "textarea",
    "`);process.exit(9);//",
  );
  assert.ok(script.includes("allowedHost"));
  assert.ok(!script.includes(".click("));
  assert.ok(script.includes('"`);process.exit(9);//"'));
});
