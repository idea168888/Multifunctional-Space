import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: /LINE 貼圖工坊/ }).click();
});
test.afterEach(() => expect(errors).toEqual([]));
const phrases = "謝謝你\n加油！\n晚安\n好開心\n愛你\n難過\n生氣\n你好";
async function upload(page) {
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 240;
    const x = c.getContext("2d");
    x.fillStyle = "#ffe7c5";
    x.beginPath();
    x.roundRect(30, 20, 140, 200, 50);
    x.fill();
    x.fillStyle = "#123456";
    x.fillRect(65, 80, 10, 15);
    x.fillRect(125, 80, 10, 15);
    return c.toDataURL().split(",")[1];
  });
  await page.locator("#sticker-image").setInputFiles({
    name: "character.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator("#cutout-status")).toContainText("背景像素");
}
function entries(buffer) {
  const files = {};
  let o = 0;
  while (buffer.readUInt32LE(o) === 0x04034b50) {
    const n = buffer.readUInt16LE(o + 26),
      e = buffer.readUInt16LE(o + 28),
      length = buffer.readUInt32LE(o + 18),
      start = o + 30 + n + e;
    files[buffer.subarray(o + 30, o + 30 + n).toString()] = buffer.subarray(
      start,
      start + length,
    );
    o = start + length;
  }
  return files;
}
test("uploaded character receives meaning-specific poses and per-sticker overrides persist", async ({
  page,
}) => {
  await page.locator("#sticker-phrases").fill(phrases);
  await upload(page);
  const cards = page.locator(".sticker-preview");
  await expect(cards.nth(0)).toHaveAttribute("data-intent", "thanks");
  await expect(cards.nth(1)).toHaveAttribute("data-intent", "cheer");
  await expect(cards.nth(2)).toHaveAttribute("data-intent", "sleep");
  const bodyHashes = await cards.evaluateAll((cs) =>
    cs.map((c) => {
      const x = c.getContext("2d");
      return Array.from(x.getImageData(50, 100, 270, 190).data).join(",");
    }),
  );
  expect(new Set(bodyHashes).size).toBeGreaterThan(4);
  await page
    .getByRole("combobox", { name: "第 1 張的情緒動作", exact: true })
    .selectOption("love");
  await expect(cards.nth(0)).toHaveAttribute("data-intent", "love");
  await page.getByRole("button", { name: /圖文靈感所/ }).click();
  await page.getByRole("button", { name: /LINE 貼圖工坊/ }).click();
  await expect(page.locator(".sticker-preview").first()).toHaveAttribute(
    "data-intent",
    "love",
  );
});
test("optional uploaded face repaint changes pixels and exported semantic animation retains fixed text", async ({
  page,
}) => {
  await page.locator("#sticker-phrases").fill(phrases);
  await upload(page);
  await page.getByText("上傳角色：文字動作與五官設定", { exact: true }).click();
  const before = await page
    .locator(".sticker-preview")
    .first()
    .evaluate((c) => c.toDataURL());
  await page.locator("#face-redraw").check();
  await page.locator("#face-y").fill("45");
  const after = await page
    .locator(".sticker-preview")
    .first()
    .evaluate((c) => c.toDataURL());
  expect(after).not.toBe(before);
  await page.locator("#sticker-mode").selectOption("animated");
  await page.locator("#line-rights").check();
  const dl = page.waitForEvent("download");
  await page.locator("#sticker-zip").click();
  const file = await dl;
  await file.saveAs("/tmp/semantic-animation.zip");
  const files = entries(await readFile("/tmp/semantic-animation.zip"));
  expect(files["01.png"]).toBeTruthy();
  expect(files["03.png"]).toBeTruthy();
  await expect(page.locator("#pack-status")).toContainText("已下載");
});
test("identical captions can have independent manual poses in preview and exported files", async ({
  page,
}) => {
  await page
    .locator("#sticker-phrases")
    .fill("你好\n你好\n晚安\n謝謝\n加油\n開心\n愛你\n抱歉");
  await upload(page);
  await page
    .getByRole("combobox", { name: "第 1 張的情緒動作", exact: true })
    .selectOption("love");
  await page
    .getByRole("combobox", { name: "第 2 張的情緒動作", exact: true })
    .selectOption("angry");
  await expect(page.locator(".sticker-preview").nth(0)).toHaveAttribute(
    "data-intent",
    "love",
  );
  await expect(page.locator(".sticker-preview").nth(1)).toHaveAttribute(
    "data-intent",
    "angry",
  );
  await page.locator("#line-rights").check();
  const dl = page.waitForEvent("download");
  await page.locator("#sticker-zip").click();
  const file = await dl;
  await file.saveAs("/tmp/semantic-overrides.zip");
  const files = entries(await readFile("/tmp/semantic-overrides.zip"));
  expect(Buffer.compare(files["01.png"], files["02.png"])).not.toBe(0);
});
