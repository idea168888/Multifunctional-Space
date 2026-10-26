import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const errors = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
});
test.afterEach(() => expect(errors).toEqual([]));
async function open(page, name) {
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
}
async function png(page, w = 240, h = 240, blank = false) {
  return Buffer.from(
    await page.evaluate(
      ({ w, h, blank }) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        if (!blank) {
          const x = c.getContext("2d");
          x.fillStyle = "green";
          x.fillRect(20, 20, w - 40, h - 40);
        }
        return c.toDataURL().split(",")[1];
      },
      { w, h, blank },
    ),
    "base64",
  );
}
test("planner drafts persist across topic switches and reload; saved works edit, search, favorite, delete", async ({
  page,
}) => {
  await open(page, "影片創作室");
  await page.locator("#idea").fill("城市森林");
  await page.locator("#details").fill("給孩子的環保故事");
  await page.getByRole("button", { name: "產生可編輯草稿" }).click();
  await page.locator("#plan-text").fill("我的完整分鏡");
  await page.getByRole("button", { name: "收藏／更新草稿" }).click();
  await expect(page.locator(".work")).toHaveCount(1);
  await open(page, "研發實驗室");
  await page.locator("#idea").fill("實驗一");
  await open(page, "影片創作室");
  await expect(page.locator("#idea")).toHaveValue("城市森林");
  await expect(page.locator("#plan-text")).toHaveValue("我的完整分鏡");
  await page.reload();
  await open(page, "影片創作室");
  await expect(page.locator("#plan-text")).toHaveValue("我的完整分鏡");
  await page
    .locator(".work")
    .getByRole("button", { name: "編輯", exact: true })
    .click();
  await page.locator("#edit-title").fill("修改後的故事");
  await page.locator("#edit-body").fill("修改內容");
  await page.getByRole("button", { name: "儲存變更" }).click();
  await page
    .locator(".work")
    .getByRole("button", { name: "☆ 收藏", exact: true })
    .click();
  await page.locator("#favorite-only").check();
  await page.locator("#work-search").fill("修改後");
  await expect(page.locator(".work")).toHaveCount(1);
  await page.locator("#work-search").fill("找不到");
  await expect(page.locator(".work")).toHaveCount(0);
  await page.locator("#work-search").fill("");
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".work")
    .getByRole("button", { name: "刪除", exact: true })
    .click();
  await expect(page.locator(".work")).toHaveCount(0);
});
test("art edits live, exports correct size, reopens saved configuration and survives switching", async ({
  page,
}) => {
  await open(page, "圖文靈感所");
  await page.locator("#card-title").fill("新的卡片");
  await page.locator("#card-size").selectOption("portrait");
  await expect(page.locator("#card")).toHaveAttribute("height", "1920");
  const dl = page.waitForEvent("download");
  await page.locator("#png").click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  await page.locator("#save-card").click();
  await page
    .locator(".work")
    .getByRole("button", { name: "重開圖文設計" })
    .click();
  await expect(page.locator("#card-title")).toHaveValue("新的卡片");
  await expect(page.locator("#card-size")).toHaveValue("portrait");
  await open(page, "LINE 貼圖工坊");
  await page.locator("#line-title").fill("測試");
  await open(page, "圖文靈感所");
  await page.locator("#card-title").fill("繼續編輯");
  await expect(page.locator("#art-status")).toContainText("即時預覽");
});
test("sticker checks reject blank/odd images and generated ZIP is downloadable", async ({
  page,
}) => {
  await open(page, "LINE 貼圖工坊");
  await page.locator("#sticker-check-tab").click();
  await page.locator("#asset-role").selectOption("main");
  await page.locator("#assets").setInputFiles({
    name: "blank.png",
    mimeType: "image/png",
    buffer: await png(page, 240, 240, true),
  });
  await expect(page.locator("#asset-report")).toContainText("圖片完全空白");
  await page.locator("#asset-role").selectOption("sticker");
  await page.locator("#assets").setInputFiles({
    name: "odd.png",
    mimeType: "image/png",
    buffer: await png(page, 369, 320),
  });
  await expect(page.locator("#asset-report")).toContainText("尺寸不符");
  await page.locator("#sticker-create-tab").click();
  await page.locator("#line-rights").check();
  const dl = page.waitForEvent("download");
  await page.locator("#sticker-zip").click();
  const f = await dl;
  await f.saveAs("/tmp/space-stickers-test.zip");
  const bytes = await readFile("/tmp/space-stickers-test.zip");
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(bytes.readUInt16LE(bytes.length - 12)).toBe(10);
  await expect(page.locator("#pack-status")).toContainText("10 張 PNG");
  await page.locator("#line-title").fill("你".repeat(21));
  await page.locator("#line-creator").fill("Author");
  await page.locator("#line-description").fill("Test");
  await page.locator("#line-copyright").fill("2026 Author");
  await page.locator("#save-line-meta").click();
  await expect(page.locator("#toast")).toContainText("超過");
});
test("themes can be renamed/deleted, imported HTML remains text", async ({
  page,
}) => {
  await page.locator("#add-theme").click();
  await page.locator("#theme-name").fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "儲存主題" }).click();
  await expect(page.locator("#theme-grid img")).toHaveCount(0);
  await page.getByRole("button", { name: /管理主題：/ }).click();
  await page.locator("#theme-name").fill("音樂");
  await page.getByRole("button", { name: "儲存主題" }).click();
  await open(page, "音樂");
  await page.locator("#idea").fill("小夜曲");
  await page.getByRole("button", { name: "產生可編輯草稿" }).click();
  await page.getByRole("button", { name: "收藏／更新草稿" }).click();
  await page.getByRole("button", { name: "管理主題：音樂" }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#remove-theme").click();
  await expect(page.locator(".work")).toContainText("創作成品館");
  await expect(page.locator("#studio")).toBeHidden();
});
test("backup validates before importing, merges and does not duplicate IDs", async ({
  page,
}) => {
  const backup = {
    themes: [],
    works: [
      {
        id: "legacy",
        title: "舊作品",
        body: "內容",
        type: "finished",
        date: "2026-10-26T00:00:00Z",
      },
    ],
  };
  await page.locator("#import-file").setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.locator("#merge-backup").click();
  await expect(page.locator(".work")).toHaveCount(1);
  await page.locator("#import-file").setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.locator("#merge-backup").click();
  await expect(page.locator(".work")).toHaveCount(1);
  await page.locator("#import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"themes":[],"works":[null]}'),
  });
  await expect(page.locator("#toast")).toContainText("無法匯入");
  await expect(page.locator(".work")).toHaveCount(1);
  const dl = page.waitForEvent("download");
  await page.locator("#export").click();
  expect((await dl).suggestedFilename()).toMatch(/\.json$/);
});
test("storage failure does not claim success or add phantom works", async ({
  page,
}) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("quota");
    };
  });
  await open(page, "創作成品館");
  await page.locator("#idea").fill("不能儲存的作品");
  await page.getByRole("button", { name: "儲存成品紀錄" }).click();
  await expect(page.locator("#toast")).toContainText("儲存失敗");
  await expect(page.locator(".work")).toHaveCount(0);
});
test("QR supports unicode, downloads SVG, rejects unsafe URLs; responsive widths", async ({
  page,
}) => {
  await page.locator("#share").click();
  await page.locator("#share-url").fill("https://example.com/多元智能空間");
  await expect(page.locator("#qr svg")).toHaveCount(1);
  const dl = page.waitForEvent("download");
  await page.locator("#download-qr").click();
  expect((await dl).suggestedFilename()).toMatch(/\.svg$/);
  await page.locator("#share-url").fill("javascript:alert(1)");
  await expect(page.locator("#download-qr")).toBeDisabled();
  await page.locator("#close-modal").click();
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: "/tmp/space-after.png", fullPage: true });
});
test("photo video reorder, cancel and complete an actual playable export", async ({
  page,
}) => {
  await open(page, "影片創作室");
  const buffer = await png(page);
  await page.locator("#video-files").setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer },
    { name: "b.png", mimeType: "image/png", buffer },
  ]);
  await expect(page.locator(".video-item")).toHaveCount(2);
  await page
    .getByRole("button", { name: "向後移動第 1 張", exact: true })
    .click();
  await expect(page.locator(".video-item").first()).toContainText("b.png");
  await page.getByRole("button", { name: "移除第 2 張", exact: true }).click();
  await page.locator("#duration").selectOption("2");
  await page.locator("#video-ratio").selectOption("square");
  await page.locator("#video-captions").fill("一張照片的故事");
  await page.locator("#render-video").click();
  await page.locator("#cancel-video").click();
  await expect(page.locator("#video-status")).toContainText("已取消");
  await expect(page.locator("#render-video")).toBeEnabled();
  const dl = page.waitForEvent("download");
  await page.locator("#render-video").click();
  const file = await dl;
  await file.saveAs(
    "/tmp/space-video-test." +
      (file.suggestedFilename().endsWith("mp4") ? "mp4" : "webm"),
  );
  await expect(page.locator("#video-status")).toContainText("完成");
  await expect(page.locator("#video-result")).toBeVisible();
  await page.waitForFunction(
    () => document.querySelector("#video-result").readyState >= 1,
  );
  expect(
    await page.locator("#video-result").evaluate((e) => e.videoWidth),
  ).toBe(720);
  await expect(page.locator(".work")).toHaveCount(1);
});
test("video accepts soundtrack and retains safe reorder boundaries after export", async ({
  page,
}) => {
  await open(page, "影片創作室");
  await page.locator("#video-files").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: await png(page),
  });
  const rate = 8000,
    samples = rate,
    bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    bytes.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 440) / rate) * 5000),
      44 + i * 2,
    );
  await page
    .locator("#video-audio")
    .setInputFiles({ name: "tone.wav", mimeType: "audio/wav", buffer: bytes });
  await page.locator("#duration").selectOption("2");
  const dl = page.waitForEvent("download");
  await page.locator("#render-video").click();
  const file = await dl;
  await file.saveAs(
    "/tmp/space-video-audio." +
      (file.suggestedFilename().endsWith("mp4") ? "mp4" : "webm"),
  );
  await expect(page.locator("#video-status")).toContainText("完成");
  await expect(
    page.getByRole("button", { name: "向前移動第 1 張", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "向後移動第 1 張", exact: true }),
  ).toBeDisabled();
});
test("research records custom hypothesis and result; long art fits; mobile studios do not overflow", async ({
  page,
}) => {
  await open(page, "研發實驗室");
  await page.locator("#idea").fill("節省用水");
  await page.locator("#hypothesis").fill("使用定量杯可減少用水");
  await page.locator("#findings").fill("測試三次，節省 20%");
  await page.getByRole("button", { name: "產生可編輯草稿" }).click();
  await expect(page.locator("#plan-text")).toHaveValue(/節省 20%/);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const name of [
    "LINE 貼圖工坊",
    "圖文靈感所",
    "影片創作室",
    "研發實驗室",
  ]) {
    await open(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await open(page, "圖文靈感所");
  await page.locator("#card-text").fill("測試長文".repeat(100));
  await expect(page.locator("#art-status")).toContainText("即時預覽");
  await page.locator("#card-text").fill("\n".repeat(100));
  await expect(page.locator("#art-status")).toContainText("部分文字");
  await page.locator("#png").click();
  await expect(page.locator("#toast")).toContainText("縮短文字");
});
test("malformed stored data is preserved instead of silently overwritten", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem("multi-space-v1", "broken-backup"),
  );
  await page.reload();
  await expect(page.locator("#data-warning")).toBeVisible();
  await open(page, "創作成品館");
  await page.locator("#idea").fill("新作品");
  await page.getByRole("button", { name: "儲存成品紀錄" }).click();
  await expect(page.locator("#toast")).toContainText("儲存失敗");
  expect(
    await page.evaluate(() => localStorage.getItem("multi-space-v1")),
  ).toBe("broken-backup");
});
test("unknown imported select values do not corrupt future saved card configurations", async ({
  page,
}) => {
  const backup = {
    themes: [],
    works: [],
    drafts: {
      art: {
        "card-title": "有效標題",
        "card-text": "內容",
        palette: "unknown",
        "card-size": "invalid",
        "card-align": "unknown",
      },
    },
  };
  await page.locator("#import-file").setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.locator("#merge-backup").click();
  await open(page, "圖文靈感所");
  await expect(page.locator("#card-title")).toHaveValue("有效標題");
  await expect(page.locator("#palette")).toHaveValue("green");
  await page.locator("#save-card").click();
  await page.reload();
  await expect(page.locator("#data-warning")).toBeHidden();
  await expect(page.locator(".work")).toHaveCount(1);
});
