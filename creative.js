import { crc32, pngInfo } from "./core.js";
export const ANIMATION_COUNTS = [8, 16, 24];
export const STICKER_STYLES = {
  daily: {
    name: "日常暖心",
    phrases: [
      "你好！",
      "謝謝你",
      "辛苦了",
      "沒問題",
      "加油！",
      "早安",
      "晚安",
      "好開心",
    ],
    color: "#b9cf9c",
  },
  funny: {
    name: "幽默吐槽",
    phrases: [
      "我先躺平",
      "笑到變形",
      "腦袋放假",
      "等等我啦",
      "這很可以",
      "已讀亂回",
      "吃飽再說",
      "小事先睡",
    ],
    color: "#f2bf73",
  },
  silly: {
    name: "搞笑崩潰",
    phrases: [
      "蛤？",
      "救命啊",
      "笑到起飛",
      "我就爛萌",
      "先不要",
      "原地裂開",
      "累成麻糬",
      "再五分鐘",
    ],
    color: "#dda6d9",
  },
  work: {
    name: "職場生存",
    phrases: [
      "收到！",
      "正在處理",
      "讓我想想",
      "明天再戰",
      "今天很棒",
      "需要咖啡",
      "準時下班",
      "感謝支援",
    ],
    color: "#9fbfdf",
  },
  cosmic: {
    name: "宇宙新創",
    phrases: [
      "靈感來了",
      "發射夢想",
      "星際充電",
      "宇宙級讚",
      "腦洞全開",
      "小步發明",
      "奇想啟動",
      "探索中",
    ],
    color: "#b6a8ed",
  },
  festive: {
    name: "節慶祝福",
    phrases: [
      "生日快樂",
      "平安喜樂",
      "好運來啦",
      "一起慶祝",
      "恭喜恭喜",
      "幸福滿滿",
      "願望成真",
      "心想事成",
    ],
    color: "#ecab9b",
  },
};
function join(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
export function pngChunks(bytes) {
  pngInfo(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    chunks = [];
  for (let o = 8; o + 12 <= bytes.length; ) {
    const n = view.getUint32(o),
      end = o + n + 12;
    if (end > bytes.length) throw Error("PNG chunk 不完整");
    const type = new TextDecoder().decode(bytes.slice(o + 4, o + 8));
    const data = bytes.slice(o + 8, o + 8 + n);
    if (crc32(bytes.slice(o + 4, o + 8 + n)) !== view.getUint32(o + 8 + n))
      throw Error("PNG CRC 不符");
    chunks.push({ type, data });
    o = end;
  }
  return chunks;
}
export function pngChunk(type, data) {
  const chunk = new Uint8Array(data.length + 12),
    v = new DataView(chunk.buffer);
  v.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  v.setUint32(data.length + 8, crc32(chunk.slice(4, data.length + 8)));
  return chunk;
}
export function makeApng(frames, { duration = 1000, loops = 2 } = {}) {
  if (
    frames.length < 5 ||
    frames.length > 20 ||
    !Number.isInteger(loops) ||
    loops < 1 ||
    loops > 4 ||
    ![1000, 2000, 3000, 4000].includes(duration) ||
    duration * loops > 4000
  )
    throw Error("動畫需 5–20 格，1–4 次播放，總時間 ≤4 秒且為整數秒");
  const parsed = frames.map(pngChunks),
    info = frames.map(pngInfo),
    first = info[0];
  if (
    info.some(
      (i) =>
        i.width !== first.width ||
        i.height !== first.height ||
        i.color !== first.color,
    )
  )
    throw Error("所有畫格尺寸與色彩類型必須一致");
  if (
    frames.every(
      (f) =>
        f.length === frames[0].length && f.every((b, i) => b === frames[0][i]),
    )
  )
    throw Error("所有畫格相同，沒有動畫效果");
  const control = new Uint8Array(8),
    cv = new DataView(control.buffer);
  cv.setUint32(0, frames.length);
  cv.setUint32(4, loops);
  const parts = [
    frames[0].slice(0, 8),
    pngChunk("IHDR", parsed[0].find((c) => c.type === "IHDR").data),
  ];
  for (const c of parsed[0])
    if (["pHYs", "sRGB"].includes(c.type)) parts.push(pngChunk(c.type, c.data));
  parts.push(pngChunk("acTL", control));
  let sequence = 0;
  parsed.forEach((chunks, index) => {
    const ctl = new Uint8Array(26),
      v = new DataView(ctl.buffer);
    v.setUint32(0, sequence++);
    v.setUint32(4, first.width);
    v.setUint32(8, first.height);
    v.setUint16(20, duration);
    v.setUint16(22, frames.length * 1000);
    ctl[24] = 0;
    ctl[25] = 0;
    parts.push(pngChunk("fcTL", ctl));
    for (const chunk of chunks.filter((c) => c.type === "IDAT")) {
      if (index === 0) parts.push(pngChunk("IDAT", chunk.data));
      else {
        const data = new Uint8Array(chunk.data.length + 4);
        new DataView(data.buffer).setUint32(0, sequence++);
        data.set(chunk.data, 4);
        parts.push(pngChunk("fdAT", data));
      }
    }
  });
  parts.push(pngChunk("IEND", new Uint8Array()));
  return join(parts);
}
export function animationInfo(bytes) {
  const chunks = pngChunks(bytes),
    actl = chunks.find((c) => c.type === "acTL");
  if (!actl) return null;
  const v = new DataView(actl.data.buffer);
  let seconds = 0;
  const controls = chunks.filter((c) => c.type === "fcTL");
  for (const c of controls) {
    const d = new DataView(c.data.buffer);
    seconds += d.getUint16(20) / (d.getUint16(22) || 100);
  }
  return {
    frames: v.getUint32(0),
    loops: v.getUint32(4),
    seconds: seconds * v.getUint32(4),
    controls: controls.length,
  };
}
export function removeEdgeBackground(
  data,
  width,
  height,
  tolerance = 40,
  feather = 8,
) {
  // Deterministic edge-connected color key. Never uploads images or claims semantic AI segmentation.
  const out = new Uint8ClampedArray(data),
    bins = new Map(),
    edge = [];
  for (let x = 0; x < width; x++) {
    edge.push(x, (height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++)
    edge.push(y * width, y * width + width - 1);
  for (const i of edge) {
    const o = i * 4;
    if (data[o + 3] < 32) continue;
    const k = [data[o], data[o + 1], data[o + 2]]
      .map((v) => Math.floor(v / 24))
      .join(",");
    const b = bins.get(k) || { count: 0, r: 0, g: 0, b: 0 };
    b.count++;
    b.r += data[o];
    b.g += data[o + 1];
    b.b += data[o + 2];
    bins.set(k, b);
  }
  const dominant = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return { data: out, removed: 0 };
  const bg = [dominant.r, dominant.g, dominant.b].map(
      (v) => v / dominant.count,
    ),
    seen = new Uint8Array(width * height),
    queue = new Uint32Array(width * height);
  let head = 0,
    tail = 0,
    removed = 0;
  const distance = (i) => {
    const o = i * 4;
    return Math.sqrt(
      (data[o] - bg[0]) ** 2 +
        (data[o + 1] - bg[1]) ** 2 +
        (data[o + 2] - bg[2]) ** 2,
    );
  };
  function add(i) {
    if (seen[i]) return;
    seen[i] = 1;
    if (data[i * 4 + 3] < 32 || distance(i) <= tolerance + feather)
      queue[tail++] = i;
  }
  edge.forEach(add);
  while (head < tail) {
    const i = queue[head++],
      d = distance(i),
      o = i * 4;
    const alpha = feather
      ? Math.max(0, Math.min(1, (d - tolerance) / feather))
      : 0;
    if (out[o + 3] > 0 && alpha < 1) removed++;
    out[o + 3] = Math.round(out[o + 3] * alpha);
    const x = i % width,
      y = Math.floor(i / width);
    if (x) add(i - 1);
    if (x + 1 < width) add(i + 1);
    if (y) add(i - width);
    if (y + 1 < height) add(i + width);
  }
  return { data: out, removed };
}
export function soundWave(style = "giggle", seconds = 1.2) {
  const rate = 22050,
    n = Math.floor(rate * seconds),
    bytes = new Uint8Array(44 + n * 2),
    v = new DataView(bytes.buffer),
    write = (o, s) => bytes.set(new TextEncoder().encode(s), o);
  write(0, "RIFF");
  v.setUint32(4, bytes.length - 8, true);
  write(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate,
      beat = t % 0.2,
      env =
        Math.sin(Math.PI * Math.min(1, beat / 0.17)) *
        Math.max(0, 1 - t / seconds);
    const f =
      style === "boing"
        ? 180 + 220 * Math.exp(-t * 5)
        : style === "sparkle"
          ? 700 + 800 * t
          : 400 + 100 * Math.sin(t * 30);
    v.setInt16(
      44 + i * 2,
      Math.sin(2 * Math.PI * f * t) * Math.max(0, env) * 10000,
      true,
    );
  }
  return bytes;
}
export function promptTask(prompt) {
  const target = /貼圖|sticker|角色/i.test(prompt)
    ? "sticker"
    : /影片|video|分鏡/i.test(prompt)
      ? "video"
      : /圖文|海報|卡片|poster|設計/i.test(prompt)
        ? "art"
        : "research";
  const style = /搞笑|幽默|吐槽/.test(prompt)
    ? "funny"
    : /宇宙|科技|未來/.test(prompt)
      ? "cosmic"
      : "daily";
  return {
    version: 1,
    target,
    prompt: prompt.trim(),
    style,
    steps: [
      "確認目標與素材授權",
      "在本站建立可編輯草稿",
      "預覽與調整作品",
      "自行下載並檢查成品",
    ],
  };
}
export function automationScript(url, selector = "", value = "") {
  const target = new URL(url);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password
  )
    throw Error("請使用無帳密的 HTTP(S) 網址");
  // JSON literals are used as JS data, never interpolated into executable source expressions.
  return `// 使用者自行執行：npm install playwright && npx playwright install chromium\n// 僅開啟指定網站、填入指定欄位、截圖；不會按送出、購買、刪除或自動登入。\nimport { chromium } from 'playwright';\nconst target = ${JSON.stringify(target.href)};\nconst allowedHost = ${JSON.stringify(target.host)};\nconst browser = await chromium.launch({headless:false});\ntry {\n const context = await browser.newContext({acceptDownloads:false});\n const page = await context.newPage();\n await page.route('**/*', route => {\n   const request = route.request();\n   if (request.isNavigationRequest() && request.frame()===page.mainFrame() && new URL(request.url()).host!==allowedHost) return route.abort();\n   return route.continue();\n });\n await page.goto(target);\n const selector = ${JSON.stringify(selector)};\n if(selector) await page.locator(selector).fill(${JSON.stringify(value)});\n await page.screenshot({path:'task-preview.png',fullPage:true});\n console.log('預覽完成。未送出任何表單；確認後可在瀏覽器人工接續。');\n await page.pause();\n} finally { await browser.close(); }\n`;
}
