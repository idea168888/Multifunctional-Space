import { designBackdrop, DESIGN_STYLES, DESIGN_PALETTES } from "./designs.js";
import {
  makeApng,
  animationInfo,
  removeEdgeBackground,
  STICKER_STYLES,
  ANIMATION_COUNTS,
  soundWave,
} from "./creative.js";
import {
  COUNTS,
  LIMIT,
  metadataIssues,
  lineTextLength,
  pngInfo,
  pngWithDpi,
  stickerDimensions,
  alphaBounds,
  makeZip,
} from "./core.js";
const $ = (s, root = document) => root.querySelector(s);
const palettes = {
  green: ["#e9efdf", "#245648"],
  sand: ["#f5e7cd", "#76502e"],
  night: ["#253750", "#f5e9d3"],
};
function canvasBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("圖片輸出失敗"))),
      "image/png",
    ),
  );
}
async function pngBytes(canvas) {
  return pngWithDpi(
    new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()),
  );
}
async function loadImage(file, maxPixels = 16000000) {
  if (file.size > 10 * 1024 * 1024) throw Error("每張圖片請小於 10 MB");
  let image;
  if (window.createImageBitmap) image = await createImageBitmap(file);
  else {
    image = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file),
        img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(Error("圖片無法讀取"));
      };
      img.src = url;
    });
    image.close = () => {};
  }
  if (image.width * image.height > maxPixels) {
    image.close();
    throw Error("圖片超過 1600 萬像素，請先縮小");
  }
  return image;
}
function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const char of para) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = char;
      } else line += char;
    }
    lines.push(line);
  }
  return lines;
}
function fitText(
  ctx,
  text,
  {
    x,
    y,
    width,
    height,
    size = 54,
    min = 16,
    color = "#fff",
    align = "left",
    weight = "normal",
    family = "sans-serif",
  },
) {
  let lines;
  for (; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrap(ctx, text, width);
    if (lines.length * size * 1.5 <= height) break;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const lineHeight = size * 1.5,
    maxLines = Math.floor(height / lineHeight);
  lines
    .slice(0, maxLines)
    .forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return lines.length <= maxLines;
}
function contain(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const width = img.width * scale,
    height = img.height * scale;
  ctx.drawImage(img, x + (w - width) / 2, y + (h - height) / 2, width, height);
}
export function mountArt(root, api, work) {
  root.innerHTML = `<div class="editor-layout"><form id="art-form"><label for="card-title">標題（最多 60 字）</label><input id="card-title" maxlength="60" value="給今天一點新的可能"><label for="card-text">內文（最多 500 字，自動調整字級）</label><textarea id="card-text" maxlength="500" rows="5">慢慢來，也是在前進。\n讓每一個小小的靈感，都有發生的空間。</textarea><div class="form-grid"><div><label for="palette">配色</label><select id="palette"><option value="green">森林綠</option><option value="sand">暖沙色</option><option value="night">午夜藍</option><option value="rose">玫瑰粉</option><option value="lilac">薰衣草紫</option><option value="ocean">海洋藍</option></select></div><div><label for="card-size">尺寸</label><select id="card-size"><option value="square">正方形 1080 × 1080</option><option value="portrait">直式 1080 × 1920</option><option value="landscape">橫式 1920 × 1080</option></select></div><div><label for="card-align">文字對齊</label><select id="card-align"><option value="center">置中</option><option value="left">靠左</option></select></div><div><label for="card-template">設計版型</label><select id="card-template"><option value="minimal">留白極簡</option><option value="editorial">雜誌編輯</option><option value="gradient">夢幻漸層</option><option value="collage">拼貼手帳</option><option value="poster">幾何海報</option><option value="retro">復古印刷</option></select></div><div><label for="card-font">字體風格</label><select id="card-font"><option value="sans">現代黑體</option><option value="serif">文藝襯線</option><option value="mono">科技等寬</option></select></div><div><label for="card-accent">點綴色</label><input id="card-accent" type="color" value="#d68b56"></div><div><label for="card-kicker">頁眉短句</label><input id="card-kicker" maxlength="40" value="CREATIVE NOTES / 靈感日誌"></div><div><label for="card-image">背景圖片（選填）</label><input id="card-image" type="file" accept="image/png,image/jpeg,image/webp"></div></div><button id="clear-image" type="button" class="small">移除背景圖片</button><p class="muted">背景圖片僅在本次編輯使用，收藏與備份保留文字、配色及版型。請另行下載完成圖片。</p><div class="row"><button type="button" id="png" class="button">下載 PNG ↓</button><button id="save-card" type="submit" class="small">收藏／更新設計</button></div><p id="art-status" role="status" class="muted"></p></form><div><canvas id="card" class="preview" width="1080" height="1080" aria-label="圖文作品即時預覽"></canvas></div></div>`;
  const c = $("#card", root),
    ctx = c.getContext("2d");
  let image = null,
    loadVersion = 0,
    disposed = false,
    savedId = work?.id || null;
  if (work?.art) {
    $("#card-title").value = work.art.title;
    $("#card-text").value = work.art.text;
    $("#palette").value = work.art.palette;
    $("#card-size").value = work.art.size;
    $("#card-align").value = work.art.align;
    $("#card-template").value = work.art.template || "minimal";
    $("#card-font").value = work.art.font || "sans";
    $("#card-accent").value = work.art.accent || "#d68b56";
    $("#card-kicker").value = work.art.kicker || "CREATIVE NOTES / 靈感日誌";
  }
  function config() {
    return {
      title: $("#card-title").value,
      text: $("#card-text").value,
      palette: $("#palette").value,
      size: $("#card-size").value,
      align: $("#card-align").value,
      template: $("#card-template").value,
      font: $("#card-font").value,
      accent: $("#card-accent").value,
      kicker: $("#card-kicker").value,
    };
  }
  function draw() {
    const a = config(),
      sizes = {
        square: [1080, 1080],
        portrait: [1080, 1920],
        landscape: [1920, 1080],
      },
      [w, h] = sizes[a.size] || sizes.square;
    c.width = w;
    c.height = h;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const { fg } = designBackdrop(ctx, w, h, a, image);
    const family =
      { sans: "sans-serif", serif: "serif", mono: "monospace" }[a.font] ||
      "sans-serif";
    const x = a.align === "center" ? w / 2 : 100;
    const titleOK = fitText(ctx, a.title, {
      x,
      y: h * 0.25,
      width: w - 200,
      height: h * 0.2,
      size: 66,
      min: 24,
      color: fg,
      align: a.align,
      weight: "bold",
      family,
    });
    const textOK = fitText(ctx, a.text, {
      x,
      y: h * 0.48,
      width: w - 200,
      height: h * 0.36,
      size: 36,
      min: 16,
      color: fg,
      align: a.align,
      family,
    });
    ctx.font = "20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("多元智能空間 / MADE BY YOU", 100, h - 100);
    $("#art-status").textContent =
      titleOK && textOK
        ? `${w} × ${h} px · 即時預覽已更新`
        : "內容太長，部分文字無法顯示；請縮短或改用直式版型。";
    return titleOK && textOK;
  }
  root.addEventListener("input", (e) => {
    if (e.target.type !== "file") draw();
  });
  root.addEventListener("restore-draft", draw);
  $("#card-image").onchange = async (e) => {
    const version = ++loadVersion,
      file = e.target.files[0];
    if (!file) return;
    try {
      const loaded = await loadImage(file);
      if (disposed || version !== loadVersion) {
        loaded.close();
        return;
      }
      image?.close();
      image = loaded;
      draw();
    } catch (err) {
      api.toast(err.message);
      e.target.value = "";
    }
  };
  $("#clear-image").onclick = () => {
    loadVersion++;
    image?.close();
    image = null;
    $("#card-image").value = "";
    draw();
  };
  $("#png").onclick = async () => {
    try {
      if (!draw()) return api.toast("請先縮短文字，避免成品截斷");
      api.download(await pngBytes(c), "多元智能空間-圖文.png", "image/png");
    } catch (e) {
      api.toast(e.message);
    }
  };
  $("#art-form").onsubmit = (e) => {
    e.preventDefault();
    if (!draw()) return api.toast("請先縮短文字");
    const a = config();
    if (!a.title.trim()) return api.toast("請填寫作品標題");
    const id = api.saveWork(a.title, a.text, "art", {
      art: a,
      ...(savedId ? { id: savedId } : {}),
    });
    if (id) savedId = id;
  };
  draw();
  return () => {
    disposed = true;
    loadVersion++;
    image?.close();
  };
}
export function mountStickers(root, api) {
  const $ = (selector) => root.querySelector(selector);
  root.innerHTML = `<div class="notice">靜態／動態貼圖工具。規格已於 2026-10-26 對照 <a href="https://creator.line.me/zh-hant/guideline/sticker/" target="_blank" rel="noopener">LINE 官方製作準則 ↗</a>；實際送審仍以官方最新規定為準，不代表審核通過。</div><details><summary>查看完整規格與送審注意事項</summary><p><a href="https://creator.line.me/zh-hant/guideline/animationsticker/" target="_blank" rel="noopener">LINE 官方動態貼圖規格 ↗</a>：8／16／24 張、最大 320×270 且一邊 ≥270、5–20 格、播放 1–4 次且總時間 ≤4 秒；主圖 APNG 240×240，標籤靜態 PNG。</p><ul class="rule-list"><li>貼圖 8、16、24、32 或 40 張，最大 370×320 px，寬高均為偶數。</li><li>主圖 240×240 px；聊天室標籤 96×74 px。所有圖片 PNG、RGB、72 dpi 以上，每張 ≤1 MB，ZIP 小於 60 MB。</li><li>圖案去背透明；四周保留約 10 px 留白。空白圖片或只有透明像素不能作為貼圖。</li><li>名稱 40、創意人 50、說明 160、版權 50 字以內；全形算 2 字，不支援表情符號。版權使用英文或數字。</li><li>不得侵權、放入其他通訊服務名稱或違反內容準則。請另外確認 <a href="https://creator.line.me/zh-hant/review_guideline/" target="_blank" rel="noopener">官方審核準則 ↗</a>。</li></ul></details><div class="tool-tabs" role="group" aria-label="貼圖工具"><button id="sticker-create-tab" class="small" aria-pressed="true">製作與打包</button><button id="sticker-check-tab" class="small" aria-pressed="false">檢查現有 PNG</button></div><section id="sticker-create"><h3>製作一組對話貼圖</h3><p class="muted">使用自己的圖片與文字。上傳後可自動去背、手動修邊；無法保證複雜背景完全準確。</p><div class="form-grid"><div><label for="sticker-mode">整組模式</label><select id="sticker-mode"><option value="static">靜態 PNG（8–40 張）</option><option value="animated">動態 APNG（8／16／24 張）</option><option value="sound">有聲創作概念（非 LINE 送審包）</option></select></div><div><label for="sticker-style">創意風格</label><select id="sticker-style"><option value="daily">日常暖心</option><option value="funny">幽默吐槽</option><option value="silly">搞笑崩潰</option><option value="work">職場生存</option><option value="cosmic">宇宙新創</option><option value="festive">節慶祝福</option></select></div><div><label for="sticker-motion">動態效果</label><select id="sticker-motion"><option value="bounce">彈跳撒嬌</option><option value="shake">左右搖擺</option><option value="pulse">驚喜放大</option><option value="wobble">搞怪扭動</option></select></div><div><label for="sticker-loops">播放設定</label><select id="sticker-loops"><option value="2">1 秒 × 2 次（共 2 秒）</option><option value="1">1 秒 × 1 次</option><option value="4">1 秒 × 4 次</option></select></div></div><button id="apply-sticker-style" class="small">套用風格文案（取代目前文字）</button><p id="sticker-mode-note" class="notice" role="status"></p><label for="sticker-phrases">每行一張貼圖，需 8／16／24／32／40 行（每行最多 20 字）</label><textarea id="sticker-phrases" rows="8" maxlength="2000">你好！\n謝謝你\n辛苦了\n沒問題\n加油！\n早安\n晚安\n好開心</textarea><div class="form-grid"><div><label for="sticker-color">角色顏色</label><input id="sticker-color" type="color" value="#b9cf9c"></div><div><label for="sticker-character">角色造型</label><select id="sticker-character"><option value="blob">軟萌糰子</option><option value="cat">吐槽貓咪</option><option value="rabbit">元氣兔兔</option><option value="robot">靈感機器人</option><option value="star">宇宙小星星</option></select></div><div><label for="sticker-expression">表情</label><select id="sticker-expression"><option value="auto">每張自動變化</option><option value="happy">開心微笑</option><option value="surprise">驚訝呆萌</option><option value="sleep">慵懶想睡</option><option value="laugh">笑到閉眼</option></select></div><div><label for="sticker-image">自有角色圖片（選填）</label><input id="sticker-image" type="file" accept="image/png,image/jpeg,image/webp"></div></div><div class="cutout-panel"><h4>自動去背與修邊</h4><label class="check"><input id="cutout-auto" type="checkbox" checked>上傳後自動去除四邊相近背景色</label><div class="form-grid"><div><label for="cutout-tolerance">去背容差</label><input id="cutout-tolerance" type="range" min="5" max="150" value="40"></div><div><label for="cutout-feather">邊緣柔化</label><input id="cutout-feather" type="range" min="0" max="30" value="8"></div><div><label for="cutout-tool">手動筆刷</label><select id="cutout-tool"><option value="erase">擦除背景</option><option value="restore">恢復原圖</option></select></div><div><label for="cutout-brush">筆刷大小</label><input id="cutout-brush" type="range" min="5" max="100" value="35"></div></div><div class="work-actions"><button id="cutout-run" class="small">重新自動去背</button><button id="cutout-reset" class="small">恢復原圖</button><button id="cutout-download" class="small">下載透明 PNG</button></div><canvas id="cutout-canvas" width="300" height="220" hidden aria-label="去背預覽，可用筆刷修邊"></canvas><p id="cutout-status" class="muted" role="status">適合單色或簡單背景；複雜背景、同色主體與髮絲需手動修邊。圖片不會上傳。</p></div><section id="sound-panel" hidden><h4>有聲概念試作</h4><p class="notice">APNG 本身不能嵌入音訊。此模式輸出動畫＋獨立音效與試播頁，不能當作一般 LINE 貼圖 ZIP 送審；是否開放有聲商品需向 LINE 確認。</p><label for="sound-effect">原創電子音效</label><select id="sound-effect"><option value="giggle">俏皮電子笑聲</option><option value="boing">彈簧搞笑音</option><option value="sparkle">靈感星光音</option></select><label for="sound-file">或上傳自己的音訊（≤10 MB）</label><input id="sound-file" type="file" accept="audio/*"><div class="work-actions"><button id="sound-play" class="small">試聽音效</button><button id="sound-download" class="small">下載音效</button></div><audio id="sound-player" controls></audio></section><button id="sticker-clear-image" class="small">移除角色圖片</button><div class="row"><button id="sticker-preview" class="button">更新整組預覽</button><button id="sticker-zip" class="small">下載素材 ZIP ↓</button></div><div id="sticker-previews" class="sticker-previews"></div><p id="pack-status" role="status" class="muted"></p></section><section id="sticker-check" hidden><h3>檢查你的現有素材</h3><label for="asset-kind">素材類型</label><select id="asset-kind"><option value="static">靜態 PNG</option><option value="animated">動態 APNG</option></select><label for="asset-role">檔案用途</label><select id="asset-role"><option value="sticker">貼圖圖片（整組）</option><option value="main">主要圖片</option><option value="tab">聊天室標籤圖片</option></select><label for="assets">選擇 PNG（本機處理）</label><input id="assets" type="file" accept="image/png" multiple><div id="asset-report" role="status" class="result">尚未選取圖片。</div><button id="save-sticker" class="small">儲存檢查紀錄</button><p class="muted">自動檢查格式、尺寸、張數、色彩類型、大小、透明度、空白內容、留白及 DPI。DPI 未標示時需另行確認。</p></section><hr><h3>送審資料準備</h3><div class="form-grid"><div><label for="line-title">貼圖名稱</label><input id="line-title" maxlength="40" placeholder="我的日常小夥伴"></div><div><label for="line-creator">創意人名稱</label><input id="line-creator" maxlength="50"></div><div><label for="line-description">貼圖說明</label><textarea id="line-description" maxlength="160"></textarea></div><div><label for="line-copyright">版權（英文／數字）</label><input id="line-copyright" maxlength="50" placeholder="2026 YourName"></div></div><p id="metadata-status" role="status" class="muted"></p><label class="check"><input id="line-rights" type="checkbox">我已確認素材原創或取得商用授權，並人工檢查內容、可讀性與 LINE 審核準則。</label><div class="row"><button id="save-line-meta" class="small">檢查並下載送審文字</button><a class="button" href="https://creator.line.me/zh-hant/" target="_blank" rel="noopener">前往 LINE Creators Market ↗</a></div><p class="muted">ZIP 為圖片素材，送審文字另存 TXT。實際上架需登入 LINE，建立商品、填寫資料、上傳素材並申請審核；本網站不會代為送出。</p>`;
  let source = null,
    disposed = false,
    imageVersion = 0,
    checkVersion = 0,
    report = "",
    packVersion = 0,
    original = null,
    soundUrl = null,
    drawing = false,
    packing = false;
  const switchTab = (create) => {
    $("#sticker-create").hidden = !create;
    $("#sticker-check").hidden = create;
    $("#sticker-create-tab").setAttribute("aria-pressed", String(create));
    $("#sticker-check-tab").setAttribute("aria-pressed", String(!create));
  };
  $("#sticker-create-tab").onclick = () => switchTab(true);
  $("#sticker-check-tab").onclick = () => switchTab(false);
  function phrases() {
    const list = $("#sticker-phrases")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed =
      $("#sticker-mode").value === "static" ? COUNTS : ANIMATION_COUNTS;
    if (!allowed.includes(list.length))
      throw Error("此模式需 " + allowed.join("／") + " 張；請調整文字行數");
    if (list.some((s) => [...s].length > 20)) throw Error("每行最多 20 字");
    return list;
  }
  function renderSticker(text, w = 370, h = 320) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.clearRect(0, 0, w, h);
    if (source) contain(x, source, 26, 75, w - 52, h - 105);
    else {
      x.fillStyle = $("#sticker-color").value;
      x.strokeStyle = "#284537";
      x.lineWidth = 4;
      x.beginPath();
      const character = $("#sticker-character").value;
      if (character === "star") {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5,
            r = i % 2 ? 50 : 100;
          const px = 185 + Math.cos(a) * r,
            py = 195 + Math.sin(a) * r;
          i ? x.lineTo(px, py) : x.moveTo(px, py);
        }
        x.closePath();
      } else x.roundRect(90, 100, 190, 190, character === "robot" ? 20 : 65);
      x.fill();
      x.stroke();
      if (character === "cat") {
        for (const [px, dir] of [
          [110, -1],
          [260, 1],
        ]) {
          x.beginPath();
          x.moveTo(px - 20, 135);
          x.lineTo(px + dir * 5, 82);
          x.lineTo(px + 25, 125);
          x.closePath();
          x.fill();
          x.stroke();
        }
      }
      if (character === "rabbit") {
        for (const px of [135, 230]) {
          x.beginPath();
          x.ellipse(px, 103, 18, 35, px === 135 ? -0.2 : 0.2, 0, Math.PI * 2);
          x.fill();
          x.stroke();
        }
      }
      if (character === "robot") {
        x.beginPath();
        x.moveTo(185, 100);
        x.lineTo(185, 80);
        x.stroke();
        x.beginPath();
        x.arc(185, 80, 6, 0, Math.PI * 2);
        x.fill();
      }
      const expression =
        $("#sticker-expression").value === "auto"
          ? ["happy", "surprise", "sleep", "laugh"][
              [...text].reduce((n, c) => n + c.codePointAt(0), 0) % 4
            ]
          : $("#sticker-expression").value;
      x.fillStyle = "#284537";
      for (const px of [150, 220]) {
        x.beginPath();
        if (expression === "sleep") {
          x.moveTo(px - 9, 180);
          x.lineTo(px + 9, 180);
          x.stroke();
        } else if (expression === "laugh") {
          x.arc(px, 182, 10, Math.PI, Math.PI * 2);
          x.stroke();
        } else {
          x.arc(px, 180, expression === "surprise" ? 11 : 8, 0, Math.PI * 2);
          x.fill();
        }
      }
      x.beginPath();
      if (expression === "surprise")
        x.ellipse(185, 220, 12, 18, 0, 0, Math.PI * 2);
      else if (expression === "sleep") {
        x.moveTo(170, 220);
        x.lineTo(200, 220);
      } else x.arc(185, 206, 20, 0, Math.PI);
      x.stroke();
    }
    fitText(x, text, {
      x: w / 2,
      y: 20,
      width: w - 40,
      height: 65,
      size: 38,
      min: 16,
      color: "#284537",
      align: "center",
      weight: "bold",
    });
    if ($("#sticker-mode").value !== "static") {
      const output = document.createElement("canvas");
      output.width = 320;
      output.height = 270;
      contain(output.getContext("2d"), c, 10, 10, 300, 250);
      return output;
    }
    return c;
  }
  function modeNote() {
    const mode = $("#sticker-mode").value;
    $("#sticker-mode-note").textContent =
      mode === "static"
        ? "靜態：最大 370×320、8／16／24／32／40 張。"
        : mode === "animated"
          ? "動態：APNG 320×270，10 格，1 秒 × 1／2／4 次；主圖也為 APNG，標籤為靜態 PNG。請人工檢查動態效果及 LINE 最新規則。"
          : "有聲概念：動畫與音訊分開輸出，附試播頁；不是 LINE 可直接送審的格式。";
    $("#sound-panel").hidden = mode !== "sound";
    $("#sticker-motion").disabled = mode === "static";
    $("#sticker-loops").disabled = mode === "static";
  }
  $("#sticker-mode").onchange = () => {
    modeNote();
    preview();
  };
  $("#apply-sticker-style").onclick = () => {
    if (!confirm("以選定風格文案取代目前貼圖文字？")) return;
    const preset = STICKER_STYLES[$("#sticker-style").value];
    $("#sticker-phrases").value = preset.phrases.join("\n");
    $("#sticker-color").value = preset.color;
    api.onChange();
    preview();
  };
  function preview() {
    if (disposed) return;
    try {
      const list = phrases(),
        area = $("#sticker-previews");
      area.replaceChildren();
      list.forEach((text, i) => {
        const figure = document.createElement("figure"),
          c = renderSticker(text);
        c.className =
          "sticker-preview" +
          ($("#sticker-mode").value === "static"
            ? ""
            : " motion-" + $("#sticker-motion").value);
        c.setAttribute("aria-label", text);
        if($("#sticker-mode").value!=="static")c.style.animationIterationCount=$("#sticker-loops").value;
        figure.append(
          c,
          api.el("figcaption", String(i + 1).padStart(2, "0") + " · " + text),
        );
        area.append(figure);
      });
      $("#pack-status").textContent =
        `共 ${list.length} 張；輸出會包含 main.png、tab.png 及 01.png 起的貼圖。主圖／標籤取第一張縮放，請人工確認小尺寸仍清楚。`;
    } catch (e) {
      $("#pack-status").textContent = e.message;
    }
  }
  $("#sticker-preview").onclick = preview;
  $("#sticker-image").onchange = async (e) => {
    const v = ++imageVersion,
      file = e.target.files[0];
    if (!file) return;
    try {
      const image = await loadImage(file);
      if (disposed || v !== imageVersion) {
        image.close();
        return;
      }
      original?.close();
      original = image;
      const canvas = $("#cutout-canvas"),
        scale = Math.min(1, 1024 / image.width, 1024 / image.height);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.hidden = false;
      source = canvas;
      source.close = () => {};
      if ($("#cutout-auto").checked) runCutout();
      else resetCutout();
    } catch (e) {
      api.toast(e.message);
    }
  };
  $("#sticker-clear-image").onclick = () => {
    imageVersion++;
    original?.close();
    original = null;
    source = null;
    $("#cutout-canvas").hidden = true;
    $("#sticker-image").value = "";
    preview();
  };
  async function animatedBytes(base, w = base.width, h = base.height) {
    const frames = [];
    const motion = $("#sticker-motion").value;
    for (let i = 0; i < 10; i++) {
      if (disposed) throw Error("已離開工作區");
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d"),
        t = (i / 10) * Math.PI * 2;
      const angle =
        motion === "shake"
          ? Math.sin(t) * 0.08
          : motion === "wobble"
            ? Math.sin(t) * 0.12
            : 0;
      const scale = motion === "pulse" ? 0.82 + 0.08 * Math.sin(t) : 0.86;
      x.translate(w / 2, h / 2 + (motion === "bounce" ? Math.sin(t) * 5 : 0));
      x.rotate(angle);
      x.scale(scale, scale);
      contain(x, base, -w / 2 + 10, -h / 2 + 10, w - 20, h - 20);
      frames.push(await pngBytes(c));
    }
    return makeApng(frames, {
      duration: 1000,
      loops: Number($("#sticker-loops").value),
    });
  }
  async function soundAsset() {
    const file = $("#sound-file").files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) throw Error("音效請小於 10 MB");
      if (!file.type.startsWith("audio/")) throw Error("請選擇音訊檔");
      const ext = {
        "audio/mpeg": "mp3",
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/ogg": "ogg",
        "audio/webm": "webm",
        "audio/mp4": "m4a",
      }[file.type];
      if (!ext) throw Error("支援 WAV、MP3、OGG、WebM、M4A 音訊");
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        name: "sound." + ext,
        type: file.type,
      };
    }
    return {
      bytes: soundWave($("#sound-effect").value),
      name: "sound.wav",
      type: "audio/wav",
    };
  }
  $("#sound-play").onclick = async () => {
    try {
      const asset = await soundAsset();
      if (soundUrl) URL.revokeObjectURL(soundUrl);
      soundUrl = URL.createObjectURL(
        new Blob([asset.bytes], { type: asset.type }),
      );
      $("#sound-player").src = soundUrl;
      await $("#sound-player").play();
    } catch (e) {
      api.toast(e.message);
    }
  };
  $("#sound-download").onclick = async () => {
    try {
      const asset = await soundAsset();
      api.download(asset.bytes, asset.name, asset.type);
    } catch (e) {
      api.toast(e.message);
    }
  };
  function resetCutout() {
    if (!original) return api.toast("請先上傳角色圖片");
    const c = $("#cutout-canvas"),
      x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(original, 0, 0, c.width, c.height);
    $("#cutout-status").textContent =
      "已恢復原圖。可手動擦除，或調整容差後重新去背。";
    preview();
  }
  function runCutout() {
    if (!original) return api.toast("請先上傳角色圖片");
    resetCutout();
    const c = $("#cutout-canvas"),
      x = c.getContext("2d"),
      image = x.getImageData(0, 0, c.width, c.height);
    const result = removeEdgeBackground(
      image.data,
      c.width,
      c.height,
      Number($("#cutout-tolerance").value),
      Number($("#cutout-feather").value),
    );
    image.data.set(result.data);
    x.putImageData(image, 0, 0);
    $("#cutout-status").textContent =
      "已處理 " +
      result.removed.toLocaleString() +
      " 個背景像素。請在棋盤格上檢查邊緣，可用筆刷擦除或恢復。";
    preview();
  }
  $("#cutout-run").onclick = runCutout;
  $("#cutout-reset").onclick = resetCutout;
  $("#cutout-download").onclick = async () => {
    if (!original) return api.toast("請先上傳圖片");
    api.download(
      await pngBytes($("#cutout-canvas")),
      "去背角色.png",
      "image/png",
    );
  };
  const mask = $("#cutout-canvas");
  function paint(e) {
    if (!drawing || !original || packing) return;
    const rect = mask.getBoundingClientRect(),
      x = ((e.clientX - rect.left) / rect.width) * mask.width,
      y = ((e.clientY - rect.top) / rect.height) * mask.height,
      r = Number($("#cutout-brush").value) / 2,
      ctx = mask.getContext("2d");
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if ($("#cutout-tool").value === "restore") {
      ctx.clip();
      ctx.clearRect(x - r, y - r, r * 2, r * 2);
      ctx.drawImage(original, 0, 0, mask.width, mask.height);
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fill();
    }
    ctx.restore();
  }
  mask.onpointerdown = (e) => {
    if (packing) return;
    drawing = true;
    mask.setPointerCapture(e.pointerId);
    paint(e);
  };
  mask.onpointermove = paint;
  mask.onpointerup = mask.onpointercancel = () => {
    drawing = false;
    preview();
  };
  $("#sticker-zip").onclick = async () => {
    if (packing) return;
    const token = ++packVersion,
      button = $("#sticker-zip"),
      mode = $("#sticker-mode").value;
    try {
      const list = phrases();
      if (!$("#line-rights").checked)
        return api.toast("請先勾選素材授權與內容確認");
      packing = true;
      for (const input of $("#sticker-create").querySelectorAll(
        "input,select,textarea,button",
      ))
        input.disabled = true;
      button.disabled = true;
      const files = [],
        canvases = list.map((text) => renderSticker(text)),
        first = canvases[0];
      for (let i = 0; i < list.length; i++) {
        if (disposed || token !== packVersion) return;
        $("#pack-status").textContent =
          "產生素材 " + (i + 1) + " / " + list.length + "…";
        const bytes =
          mode === "static"
            ? await pngBytes(canvases[i])
            : await animatedBytes(canvases[i]);
        if (bytes.length >= 1024 * 1024)
          throw Error("第 " + (i + 1) + " 張達到 1 MB，請簡化素材");
        files.push({ name: String(i + 1).padStart(2, "0") + ".png", bytes });
      }
      for (const [name, w, h] of [
        ["main.png", 240, 240],
        ["tab.png", 96, 74],
      ]) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        contain(c.getContext("2d"), first, 10, 10, w - 20, h - 20);
        const bytes =
          name === "main.png" && mode !== "static"
            ? await animatedBytes(c)
            : await pngBytes(c);
        if (bytes.length >= 1024 * 1024) throw Error(name + " 達到 1 MB");
        files.push({ name, bytes });
      }
      if (mode === "sound") {
        const audio = await soundAsset();
        files.push(
          audio,
          {
            name: "preview.html",
            bytes: new TextEncoder().encode(
              '<!doctype html><meta charset="utf-8"><title>有聲創作概念</title><h1>有聲創作概念（非 LINE 送審包）</h1><img src="01.png" alt="動畫貼圖"><audio id="audio" src="' +
                audio.name +
                '" controls></audio><p>先解壓縮全部檔案，再按播放試聽。APNG 與音訊為獨立檔案。</p>',
            ),
          },
          {
            name: "README.txt",
            bytes: new TextEncoder().encode(
              "此為有聲創作概念，非 LINE 可直接送審格式。解壓縮後開啟 preview.html。APNG 無法嵌入音訊，若要申請有聲商品，需向 LINE 確認資格與規格。",
            ),
          },
        );
      }
      const zip = makeZip(files);
      if (zip.length >= 60 * 1024 * 1024) throw Error("ZIP 必須小於 60 MB");
      if (disposed) return;
      api.download(
        zip,
        mode === "static"
          ? "LINE-靜態貼圖素材.zip"
          : mode === "animated"
            ? "LINE-動態貼圖素材.zip"
            : "有聲創作概念-不可直接送審.zip",
        "application/zip",
      );
      $("#pack-status").textContent =
        "已下載 " +
        (list.length + 2) +
        " 張 PNG" +
        (mode === "sound" ? " 與獨立音效／試播頁" : "") +
        " 的 ZIP（" +
        Math.ceil(zip.length / 1024) +
        " KB）。" +
        (mode !== "static"
          ? "動畫 10 格、總播放 " + $("#sticker-loops").value + " 秒。"
          : "") +
        "請人工確認授權與閱讀效果。";
    } catch (e) {
      api.toast(e.message);
    } finally {
      packing = false;
      for (const input of $("#sticker-create").querySelectorAll(
        "input,select,textarea,button",
      ))
        input.disabled = false;
      modeNote();
    }
  };
  $("#assets").onchange = async () => {
    const token = ++checkVersion,
      files = [...$("#assets").files],
      role = $("#asset-role").value,
      area = $("#asset-report");
    report = "";
    if (!files.length) {
      area.textContent = "尚未選取圖片。";
      return;
    }
    if (
      files.length > 40 ||
      files.reduce((n, f) => n + f.size, 0) > 60 * 1024 * 1024
    ) {
      area.textContent = "超出檢查上限：最多 40 張、合計 60 MB。";
      return;
    }
    area.textContent = "檢查中…";
    const animated = $("#asset-kind").value === "animated";
    const lines = [
      role === "sticker"
        ? (animated ? ANIMATION_COUNTS : COUNTS).includes(files.length)
          ? "✓ 張數符合"
          : "✗ 貼圖張數需為 8／16／24／32／40"
        : files.length === 1
          ? "✓ 已選取一張圖片"
          : "✗ 請只選取一張圖片",
    ];
    for (const f of files) {
      if (disposed || token !== checkVersion) return;
      let image;
      try {
        if (f.size > 1024 * 1024) {
          lines.push("✗ " + f.name + "：超過 1 MB");
          continue;
        }
        const bytes = new Uint8Array(await f.arrayBuffer()),
          info = pngInfo(bytes);
        if (info.width * info.height > 1000000)
          throw Error("尺寸過大，不符合貼圖規格");
        image = await loadImage(f, 1000000);
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const x = c.getContext("2d");
        x.drawImage(image, 0, 0);
        const a = alphaBounds(
          x.getImageData(0, 0, c.width, c.height).data,
          c.width,
          c.height,
        );
        const errors = [];
        if (animated && role === "sticker") {
          if (
            !(
              c.width <= 320 &&
              c.height <= 270 &&
              (c.width >= 270 || c.height >= 270)
            )
          )
            errors.push("動態尺寸不符");
        } else if (!stickerDimensions(role, c.width, c.height))
          errors.push("尺寸不符");
        const animation = animationInfo(bytes);
        if (animated && role !== "tab") {
          if (!animation) errors.push("不是 APNG");
          else if (
            animation.frames < 5 ||
            animation.frames > 20 ||
            animation.frames !== animation.controls ||
            animation.loops < 1 ||
            animation.loops > 4 ||
            animation.seconds > 4.001 ||
            Math.abs(animation.seconds - Math.round(animation.seconds)) > 0.001
          )
            errors.push("動態格數／循環／時間不符");
          else
            lines.push(
              "  動態：" +
                animation.frames +
                " 格 · " +
                animation.loops +
                " 次 · " +
                animation.seconds.toFixed(2) +
                " 秒",
            );
        }
        if ((!animated || role === "tab") && animation)
          errors.push("此用途應為靜態 PNG");
        if (![2, 6].includes(info.color)) errors.push("不是 RGB／RGBA 色彩");
        if (a.blank) errors.push("圖片完全空白");
        if (!a.transparent) errors.push("沒有透明背景");
        if (info.dpi !== null && info.dpi < 72)
          errors.push("解析度低於 72 dpi");
        lines.push(
          `${errors.length ? "✗" : "✓"} ${f.name}：${c.width}×${c.height} · ${Math.ceil(f.size / 1024)} KB${errors.length ? " · " + errors.join("、") : ""}`,
        );
        if (info.dpi === null)
          lines.push("  ⚠ 未標示 DPI，請用編輯工具確認 72 dpi 以上");
        if (!a.blank && a.margin < 10)
          lines.push("  ⚠ 透明留白不足 10px，請人工檢查位置平衡");
      } catch (e) {
        lines.push("✗ " + f.name + "：" + e.message);
      } finally {
        image?.close();
      }
    }
    if (disposed || token !== checkVersion) return;
    report = lines.join("\n");
    area.textContent = report;
  };
  $("#asset-kind").onchange = $("#asset-role").onchange = () => {
    checkVersion++;
    report = "";
    $("#assets").value = "";
    $("#asset-report").textContent = "用途已變更，請重新選取圖片。";
  };
  $("#save-sticker").onclick = () =>
    report
      ? api.saveWork(
          "LINE 貼圖規格檢查",
          report + "\n注意：這是工具檢查結果，不代表審核通過。",
          "sticker",
        )
      : api.toast("請先完成圖片檢查");
  function metadata() {
    return {
      title: $("#line-title").value,
      creator: $("#line-creator").value,
      description: $("#line-description").value,
      copyright: $("#line-copyright").value,
    };
  }
  function metadataStatus() {
    const m = metadata();
    $("#metadata-status").textContent =
      `名稱 ${lineTextLength(m.title)}/40 · 創意人 ${lineTextLength(m.creator)}/50 · 說明 ${lineTextLength(m.description)}/160 · 版權 ${lineTextLength(m.copyright)}/50（全形算 2 字）`;
  }
  root.addEventListener("input", metadataStatus);
  root.addEventListener("restore-draft", () => {
    modeNote();
    preview();
    metadataStatus();
  });
  $("#save-line-meta").onclick = () => {
    const m = metadata(),
      issues = metadataIssues(m);
    if (issues.length) return api.toast(issues.join("；"));
    if (!$("#line-rights").checked) return api.toast("請先確認授權與內容準則");
    const text = `貼圖名稱：${m.title}\n創意人：${m.creator}\n說明：${m.description}\n版權：${m.copyright}\n\n素材需自行上傳 Creators Market 送審。`;
    api.download(text, "LINE-送審文字.txt");
    api.saveWork(m.title, text, "sticker");
  };
  modeNote();
  preview();
  metadataStatus();
  return () => {
    disposed = true;
    checkVersion++;
    imageVersion++;
    packVersion++;
    original?.close();
    $("#sound-player", root)?.pause();
    if (soundUrl) URL.revokeObjectURL(soundUrl);
  };
}
export function mountVideo(root, api) {
  const section = document.createElement("section");
  section.innerHTML = `<hr><h3>照片合成影片</h3><p class="muted">照片、字幕與選填配樂在本機合成。請保持分頁在前景；瀏覽器不支援錄影時仍可使用上方分鏡工具。</p><label for="video-files">新增照片（最多 12 張，每張 ≤10 MB、1600 萬像素）</label><input id="video-files" type="file" accept="image/png,image/jpeg,image/webp" multiple><div id="video-items" class="video-items"></div><div class="form-grid"><div><label for="duration">每張秒數</label><select id="duration"><option value="2">2 秒</option><option value="3" selected>3 秒</option><option value="5">5 秒</option></select></div><div><label for="video-ratio">影片比例</label><select id="video-ratio"><option value="portrait">直式 720×1280</option><option value="square">正方形 720×720</option><option value="landscape">橫式 1280×720</option></select></div><div><label for="video-fit">照片填滿方式</label><select id="video-fit"><option value="contain">完整顯示（保留邊框）</option><option value="cover">填滿畫面（裁切）</option></select></div><div><label for="video-audio">配樂（選填，≤20 MB）</label><input id="video-audio" type="file" accept="audio/*"></div></div><label for="video-captions">字幕（每行對應一張照片，最多 80 字／行）</label><textarea id="video-captions" rows="4" maxlength="1200" placeholder="第一張照片的字幕\n第二張照片的字幕"></textarea><label for="video-title">影片名稱</label><input id="video-title" maxlength="100" value="我的靈感影片"><p id="video-capability" class="notice"></p><progress id="video-progress" value="0" max="100" aria-label="影片合成進度"></progress><div class="row"><button id="render-video" class="button">合成並下載影片 ↓</button><button id="cancel-video" class="small" disabled>取消</button></div><p id="video-status" role="status" class="muted">先選擇照片，可調整順序與移除。</p><canvas id="video-canvas" width="720" height="1280" class="preview" aria-label="影片畫面預覽" hidden></canvas><video id="video-result" controls playsinline hidden aria-label="完成影片預覽"></video>`;
  root.append(section);
  const get = (s) => $(s, section),
    start = get("#render-video"),
    cancel = get("#cancel-video"),
    status = get("#video-status"),
    canvas = get("#video-canvas"),
    ctx = canvas.getContext("2d");
  let images = [],
    disposed = false,
    loading = false,
    busy = false,
    canceled = false,
    resultUrl = null,
    loadToken = 0,
    recorder,
    stream,
    audioContext,
    audioSource;
  const mime =
    window.MediaRecorder &&
    [
      "video/mp4;codecs=avc1.42E01E",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/mp4",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));
  const supported = !!(mime && canvas.captureStream);
  get("#video-capability").textContent = supported
    ? `此瀏覽器可匯出 ${mime.includes("mp4") ? "MP4" : "WebM"}；加入配樂時可能改用 WebM。影片最多 60 秒，配樂需確認授權。`
    : "此瀏覽器不支援本機影片匯出。請改用新版 Chrome／Edge／Safari；分鏡與其他工具仍可使用。";
  start.disabled = !supported;
  function lock(value) {
    busy = value;
    for (const e of section.querySelectorAll("input,select,textarea,button"))
      if (e !== cancel) e.disabled = value;
    start.disabled = value || !supported;
    cancel.disabled = !value;
  }
  function order() {
    const list = get("#video-items");
    list.replaceChildren();
    images.forEach((item, i) => {
      const row = api.el("div", "", "video-item"),
        img = document.createElement("img");
      img.src = item.url;
      img.alt = "";
      const name = api.el("span", `${i + 1}. ${item.name}`);
      const up = api.button("↑", () => {
        [images[i - 1], images[i]] = [images[i], images[i - 1]];
        order();
      });
      up.disabled = i === 0;
      up.setAttribute("aria-label", "向前移動第 " + (i + 1) + " 張");
      const down = api.button("↓", () => {
        [images[i + 1], images[i]] = [images[i], images[i + 1]];
        order();
      });
      down.disabled = i === images.length - 1;
      down.setAttribute("aria-label", "向後移動第 " + (i + 1) + " 張");
      const remove = api.button("移除", () => {
        item.image.close();
        URL.revokeObjectURL(item.url);
        images.splice(i, 1);
        order();
      });
      remove.setAttribute("aria-label", "移除第 " + (i + 1) + " 張");
      row.append(img, name, up, down, remove);
      list.append(row);
    });
    status.textContent = `已選 ${images.length} 張照片；可重複新增。字幕依目前順序逐行套用。`;
  }
  get("#video-files").onchange = async (e) => {
    const token = ++loadToken,
      files = [...e.target.files];
    if (images.length + files.length > 12) {
      e.target.value = "";
      return api.toast("最多 12 張照片");
    }
    loading = true;
    e.target.disabled = true;
    start.disabled = true;
    try {
      for (const file of files) {
        try {
          const img = await loadImage(file);
          if (disposed || token !== loadToken) {
            img.close();
            break;
          }
          images.push({
            image: img,
            name: file.name,
            url: URL.createObjectURL(file),
          });
        } catch (err) {
          api.toast(file.name + "：" + err.message);
        }
      }
      if (!disposed) order();
    } finally {
      loading = false;
      e.target.disabled = false;
      if (!disposed) start.disabled = !supported;
      e.target.value = "";
    }
  };
  function draw(img, index) {
    const w = canvas.width,
      h = canvas.height;
    ctx.fillStyle = "#172e26";
    ctx.fillRect(0, 0, w, h);
    const cover = get("#video-fit").value === "cover",
      scale = (cover ? Math.max : Math.min)(w / img.width, h / img.height);
    ctx.drawImage(
      img,
      (w - img.width * scale) / 2,
      (h - img.height * scale) / 2,
      img.width * scale,
      img.height * scale,
    );
    const caption = get("#video-captions").value.split("\n")[index] || "";
    if (caption) {
      ctx.fillStyle = "#142b24de";
      ctx.fillRect(20, h - 205, w - 40, 175);
      fitText(ctx, caption, {
        x: w / 2,
        y: h - 185,
        width: w - 90,
        height: 140,
        size: 32,
        min: 18,
        color: "#ffffff",
        align: "center",
        weight: "bold",
      });
    }
  }
  async function release() {
    stream?.getTracks().forEach((t) => t.stop());
    try {
      audioSource?.stop();
    } catch {}
    try {
      await audioContext?.close();
    } catch {}
    stream = null;
    audioContext = null;
    audioSource = null;
  }
  cancel.onclick = () => {
    canceled = true;
    status.textContent = "取消中…";
  };
  start.onclick = async () => {
    if (busy || loading || !supported) return;
    if (!images.length) return api.toast("請先新增照片");
    const captions = get("#video-captions").value.split("\n");
    if (captions.some((s) => [...s].length > 80))
      return api.toast("每行字幕最多 80 字");
    if (captions.slice(images.length).some((s) => s.trim()))
      return api.toast("字幕行數超過照片張數，請移除多出的字幕");
    const seconds = Number(get("#duration").value),
      total = images.length * seconds;
    if (total > 60) return api.toast("影片最多 60 秒");
    const audio = get("#video-audio").files[0];
    if (audio?.size > 20 * 1024 * 1024) return api.toast("配樂請小於 20 MB");
    canceled = false;
    lock(true);
    get("#video-progress").value = 0;
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = null;
    }
    get("#video-result").hidden = true;
    try {
      const sizes = {
        portrait: [720, 1280],
        square: [720, 720],
        landscape: [1280, 720],
      };
      [canvas.width, canvas.height] =
        sizes[get("#video-ratio").value] || sizes.portrait;
      canvas.hidden = false;
      draw(images[0].image, 0);
      stream = canvas.captureStream(24);
      let recordingMime = mime;
      if (audio) {
        recordingMime = [
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/mp4",
          "video/webm",
        ].find((type) => MediaRecorder.isTypeSupported(type));
        if (!recordingMime)
          throw Error("此瀏覽器無法輸出含配樂影片，請移除配樂後重試");
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw Error("瀏覽器不支援配樂，請移除音訊後重試");
        audioContext = new AudioCtx();
        await audioContext.resume();
        if (audioContext.state !== "running")
          throw Error("音訊權限尚未開啟，請重新操作");
        const buffer = await audioContext.decodeAudioData(
          await audio.arrayBuffer(),
        );
        if (canceled || disposed) return;
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = buffer;
        audioSource.loop = true;
        const destination = audioContext.createMediaStreamDestination();
        audioSource.connect(destination);
        destination.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      }
      if (canceled || disposed) return;
      recorder = new MediaRecorder(stream, {
        mimeType: recordingMime,
        videoBitsPerSecond: 2500000,
      });
      const chunks = [];
      let recorderFailure = null;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.onerror = (e) => {
          recorderFailure = e.error || Error("錄製失敗");
          resolve();
        };
      });
      recorder.start(200);
      audioSource?.start();
      const began = performance.now(),
        duration = total * 1000;
      while (
        performance.now() - began < duration &&
        !canceled &&
        !disposed &&
        !recorderFailure
      ) {
        if (document.hidden)
          throw Error("分頁進入背景，已停止合成。請保持分頁開啟並重試");
        if (recorder.state === "inactive") throw Error("錄製意外中止，請重試");
        const elapsed = performance.now() - began,
          index = Math.min(
            images.length - 1,
            Math.floor(elapsed / (seconds * 1000)),
          );
        draw(images[index].image, index);
        get("#video-progress").value = Math.min(
          100,
          (elapsed / duration) * 100,
        );
        status.textContent = `合成中 ${Math.floor(elapsed / 1000)} / ${total} 秒 · 第 ${index + 1} 張`;
        await new Promise((r) => setTimeout(r, 40));
      }
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      if (recorderFailure) throw recorderFailure;
      if (disposed) return;
      if (canceled) {
        status.textContent = "已取消，未下載影片。";
        return;
      }
      const blob = new Blob(chunks, {
        type: recorder.mimeType || recordingMime,
      });
      if (blob.size < 100) throw Error("未產生有效影片");
      resultUrl = URL.createObjectURL(blob);
      const player = get("#video-result");
      player.src = resultUrl;
      player.hidden = false;
      get("#video-progress").value = 100;
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      api.download(
        blob,
        (get("#video-title").value.trim() || "我的影片") + "." + ext,
        blob.type,
      );
      status.textContent = `完成：${total} 秒 · ${canvas.width}×${canvas.height} · ${(blob.size / 1024 / 1024).toFixed(2)} MB。影片已下載，可在下方預覽。`;
      api.saveWork(
        get("#video-title").value.trim() || "我的影片",
        `照片數：${images.length}\n長度：${total} 秒\n尺寸：${canvas.width}×${canvas.height}\n格式：${ext.toUpperCase()}\n字幕：\n${get("#video-captions").value}\n\n影片檔已另外下載，未存入瀏覽器備份。`,
        "video",
      );
    } catch (e) {
      if (!disposed) status.textContent = "無法合成：" + e.message;
    } finally {
      if (recorder?.state && recorder.state !== "inactive") recorder.stop();
      await release();
      if (!disposed) {
        const message = status.textContent;
        lock(false);
        order();
        status.textContent = canceled ? "已取消，未下載影片。" : message;
      }
    }
  };
  root.addEventListener("restore-draft", () => {
    if (images.length) draw(images[0].image, 0);
  });
  return () => {
    disposed = true;
    canceled = true;
    loadToken++;
    if (recorder?.state && recorder.state !== "inactive") recorder.stop();
    release();
    for (const item of images) {
      item.image.close();
      URL.revokeObjectURL(item.url);
    }
    images = [];
    const player = get("#video-result");
    player.pause();
    player.removeAttribute("src");
    player.load();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  };
}
