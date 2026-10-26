import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { animationInfo } from "../creative.js";
import { pngInfo } from "../core.js";
let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
});
test.afterEach(() => expect(errors).toEqual([]));
const open = (p, name) =>
  p
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
function entries(buffer) {
  const files = {};
  let o = 0;
  while (buffer.readUInt32LE(o) === 0x04034b50) {
    const size = buffer.readUInt32LE(o + 18),
      namesize = buffer.readUInt16LE(o + 26),
      extra = buffer.readUInt16LE(o + 28),
      start = o + 30 + namesize + extra;
    files[buffer.subarray(o + 30, o + 30 + namesize).toString()] =
      new Uint8Array(buffer.subarray(start, start + size));
    o = start + size;
  }
  return files;
}
test("animated pack exports actual 10-frame APNG including main and static tab", async ({
  page,
}) => {
  await open(page, "LINE 貼圖工坊");
  await page.locator("#sticker-mode").selectOption("animated");
  await page.locator("#sticker-style").selectOption("funny");
  page.once("dialog", (d) => d.accept());
  await page.locator("#apply-sticker-style").click();
  await expect(page.locator("#sticker-phrases")).toHaveValue(/笑到變形/);
  await page.locator("#line-rights").check();
  const dl = page.waitForEvent("download");
  await page.locator("#sticker-zip").click();
  const f = await dl;
  await f.saveAs("/tmp/advanced-animation.zip");
  const files = entries(await readFile("/tmp/advanced-animation.zip"));
  expect(Object.keys(files)).toHaveLength(10);
  for (const name of ["01.png", "main.png"]) {
    expect(animationInfo(files[name]).frames).toBe(10);
    expect(animationInfo(files[name]).seconds).toBeCloseTo(2);
    expect(files[name].length).toBeLessThan(1024 * 1024);
  }
  expect(pngInfo(files["01.png"]).width).toBe(320);
  expect(pngInfo(files["main.png"]).height).toBe(240);
  expect(animationInfo(files["tab.png"])).toBeNull();
  await page.locator("#sticker-check-tab").click();
  await page.locator("#asset-kind").selectOption("animated");
  await page.locator("#asset-role").selectOption("main");
  await page.locator("#assets").setInputFiles({
    name: "main.png",
    mimeType: "image/png",
    buffer: Buffer.from(files["main.png"]),
  });
  await expect(page.locator("#asset-report")).toContainText("10 格");
  await expect(page.locator("#asset-report")).not.toContainText("✗");
});
test("sound mode explicitly exports separate audio and a concept preview", async ({
  page,
}) => {
  await open(page, "LINE 貼圖工坊");
  await page.locator("#sticker-mode").selectOption("sound");
  await expect(page.locator("#sound-panel")).toContainText("不能當作一般 LINE");
  await page.locator("#sound-play").click();
  await page.waitForFunction(
    () => document.querySelector("#sound-player").readyState >= 1,
  );
  await page.locator("#line-rights").check();
  const dl = page.waitForEvent("download");
  await page.locator("#sticker-zip").click();
  const f = await dl;
  expect(f.suggestedFilename()).toContain("不可直接送審");
  await f.saveAs("/tmp/advanced-sound.zip");
  const files = entries(await readFile("/tmp/advanced-sound.zip"));
  expect(files["sound.wav"].length).toBeGreaterThan(1000);
  expect(files["preview.html"]).toBeTruthy();
  expect(new TextDecoder().decode(files["README.txt"])).toContain("非 LINE");
});
test("automatic cutout removes plain background and manual brush can restore pixels", async ({
  page,
}) => {
  await open(page, "LINE 貼圖工坊");
  const buffer = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 200;
      c.height = 200;
      const x = c.getContext("2d");
      x.fillStyle = "white";
      x.fillRect(0, 0, 200, 200);
      x.fillStyle = "red";
      x.fillRect(60, 60, 80, 80);
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  await page
    .locator("#sticker-image")
    .setInputFiles({ name: "white.png", mimeType: "image/png", buffer });
  await expect(page.locator("#cutout-status")).toContainText("背景像素");
  expect(
    await page
      .locator("#cutout-canvas")
      .evaluate((c) => c.getContext("2d").getImageData(0, 0, 1, 1).data[3]),
  ).toBe(0);
  expect(
    await page
      .locator("#cutout-canvas")
      .evaluate((c) => c.getContext("2d").getImageData(100, 100, 1, 1).data[3]),
  ).toBe(255);
  await page.locator("#cutout-canvas").click();
  expect(
    await page
      .locator("#cutout-canvas")
      .evaluate((c) => c.getContext("2d").getImageData(100, 100, 1, 1).data[3]),
  ).toBe(0);
  await page.locator("#cutout-tool").selectOption("restore");
  await page.locator("#cutout-canvas").click();
  expect(
    await page
      .locator("#cutout-canvas")
      .evaluate((c) => c.getContext("2d").getImageData(100, 100, 1, 1).data[3]),
  ).toBe(255);
  const dl = page.waitForEvent("download");
  await page.locator("#cutout-download").click();
  expect((await dl).suggestedFilename()).toContain("去背");
});
test("six design templates differ and configuration survives save and reopen", async ({
  page,
}) => {
  await open(page, "圖文靈感所");
  const hashes = [];
  for (const style of [
    "minimal",
    "editorial",
    "gradient",
    "collage",
    "poster",
    "retro",
  ]) {
    await page.locator("#card-template").selectOption(style);
    await page.locator("#card-title").fill("創意設計");
    hashes.push(await page.locator("#card").evaluate((c) => c.toDataURL()));
  }
  expect(new Set(hashes).size).toBe(6);
  await page.locator("#palette").selectOption("rose");
  await page.locator("#card-font").selectOption("serif");
  await page.locator("#save-card").click();
  await page.reload();
  await page.getByRole("button", { name: "重開圖文設計" }).click();
  await expect(page.locator("#card-template")).toHaveValue("retro");
  await expect(page.locator("#palette")).toHaveValue("rose");
  await expect(page.locator("#card-font")).toHaveValue("serif");
});
test("prompt tasks create the intended internal studio and export bounded external automation", async ({
  page,
}) => {
  await open(page, "研發實驗室");
  await page.locator("#agent-prompt").fill("製作幽默動態貼圖");
  await page.locator("#agent-run").click();
  await expect(page.locator("#sticker-mode")).toHaveValue("animated");
  await expect(page.locator("#sticker-style")).toHaveValue("funny");
  await open(page, "研發實驗室");
  await page.locator("#agent-prompt").fill("設計復古咖啡海報");
  await page.getByText("外部網站／軟體工作流程", { exact: true }).click();
  await page.locator("#agent-url").fill("javascript:alert(1)");
  await page.locator("#agent-script").click();
  await expect(page.locator("#toast")).toContainText("HTTP");
  await page.locator("#agent-url").fill("https://example.com/editor");
  await page.locator("#agent-selector").fill("textarea");
  const dl = page.waitForEvent("download");
  await page.locator("#agent-script").click();
  const f = await dl;
  await f.saveAs("/tmp/advanced-automation.mjs");
  const script = await readFile("/tmp/advanced-automation.mjs", "utf8");
  expect(script).toContain("allowedHost");
  expect(script).not.toContain(".click(");
  await page.locator("#agent-run").click();
  await expect(page.locator("#card-template")).toHaveValue("retro");
});
test("work status, tags, duplication, bulk ZIP, kanban and undo are operational", async ({
  page,
}) => {
  await open(page, "創作成品館");
  await page.locator("#idea").fill("作品甲");
  await page.getByRole("button", { name: "儲存成品紀錄" }).click();
  await page
    .locator(".work")
    .getByRole("button", { name: "編輯", exact: true })
    .click();
  await page.locator("#edit-tags").fill("咖啡, 創意");
  await page.getByRole("button", { name: "儲存變更" }).click();
  await page.locator("#work-search").fill("咖啡");
  await expect(page.locator(".work")).toHaveCount(1);
  await page.getByRole("button", { name: "另存副本" }).click();
  await expect(page.locator(".work")).toHaveCount(2);
  await page.locator("#select-visible").check();
  await page.locator("#batch-done").click();
  await page.locator("#work-status").selectOption("done");
  await expect(page.locator(".work")).toHaveCount(2);
  const dl = page.waitForEvent("download");
  await page.locator("#batch-download").click();
  expect((await dl).suggestedFilename()).toMatch(/\.zip$/);
  await page.locator("#work-view").selectOption("board");
  await expect(page.locator(".board-column")).toHaveCount(4);
  page.once("dialog", (d) => d.accept());
  await page.locator("#batch-delete").click();
  await expect(page.locator(".work")).toHaveCount(0);
  await page.locator("#undo-delete").click();
  await expect(page.locator(".work")).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("export interrupted by studio change leaves new tools usable; mobile advanced tools fit", async ({
  page,
}) => {
  await open(page, "LINE 貼圖工坊");
  await page.locator("#sticker-mode").selectOption("animated");
  await page
    .locator("#sticker-phrases")
    .fill(Array.from({ length: 24 }, (_, i) => "第" + i + "張").join("\n"));
  await page.locator("#line-rights").check();
  await page.locator("#sticker-zip").click();
  await open(page, "圖文靈感所");
  await page.locator("#card-title").fill("繼續創作");
  await expect(page.locator("#art-status")).toContainText("即時預覽");
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const name of ["LINE 貼圖工坊", "圖文靈感所", "研發實驗室"]) {
    await open(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: "/tmp/advanced-mobile.png", fullPage: true });
});
