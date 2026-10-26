import { mountResearch } from "./research.js";
import { STICKER_STYLES } from "./creative.js";
import {
  STORAGE_KEY,
  LIMIT,
  normalizeState,
  filterWorks,
  uid,
  makeZip,
} from "./core.js";
import { mountArt, mountStickers, mountVideo } from "./studios.js";
const $ = (s) => document.querySelector(s);
const baseThemes = [
  [
    "sticker",
    "☺",
    "LINE 貼圖工坊",
    "讓你的角色，走進每一天的對話。",
    "製作貼圖 · 檢查 · 整包下載",
    "#ecf0de",
  ],
  [
    "video",
    "▷",
    "影片創作室",
    "把腦海裡的畫面，寫成動人的故事。",
    "照片影片 · 字幕 · 分鏡",
    "#f9e9de",
  ],
  [
    "art",
    "▧",
    "圖文靈感所",
    "用文字與色彩，說出你的獨特觀點。",
    "即時設計 · 多尺寸 PNG",
    "#e9e8f4",
  ],
  [
    "research",
    "⚗",
    "研發實驗室",
    "從一個好奇，走向下一個新發現。",
    "實驗規劃 · 紀錄 · 結論",
    "#e3edf1",
  ],
  [
    "finished",
    "✧",
    "創作成品館",
    "整理、收藏，讓你的作品持續發光。",
    "作品管理 · 編輯 · 備份",
    "#f6eedb",
  ],
];
let state = { version: 2, themes: [], works: [], drafts: {} },
  active = null,
  cleanup = () => {},
  editedId = null,
  dirty = false,
  draftTimer;
let selectedWorks = new Set(),
  deletedWorks = [];
const statuses = {
  idea: "靈感",
  progress: "製作中",
  done: "已完成",
  archived: "已封存",
};
let startupWarning = "";
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) state = normalizeState(JSON.parse(raw));
} catch {
  startupWarning =
    "無法讀取原有資料或瀏覽器禁止儲存。原始資料未覆寫；請先匯出原始備份或檢查瀏覽器設定。";
}
let blocked = !!startupWarning;
export function el(tag, text = "", cls = "") {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function button(text, fn, cls = "small") {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
}
let toastTimer;
function toast(text) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  $("#toast").style.display = "block";
  toastTimer = setTimeout(() => ($("#toast").style.display = "none"), 4500);
}
function commit(next, quiet = false) {
  try {
    if (blocked) throw Error("原有資料尚未恢復，請先備份或匯入有效備份");
    const json = JSON.stringify(next);
    if (new Blob([json]).size > LIMIT)
      throw Error("已達 5 MB 上限，請備份並刪除不需要的作品");
    localStorage.setItem(STORAGE_KEY, json);
    state = next;
    $("#storage-status").textContent =
      `本機資料 ${Math.ceil(new Blob([json]).size / 1024)} KB / 5 MB`;
    return true;
  } catch (e) {
    $("#draft-status").textContent = "尚未儲存：" + e.message;
    if (!quiet) toast("儲存失敗：" + e.message);
    return false;
  }
}
function mutate(fn) {
  try {
    const next = structuredClone(state);
    fn(next);
    return commit(next);
  } catch (e) {
    toast(e.message);
    return false;
  }
}
function allThemes() {
  return [
    ...baseThemes,
    ...state.themes.map((t) => [
      t.id,
      "＋",
      t.name,
      "為你的下一個想法，開一個專屬空間。",
      "自訂主題 · 構想筆記",
      "#e8efe5",
    ]),
  ];
}
function themeName(id) {
  return allThemes().find((t) => t[0] === id)?.[2] || "未分類主題";
}
function download(data, name, type = "text/plain;charset=utf-8") {
  const blob = data instanceof Blob ? data : new Blob([data], { type }),
    url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 180);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已複製");
  } catch {
    modal(
      '<h2>複製內容</h2><label for="copy-text">請選取並複製</label><textarea id="copy-text" readonly></textarea>',
    );
    $("#copy-text").value = text;
    $("#copy-text").select();
  }
}
function modal(html) {
  $("#modal-body").innerHTML = html;
  $("#modal").showModal();
}
function closeModal() {
  $("#modal").close();
}
function saveWork(title, body, type, extra = {}) {
  if (!title.trim()) return toast("請填寫作品名稱");
  const id = extra.id || uid();
  const data = {
    id,
    title: title.trim().slice(0, 150),
    body: body.slice(0, 50000),
    status: state.works.find((w) => w.id === id)?.status || "idea",
    tags: state.works.find((w) => w.id === id)?.tags || [],
    type,
    date: new Date().toISOString(),
    ...extra,
  };
  const success = mutate((s) => {
    const old = s.works.find((w) => w.id === id);
    if (old) {
      Object.assign(old, data, {
        date: old.date,
        updated: new Date().toISOString(),
      });
    } else {
      if (s.works.length >= 1000) throw Error("作品最多 1000 筆");
      s.works.unshift(data);
    }
  });
  if (success) {
    renderWorks();
    toast(extra.id ? "作品已更新" : "已儲存至這台裝置");
  }
  return success ? id : null;
}
function renderThemes() {
  const grid = $("#theme-grid");
  grid.replaceChildren();
  allThemes().forEach((t) => {
    const card = el("article", "", "theme-wrap");
    const b = button("", () => openStudio(t), "theme");
    b.style.setProperty("--tint", t[5]);
    b.append(
      el("span", t[1], "icon"),
      el("h3", t[2]),
      el("p", t[3]),
      el("span", t[4], "tag"),
      el("span", "↗", "arrow"),
    );
    card.append(b);
    if (!baseThemes.some((x) => x[0] === t[0])) {
      const manage = button(
        "管理",
        () => manageTheme(t[0]),
        "theme-manage small",
      );
      manage.setAttribute("aria-label", "管理主題：" + t[2]);
      card.append(manage);
    }
    grid.append(card);
  });
  const add = button("", addTheme, "theme add");
  add.append(
    el("span", "＋", "icon"),
    el("h3", "下一個主題，由你定義"),
    el("p", "新增你的專屬創作空間"),
  );
  grid.append(add);
  refreshFilter();
}
function addTheme() {
  themeModal();
}
function manageTheme(id) {
  themeModal(state.themes.find((t) => t.id === id));
}
function themeModal(t) {
  modal(
    "<h2>" +
      (t ? "管理主題" : "新增你的主題") +
      '</h2><form id="theme-form"><label for="theme-name">主題名稱（最多 30 字）</label><input id="theme-name" maxlength="30" required><div class="row"><button class="button">儲存主題</button><button type="button" id="remove-theme" class="small danger" ' +
      (t ? "" : "hidden") +
      '>刪除主題</button></div><p class="muted">刪除主題會保留已收藏作品，並將它們移至成品館。</p></form>',
  );
  $("#theme-name").value = t?.name || "";
  $("#theme-form").onsubmit = (e) => {
    e.preventDefault();
    const name = $("#theme-name").value.trim();
    if (!name) return;
    if (
      state.themes.some((x) => x.name === name && x.id !== t?.id) ||
      baseThemes.some((x) => x[2] === name)
    )
      return toast("已有相同名稱的主題");
    if (!t && state.themes.length >= 100) return toast("最多 100 個自訂主題");
    if (
      mutate((s) => {
        if (t) s.themes.find((x) => x.id === t.id).name = name;
        else s.themes.push({ id: uid(), name });
      })
    ) {
      renderThemes();
      renderWorks();
      closeModal();
      if (active?.[0] === t?.id) $("#studio-title").textContent = name;
    }
  };
  $("#remove-theme").onclick = () => {
    if (!confirm("確定刪除此主題？收藏作品將保留在成品館。")) return;
    if (active?.[0] === t.id) {
      flushDraft();
      cleanup();
      active = null;
      $("#studio").hidden = true;
    }
    if (
      mutate((s) => {
        s.themes = s.themes.filter((x) => x.id !== t.id);
        s.works.forEach((w) => {
          if (w.type === t.id) w.type = "finished";
        });
        delete s.drafts[t.id];
      })
    ) {
      renderThemes();
      renderWorks();
      closeModal();
    }
  };
}
function refreshFilter() {
  const selected = $("#work-type").value;
  $("#work-type").replaceChildren(new Option("所有主題", ""));
  for (const t of allThemes()) $("#work-type").add(new Option(t[2], t[0]));
  if ([...$("#work-type").options].some((o) => o.value === selected))
    $("#work-type").value = selected;
}
function renderWorks() {
  const list = $("#works-list");
  list.replaceChildren();
  $("#count").textContent = state.works.length;
  const works = filterWorks(
    state.works,
    $("#work-search").value,
    $("#work-type").value,
    $("#favorite-only").checked,
    $("#work-sort").value,
  ).filter(
    (w) =>
      !$("#work-status").value ||
      (w.status || "idea") === $("#work-status").value,
  );
  list.className = "works-view view-" + $("#work-view").value;
  const board = {};
  if ($("#work-view").value === "board" && works.length) {
    for (const [status, label] of Object.entries(statuses)) {
      const col = el("section", "", "board-column");
      col.append(el("h3", label));
      list.append(col);
      board[status] = col;
    }
  }
  for (const id of selectedWorks)
    if (!state.works.some((w) => w.id === id)) selectedWorks.delete(id);
  updateSelection();
  $("#select-visible").checked =
    works.length > 0 && works.every((w) => selectedWorks.has(w.id));
  $("#select-visible").indeterminate =
    works.some((w) => selectedWorks.has(w.id)) && !$("#select-visible").checked;
  $("#work-results").textContent =
    `顯示 ${works.length} / ${state.works.length} 筆`;
  if (!works.length) {
    const empty = el("div", "", "empty");
    empty.append(
      el("b", "✧"),
      el(
        "span",
        state.works.length
          ? "沒有符合的作品，試試其他關鍵字或分類。"
          : "選一個主題，開始你的第一件作品。",
      ),
    );
    list.append(empty);
    return;
  }
  for (const w of works) {
    const card = el("article", "", "work"),
      top = el("div", "", "work-heading"),
      meta = el("div");
    meta.append(
      el("h3", w.title),
      el(
        "small",
        themeName(w.type) +
          " · " +
          new Date(w.updated || w.date).toLocaleString("zh-TW"),
      ),
    );
    const fav = button(w.favorite ? "★ 已收藏" : "☆ 收藏", () => {
      if (
        mutate((s) => {
          const item = s.works.find((x) => x.id === w.id);
          item.favorite = !item.favorite;
        })
      )
        renderWorks();
    });
    fav.setAttribute("aria-pressed", String(!!w.favorite));
    const selection = el("input");
    selection.type = "checkbox";
    selection.className = "work-select";
    selection.value = w.id;
    selection.checked = selectedWorks.has(w.id);
    selection.setAttribute("aria-label", "選取作品：" + w.title);
    selection.onchange = () => {
      if (selection.checked) selectedWorks.add(w.id);
      else selectedWorks.delete(w.id);
      updateSelection();
      const checks = [...document.querySelectorAll(".work-select")];
      $("#select-visible").checked =
        checks.length > 0 && checks.every((c) => c.checked);
      $("#select-visible").indeterminate =
        checks.some((c) => c.checked) && !$("#select-visible").checked;
    };
    top.append(selection, meta, fav);
    card.append(top);
    const controls = el("div", "", "work-controls"),
      status = document.createElement("select");
    status.setAttribute("aria-label", "作品狀態：" + w.title);
    for (const [id, name] of Object.entries(statuses))
      status.add(new Option(name, id));
    status.value = w.status || "idea";
    status.onchange = () => {
      if (
        mutate(
          (s) =>
            (s.works.find((item) => item.id === w.id).status = status.value),
        )
      )
        renderWorks();
    };
    controls.append(status);
    for (const tag of w.tags || [])
      controls.append(el("span", "#" + tag, "tag"));
    card.append(controls, el("pre", w.body));
    const row = el("div", "", "work-actions");
    row.append(
      button("編輯", () => editWork(w)),
      button("複製", () => copy(w.body)),
      button("下載 TXT", () => download(w.body, w.title + ".txt")),
      button("另存副本", () => {
        const title = w.title.slice(0, 144) + "（副本）";
        saveWork(title, w.body, w.type, {
          ...w,
          id: uid(),
          title,
          date: new Date().toISOString(),
          updated: new Date().toISOString(),
        });
      }),
      button("刪除", () => deleteWorks([w.id]), "small danger"),
    );
    if (w.art)
      row.prepend(button("重開圖文設計", () => openStudio(baseThemes[2], w)));
    card.append(row);
    (board[w.status || "idea"] || list).append(card);
  }
}
function updateSelection() {
  const count = selectedWorks.size;
  $("#selection-count").textContent = "已選 " + count + " 筆";
  for (const id of [
    "batch-download",
    "batch-favorite",
    "batch-done",
    "batch-archive",
    "batch-delete",
  ])
    $("#" + id).disabled = !count;
  $("#undo-delete").disabled = !deletedWorks.length;
}
function deleteWorks(ids) {
  if (
    !confirm(
      "確定刪除 " +
        ids.length +
        " 筆作品？可復原上次刪除；重新整理後復原紀錄會清除。",
    )
  )
    return;
  const removed = state.works.filter((w) => ids.includes(w.id));
  if (mutate((s) => (s.works = s.works.filter((w) => !ids.includes(w.id))))) {
    deletedWorks = removed;
    ids.forEach((id) => selectedWorks.delete(id));
    renderWorks();
    toast("已刪除，可按「復原上次刪除」。");
  }
}
$("#select-visible").onchange = (e) => {
  for (const c of document.querySelectorAll(".work-select")) {
    c.checked = e.target.checked;
    if (c.checked) selectedWorks.add(c.value);
    else selectedWorks.delete(c.value);
  }
  updateSelection();
};
$("#batch-delete").onclick = () => deleteWorks([...selectedWorks]);
for (const [id, field, value] of [
  ["batch-favorite", "favorite", true],
  ["batch-done", "status", "done"],
  ["batch-archive", "status", "archived"],
])
  $("#" + id).onclick = () => {
    if (
      mutate((s) =>
        s.works.forEach((w) => {
          if (selectedWorks.has(w.id)) {
            w[field] = value;
            w.updated = new Date().toISOString();
          }
        }),
      )
    ) {
      renderWorks();
      toast("已更新選取作品");
    }
  };
$("#undo-delete").onclick = () => {
  if (state.works.length + deletedWorks.length > 1000)
    return toast("作品超過 1000 筆上限");
  if (
    mutate((s) => {
      for (const w of deletedWorks)
        if (!s.works.some((item) => item.id === w.id)) s.works.push(w);
    })
  ) {
    deletedWorks = [];
    renderWorks();
    toast("已復原");
  }
};
$("#batch-download").onclick = () => {
  const works = state.works.filter((w) => selectedWorks.has(w.id)),
    encoder = new TextEncoder();
  const files = works.map((w, i) => ({
    name: String(i + 1).padStart(3, "0") + ".txt",
    bytes: encoder.encode(w.title + "\n\n" + w.body),
  }));
  files.push({
    name: "作品備份.json",
    bytes: encoder.encode(
      JSON.stringify(
        { version: 2, themes: state.themes, works, drafts: {} },
        null,
        2,
      ),
    ),
  });
  download(makeZip(files), "選取作品.zip", "application/zip");
};
function editWork(w) {
  modal(
    '<h2>編輯作品</h2><form id="edit-work"><label for="edit-title">作品名稱</label><input id="edit-title" maxlength="150" required><label for="edit-body">內容</label><textarea id="edit-body" maxlength="50000" rows="12"></textarea><label for="edit-type">分類</label><select id="edit-type"></select><label for="edit-tags">標籤（逗號分隔，最多 8 個、每個 20 字）</label><input id="edit-tags" maxlength="170"><div class="row"><button class="button">儲存變更</button></div><p class="muted">圖文設計另可透過「重開圖文設計」調整版型。</p></form>',
  );
  $("#edit-title").value = w.title;
  $("#edit-body").value = w.body;
  $("#edit-tags").value = (w.tags || []).join(", ");
  for (const t of allThemes()) $("#edit-type").add(new Option(t[2], t[0]));
  $("#edit-type").value = [...$("#edit-type").options].some(
    (o) => o.value === w.type,
  )
    ? w.type
    : "finished";
  $("#edit-work").onsubmit = (e) => {
    e.preventDefault();
    if (
      saveWork(
        $("#edit-title").value,
        $("#edit-body").value,
        $("#edit-type").value,
        {
          ...w,
          tags: [
            ...new Set(
              $("#edit-tags")
                .value.split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ]
            .slice(0, 8)
            .map((s) => s.slice(0, 20)),
          title: $("#edit-title").value.trim(),
          body: $("#edit-body").value,
          type: $("#edit-type").value,
        },
      )
    )
      closeModal();
  };
}
function fields() {
  const out = {};
  for (const e of $("#studio-body").querySelectorAll(
    "input[id],select[id],textarea[id]",
  ))
    if (!["file", "checkbox", "button", "submit"].includes(e.type) && e.id)
      out[e.id] = e.value;
  return out;
}
function flushDraft() {
  clearTimeout(draftTimer);
  if (!active || !dirty) return true;
  const next = structuredClone(state);
  Object.defineProperty(next.drafts, active[0], {
    value: fields(),
    enumerable: true,
    writable: true,
    configurable: true,
  });
  const ok = commit(next);
  if (ok) {
    dirty = false;
    $("#draft-status").textContent =
      "文字草稿已自動儲存（照片／音訊需重新選取）";
  }
  return ok;
}
function draftInput(e) {
  if (e.target.matches("input,select,textarea") && e.target.type !== "file") {
    dirty = true;
    $("#draft-status").textContent = "正在儲存草稿…";
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 500);
  }
}
function openStudio(t, work = null) {
  if (active && !flushDraft() && !confirm("文字草稿尚未儲存，確定切換？"))
    return;
  cleanup();
  editedId = work?.id || null;
  active = t;
  dirty = false;
  $("#studio").hidden = false;
  $("#studio-title").textContent = t[2];
  $("#studio-desc").textContent =
    "免費本機創作工具 · 不需帳號、不上傳素材 · 文字草稿自動儲存";
  $("#draft-status").textContent = "照片、音訊與輸出檔案請自行下載保存。";
  const previous = $("#studio-body"),
    b = previous.cloneNode(false);
  previous.replaceWith(b);
  const api = {
    toast,
    download,
    saveWork,
    el,
    button,
    copy,
    runTask,
    onChange: () => {
      dirty = true;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(flushDraft, 500);
    },
  };
  cleanup = () => {};
  if (t[0] === "art") cleanup = mountArt(b, api, work) || cleanup;
  else if (t[0] === "sticker") cleanup = mountStickers(b, api) || cleanup;
  else {
    planner(b, t, api);
    if (t[0] === "video") cleanup = mountVideo(b, api) || cleanup;
    if (t[0] === "research") cleanup = mountResearch(b, api) || cleanup;
  }
  if (!work) {
    const draft = Object.hasOwn(state.drafts, t[0]) ? state.drafts[t[0]] : null;
    if (draft) {
      for (const e of b.querySelectorAll("input[id],textarea[id],select[id]"))
        if (
          e.type !== "file" &&
          e.type !== "checkbox" &&
          Object.hasOwn(draft, e.id)
        ) {
          const value = draft[e.id];
          if (e.tagName === "SELECT") {
            if ([...e.options].some((option) => option.value === value))
              e.value = value;
          } else
            e.value = e.maxLength >= 0 ? value.slice(0, e.maxLength) : value;
        }
      b.dispatchEvent(new CustomEvent("restore-draft"));
      $("#draft-status").textContent = "已還原文字草稿；照片／音訊請重新選取。";
    }
  }
  b.oninput = draftInput;
  b.onchange = draftInput;
  const heading = $("#studio-title");
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  $("#studio").scrollIntoView({ behavior: "smooth" });
  return true;
}
function runTask(task) {
  const t = baseThemes.find((t) => t[0] === task.target) || baseThemes[3];
  if (!openStudio(t)) return;
  const set = (id, value) => {
    const input = $("#" + id);
    if (input) {
      input.value =
        input.maxLength > 0 ? value.slice(0, input.maxLength) : value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  if (task.target === "sticker") {
    const preset = STICKER_STYLES[task.style];
    set("sticker-style", task.style);
    set("sticker-phrases", preset.phrases.join("\n"));
    set("sticker-color", preset.color);
    set(
      "sticker-mode",
      /有聲|音效/.test(task.prompt)
        ? "sound"
        : /動態|動畫|彈跳/.test(task.prompt)
          ? "animated"
          : "static",
    );
    $("#sticker-preview").click();
  } else if (task.target === "art") {
    set("card-title", task.prompt.slice(0, 35));
    set("card-text", "將你的靈感寫在這裡，調整後即可下載。");
    set(
      "card-template",
      /復古/.test(task.prompt)
        ? "retro"
        : /雜誌/.test(task.prompt)
          ? "editorial"
          : /漸層/.test(task.prompt)
            ? "gradient"
            : /拼貼/.test(task.prompt)
              ? "collage"
              : /海報/.test(task.prompt)
                ? "poster"
                : "minimal",
    );
  } else {
    set("idea", task.prompt.slice(0, 150));
    set("details", task.prompt);
    $("#plan-form").requestSubmit();
  }
  toast("已在本站建立可編輯草稿；尚未送出或操作外部網站。");
}
function planner(b, t, api) {
  const type = t[0],
    research = type === "research",
    finished = type === "finished";
  b.innerHTML = `<form id="plan-form"><label for="idea">${finished ? "作品名稱" : "創作主題"}</label><input id="idea" maxlength="150" required placeholder="例如：城市裡的一小片綠意"><label for="details">${finished ? "作品說明" : "對象、背景與目標"}</label><textarea id="details" maxlength="5000" rows="4"></textarea>${research ? '<div class="form-grid"><div><label for="hypothesis">可測試的假設</label><textarea id="hypothesis" maxlength="2000" placeholder="如果改變…，那麼…"></textarea></div><div><label for="metric">成功標準與測量方法</label><textarea id="metric" maxlength="2000" placeholder="例如：與現有方法相比，時間縮短 20%"></textarea></div><div><label for="method">實驗步驟與對照條件</label><textarea id="method" maxlength="3000"></textarea></div><div><label for="findings">觀察結果與結論</label><textarea id="findings" maxlength="3000" placeholder="未執行可留空；勿將假設當結論"></textarea></div></div>' : ""}${finished ? '<label for="work-url">公開作品連結（選填，限 HTTP(S)）</label><input id="work-url" type="url" placeholder="https://…">' : ""}<div class="row"><button class="button">${finished ? "儲存成品紀錄" : "產生可編輯草稿"} ↗</button></div></form><div id="plan-output"></div>`;
  let savedId = null;
  $("#plan-form").onsubmit = (e) => {
    e.preventDefault();
    const idea = $("#idea").value.trim(),
      details = $("#details").value.trim();
    if (!idea) return toast("請填寫主題");
    let text;
    if (type === "video")
      text = `《${idea}》｜30 秒影片分鏡\n方向：${details || "自然、清楚，讓第一次觀看的人也能理解"}\n\n00–05 秒｜開場：用「${idea}」的具體畫面提出問題。\n05–15 秒｜發展：三個細節，依序搭配近景、中景、全景。\n15–25 秒｜轉折：呈現變化前後，以及你的發現。\n25–30 秒｜結尾：回應開場，留下一句核心訊息。\n\n拍攝清單：環境、主體特寫、實際操作、結尾。\n請確認人物、照片與音樂授權。此為規則式企劃模板，可在下方修改。`;
    else if (research)
      text = `研發題目：${idea}\n背景與目標：${details || "待補充"}\n\n假設：${$("#hypothesis").value || "待定義"}\n成功標準與測量方法：${$("#metric").value || "待定義"}\n實驗步驟與對照：${$("#method").value || "先做最小原型，記錄時間、成本與樣本數。"}\n觀察結果：${$("#findings").value || "尚未執行，不作結論。"}\n\n風險與限制：樣本是否足夠？是否存在其他影響因素？\n下一步：依結果保留、修正或停止假設。`;
    else if (finished) {
      const url = $("#work-url").value.trim();
      if (url && !/^https?:\/\//i.test(url))
        return toast("作品連結請使用 HTTP(S)");
      text = (details || "尚未填寫說明") + (url ? "\n\n作品連結：" + url : "");
      const id = saveWork(idea, text, type, savedId ? { id: savedId } : {});
      if (id) savedId = id;
      return;
    } else
      text = `主題：${idea}\n構想：${details || "待補充"}\n\n目標對象：\n獨特之處：\n今天能完成的最小版本：\n完成標準：\n下一步與待辦：`;
    const output = $("#plan-output");
    output.innerHTML =
      '<label for="plan-text">編輯你的草稿</label><textarea id="plan-text" rows="14" maxlength="50000"></textarea><div class="row" id="plan-actions"></div>';
    const field = $("#plan-text");
    field.value = text;
    const actions = $("#plan-actions");
    actions.append(
      api.button(
        "收藏／更新草稿",
        () => {
          const id = saveWork(
            idea,
            field.value,
            type,
            savedId ? { id: savedId } : {},
          );
          if (id) savedId = id;
        },
        "button",
      ),
      api.button("下載 TXT", () => download(field.value, idea + ".txt")),
      api.button("複製", () => copy(field.value)),
    );
    dirty = true;
    $("#draft-status").textContent = "正在儲存草稿…";
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 500);
  };
  b.addEventListener(
    "restore-draft",
    () => {
      if (
        Object.hasOwn(state.drafts, t[0]) &&
        state.drafts[t[0]]?.["plan-text"]
      ) {
        const saved = state.drafts[t[0]]["plan-text"];
        $("#plan-form").requestSubmit();
        if ($("#plan-text")) $("#plan-text").value = saved;
        dirty = false;
      }
    },
    { once: true },
  );
}
$("#close-studio").onclick = () => {
  if (!flushDraft() && !confirm("草稿尚未儲存，確定關閉？")) return;
  cleanup();
  active = null;
  dirty = false;
  $("#studio").hidden = true;
  $("#themes").scrollIntoView();
};
$("#clear-draft").onclick = () => {
  if (!active || !confirm("清除此主題的文字草稿？已收藏作品不受影響。")) return;
  const t = active;
  if (mutate((s) => delete s.drafts[t[0]])) {
    dirty = false;
    cleanup();
    active = null;
    openStudio(t);
  }
};
$("#close-modal").onclick = closeModal;
$("#add-theme").onclick = addTheme;
$("#manage-themes").onclick = () => {
  modal('<h2>我的自訂主題</h2><div id="theme-manager"></div>');
  if (!state.themes.length)
    $("#theme-manager").append(el("p", "尚無自訂主題。"));
  for (const t of state.themes)
    $("#theme-manager").append(button(t.name, () => manageTheme(t.id)));
};
for (const id of [
  "work-search",
  "work-type",
  "work-sort",
  "favorite-only",
  "work-status",
  "work-view",
])
  $("#" + id).addEventListener(
    id === "work-search" ? "input" : "change",
    renderWorks,
  );
$("#export").onclick = () => {
  flushDraft();
  try {
    const raw = blocked
      ? localStorage.getItem(STORAGE_KEY)
      : JSON.stringify(state, null, 2);
    download(
      raw || "{}",
      "多元智能空間-備份-" + new Date().toISOString().slice(0, 10) + ".json",
      "application/json",
    );
  } catch (e) {
    toast("無法讀取本機資料：" + e.message);
  }
};
$("#import-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > LIMIT) throw Error("超過 5 MB");
    const imported = normalizeState(JSON.parse(await file.text()));
    modal(
      '<h2>匯入備份</h2><p id="import-summary"></p><p class="notice">取代前請先備份；合併會保留本機相同 ID 的較新版本，不覆寫現有草稿。</p><div class="row"><button id="merge-backup" class="button">合併資料</button><button id="replace-backup" class="small danger">取代全部資料</button></div>',
    );
    $("#import-summary").textContent =
      `備份含 ${imported.themes.length} 個主題、${imported.works.length} 筆作品。`;
    const apply = (replace) => {
      try {
        flushDraft();
        let next;
        if (replace) {
          if (!confirm("確定取代全部本機資料？")) return;
          next = imported;
        } else {
          next = structuredClone(state);
          for (const theme of imported.themes)
            if (!next.themes.some((t) => t.id === theme.id))
              next.themes.push(theme);
          for (const work of imported.works) {
            const i = next.works.findIndex((w) => w.id === work.id);
            if (i < 0) next.works.push(work);
            else if (
              Date.parse(work.updated || work.date) >
              Date.parse(next.works[i].updated || next.works[i].date)
            )
              next.works[i] = work;
          }
          for (const [id, draft] of Object.entries(imported.drafts)) {
            if (!Object.hasOwn(next.drafts, id))
              Object.defineProperty(next.drafts, id, {
                value: draft,
                enumerable: true,
                writable: true,
                configurable: true,
              });
          }
          next = normalizeState(next);
        }
        const wasBlocked = blocked;
        blocked = false;
        if (commit(next)) {
          cleanup();
          active = null;
          dirty = false;
          $("#studio").hidden = true;
          $("#data-warning").hidden = true;
          selectedWorks.clear();
          deletedWorks = [];
          renderThemes();
          renderWorks();
          closeModal();
          toast("匯入完成");
        } else blocked = wasBlocked;
      } catch (err) {
        toast("無法匯入：" + err.message);
      }
    };
    $("#merge-backup").onclick = () => apply(false);
    $("#replace-backup").onclick = () => apply(true);
  } catch (err) {
    toast("無法匯入：" + err.message);
  }
  e.target.value = "";
};
$("#share").onclick = () => {
  modal(
    '<h2>分享創作空間</h2><p class="muted">QR 碼分享網站網址，不會分享你的本機作品。</p><label for="share-url">公開網址</label><input id="share-url" type="url"><div id="qr"></div><p id="qr-note" role="status" class="muted"></p><div class="row"><button id="copy-url" class="button">複製網址</button><button id="download-qr" class="small">下載 QR 碼</button></div>',
  );
  const input = $("#share-url");
  input.value = location.href.split("#")[0];
  let svg = "",
    validUrl = "";
  function update() {
    try {
      const url = new URL(input.value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error();
      const qr = window.qrcode(0, "M");
      window.qrcode.stringToBytes = (s) =>
        Array.from(new TextEncoder().encode(s));
      qr.addData(url.href);
      qr.make();
      svg = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
      validUrl = url.href;
      $("#qr").innerHTML = svg;
      $("#qr svg").setAttribute("aria-label", "開啟網站的 QR 碼");
      $("#qr-note").textContent = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
      ].includes(url.hostname)
        ? "此為本機網址，其他裝置無法使用。公開部署後請使用正式網址。"
        : "掃描即可開啟此網址；請確認網站可公開存取。";
      $("#download-qr").disabled = false;
      $("#copy-url").disabled = false;
    } catch {
      validUrl = "";
      svg = "";
      $("#qr").replaceChildren();
      $("#qr-note").textContent =
        "請輸入有效的 HTTP(S) 網址，且不要包含帳號密碼。";
      $("#download-qr").disabled = true;
      $("#copy-url").disabled = true;
    }
  }
  input.oninput = update;
  $("#copy-url").onclick = () => copy(validUrl);
  $("#download-qr").onclick = () =>
    download(svg, "多元智能空間-QR.svg", "image/svg+xml");
  update();
};
$("#help").onclick = () =>
  modal(
    '<h2>開始使用</h2><ol class="rule-list"><li>選擇主題，填入文字或選取自己的素材。</li><li>文字草稿會自動保存，作品可另外收藏、編輯與下載。</li><li>照片與音訊不會上傳或長期保存，輸出成品請自行下載。</li><li>定期匯出 JSON 備份，換裝置時匯入即可繼續文字工作。</li></ol><p>所有工具免費，不含連線 AI 模型。LINE 上架需自行登入送審。影片匯出依瀏覽器能力提供 WebM 或 MP4。</p><p>隱私：本網站不設帳號、不收集作品，也不提供跨裝置同步。共用裝置請留意本機保存的內容。</p>',
  );
window.addEventListener("beforeunload", (e) => {
  if (dirty && !flushDraft()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("pagehide", flushDraft);
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    blocked = true;
    $("#data-warning").hidden = false;
    $("#data-warning").textContent =
      "其他分頁已修改資料。請先下載目前備份，再重新整理以載入最新資料，避免覆寫。";
  }
});
renderThemes();
renderWorks();
if (startupWarning) {
  $("#data-warning").textContent = startupWarning;
  $("#data-warning").hidden = false;
} else $("#storage-status").textContent = "資料僅存在這台裝置，建議定期備份。";
