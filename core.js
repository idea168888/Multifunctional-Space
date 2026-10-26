// Pure validation and binary helpers shared by the UI and regression tests.
export const STORAGE_KEY = "multi-space-v1";
export const COUNTS = [8, 16, 24, 32, 40];
export const LIMIT = 5 * 1024 * 1024;
export const uid = () => crypto.randomUUID();
export function normalizeState(input) {
  if (
    !input ||
    !Array.isArray(input.themes) ||
    !Array.isArray(input.works) ||
    input.themes.length > 100 ||
    input.works.length > 1000
  )
    throw Error("資料格式不正確");
  const text = (v, max, empty = true) =>
    typeof v === "string" && v.length <= max && (empty || v.trim().length > 0);
  const ids = new Set();
  const themes = input.themes.map((t) => {
    if (
      !t ||
      !text(t.id, 100, false) ||
      !text(t.name, 30, false) ||
      ids.has(t.id) ||
      ["sticker", "video", "art", "research", "finished"].includes(t.id)
    )
      throw Error("主題資料不正確或重複");
    ids.add(t.id);
    return { id: t.id, name: t.name.trim() };
  });
  ids.clear();
  const works = input.works.map((w) => {
    if (
      !w ||
      !text(w.id, 100, false) ||
      ids.has(w.id) ||
      !text(w.title, 150, false) ||
      !text(w.body, 50000) ||
      !text(w.type, 100, false) ||
      !text(w.date, 50) ||
      !Number.isFinite(Date.parse(w.date))
    )
      throw Error("作品資料不正確或重複");
    ids.add(w.id);
    const result = {
      id: w.id,
      title: w.title.trim(),
      body: w.body,
      type: w.type,
      date: w.date,
      favorite: w.favorite === true,
    };
    if (typeof w.updated === "string" && Number.isFinite(Date.parse(w.updated)))
      result.updated = w.updated;
    // Only known editable card fields are restored. Imported objects never become HTML.
    if (w.art && typeof w.art === "object") {
      const a = w.art;
      if (
        !text(a.title, 60) ||
        !text(a.text, 500) ||
        !["green", "sand", "night"].includes(a.palette) ||
        !["square", "portrait", "landscape"].includes(a.size)
      )
        throw Error("圖文資料不正確");
      result.art = {
        title: a.title,
        text: a.text,
        palette: a.palette,
        size: a.size,
        align: a.align === "left" ? "left" : "center",
      };
    }
    return result;
  });
  const drafts = {};
  if (input.drafts && typeof input.drafts === "object") {
    for (const [id, fields] of Object.entries(input.drafts)) {
      if (
        id.length > 100 ||
        !fields ||
        typeof fields !== "object" ||
        Array.isArray(fields)
      )
        continue;
      const safe = {};
      for (const [name, value] of Object.entries(fields))
        if (/^[a-z][a-z0-9-]{0,50}$/.test(name) && text(value, 50000))
          safe[name] = value;
      Object.defineProperty(drafts, id, {
        value: safe,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return { version: 2, themes, works, drafts };
}
export function filterWorks(
  works,
  query = "",
  type = "",
  favorite = false,
  sort = "new",
) {
  const q = query.trim().toLocaleLowerCase();
  return works
    .filter(
      (w) =>
        (!q || (w.title + " " + w.body).toLocaleLowerCase().includes(q)) &&
        (!type || w.type === type) &&
        (!favorite || w.favorite),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-Hant")
        : (sort === "old" ? 1 : -1) *
          (Date.parse(a.updated || a.date) - Date.parse(b.updated || b.date)),
    );
}
export const lineTextLength = (text) =>
  [...text].reduce((n, c) => n + (c.codePointAt(0) > 0x7e ? 2 : 1), 0);
export function metadataIssues(m) {
  const issues = [];
  for (const [key, label, max] of [
    ["title", "名稱", 40],
    ["creator", "創意人", 50],
    ["description", "說明", 160],
    ["copyright", "版權", 50],
  ]) {
    const value = m[key] || "";
    if (!value.trim()) issues.push(label + "不可空白");
    if (lineTextLength(value) > max)
      issues.push(label + "超過 " + max + " 字（全形算 2 字）");
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value))
      issues.push(label + "不支援表情符號");
  }
  if (m.copyright && !/^[A-Za-z0-9 ()©.,_-]+$/.test(m.copyright))
    issues.push("版權請使用英文或數字");
  return issues;
}
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function pngInfo(bytes) {
  if (
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  )
    throw Error("不是有效的 PNG");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR")
    throw Error("PNG 缺少 IHDR");
  const width = v.getUint32(16),
    height = v.getUint32(20),
    color = bytes[25];
  let dpi = null;
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = v.getUint32(offset);
    if (offset + 12 + length > bytes.length) throw Error("PNG 資料不完整");
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === "pHYs" && length === 9 && bytes[offset + 16] === 1)
      dpi =
        Math.min(v.getUint32(offset + 8), v.getUint32(offset + 12)) * 0.0254;
    offset += length + 12;
  }
  return { width, height, color, dpi };
}
export function stickerDimensions(role, w, h) {
  return role === "main"
    ? w === 240 && h === 240
    : role === "tab"
      ? w === 96 && h === 74
      : w > 0 && h > 0 && w <= 370 && h <= 320 && w % 2 === 0 && h % 2 === 0;
}
export function alphaBounds(pixels, w, h) {
  let left = w,
    right = -1,
    top = h,
    bottom = -1,
    transparent = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = pixels[(y * w + x) * 4 + 3];
      if (a < 255) transparent = true;
      if (a > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  return {
    blank: right < 0,
    transparent,
    left,
    right,
    top,
    bottom,
    margin: right < 0 ? 0 : Math.min(left, top, w - 1 - right, h - 1 - bottom),
  };
}
export function pngWithDpi(bytes) {
  // Canvas exports RGB+alpha PNG. Write a standards-compliant 72.009 dpi pHYs chunk.
  pngInfo(bytes);
  const parts = [bytes.slice(0, 8)];
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = new Uint8Array(21),
    cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set(new TextEncoder().encode("pHYs"), 4);
  cv.setUint32(8, 2835);
  cv.setUint32(12, 2835);
  chunk[16] = 1;
  cv.setUint32(17, crc32(chunk.slice(4, 17)));
  for (let o = 8; o < bytes.length; ) {
    const length = v.getUint32(o),
      type = String.fromCharCode(...bytes.slice(o + 4, o + 8));
    if (type !== "pHYs") parts.push(bytes.slice(o, o + length + 12));
    if (type === "IHDR") parts.push(chunk);
    o += length + 12;
  }
  return concat(parts);
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
export function makeZip(files) {
  // ZIP STORE: no compression dependency, UTF-8 filenames, CRC32 and central directory.
  const parts = [],
    central = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name),
      data = file.bytes,
      crc = crc32(data),
      header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true); // DOS date: 1980-01-01.
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const record = new Uint8Array(46 + name.length),
      r = new DataView(record.buffer);
    r.setUint32(0, 0x02014b50, true);
    r.setUint16(4, 20, true);
    r.setUint16(6, 20, true);
    r.setUint16(8, 0x800, true);
    r.setUint16(14, 33, true);
    r.setUint32(16, crc, true);
    r.setUint32(20, data.length, true);
    r.setUint32(24, data.length, true);
    r.setUint16(28, name.length, true);
    r.setUint32(42, offset, true);
    record.set(name, 46);
    parts.push(header, data);
    central.push(record);
    offset += header.length + data.length;
  }
  const directory = concat(central),
    end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true);
  v.setUint16(10, files.length, true);
  v.setUint32(12, directory.length, true);
  v.setUint32(16, offset, true);
  return concat([...parts, directory, end]);
}
