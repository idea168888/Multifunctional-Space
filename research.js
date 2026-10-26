import { promptTask, automationScript } from "./creative.js";
export function mountResearch(root, api) {
  const section = document.createElement("section");
  section.className = "research-agent";
  section.innerHTML = `<hr><div class="section-top"><div><p class="eyebrow">PROMPT TO WORKFLOW</p><h3>提示詞任務工作台</h3></div><span class="tag">免費規則式規劃 · 不含連線 AI</span></div><label for="agent-prompt">你想做出什麼？</label><textarea id="agent-prompt" maxlength="3000" rows="4" placeholder="例如：製作一組幽默、會彈跳的動態貼圖；或設計一張復古咖啡海報"></textarea><div class="work-actions"><button id="agent-plan" class="button">拆解任務</button><button id="agent-run" class="small">在本站建立草稿 ↗</button></div><div id="agent-result" class="result" role="status">輸入目標後，會辨識本站工具並產生可編輯任務清單。</div><div class="work-actions"><button id="agent-save" class="small">收藏任務</button><button id="agent-json" class="small">下載任務 JSON</button><button id="agent-copy" class="small">複製任務說明</button></div><details><summary>外部網站／軟體工作流程</summary><p class="notice">本網站無法直接跨網站操作你的登入帳號或控制電腦程式。可在下方建立外部任務，下載需自行執行的 Playwright 範本；只導覽、填入你指定的欄位與截圖，不自動按送出或登入。對有自動儲存功能的網站，填入欄位仍可能保存內容，執行前請先確認網站行為與使用權限。</p><label for="agent-url">目標網站（HTTP(S)，不含帳密）</label><input id="agent-url" type="url" maxlength="2000" placeholder="https://example.com/editor"><label for="agent-selector">要填寫的 CSS 選擇器（選填）</label><input id="agent-selector" maxlength="500" placeholder="例如 textarea[name=prompt]"><label for="agent-value">填入的文字（選填）</label><textarea id="agent-value" maxlength="5000"></textarea><div class="work-actions"><button id="agent-script" class="small">下載自動化範本 .mjs</button><a id="agent-open" class="small" target="_blank" rel="noopener noreferrer" hidden>人工開啟目標網站 ↗</a></div><p class="muted">不執行提示詞內的程式碼、不儲存密碼。範本需在自己的電腦安裝 Node.js 與 Playwright；網站可能要求登入、限制自動化或收費，使用前請自行確認。桌面軟體需另有該軟體官方支援的 API。</p></details>`;
  root.append(section);
  const $ = (s) => section.querySelector(s);
  let task = null,
    savedId = null;
  function build() {
    const prompt = $("#agent-prompt").value.trim();
    if (!prompt) throw Error("請先輸入提示詞");
    task = promptTask(prompt);
    $("#agent-result").textContent =
      `目標工具：${{ sticker: "LINE 貼圖工坊", art: "圖文靈感所", video: "影片創作室", research: "研發實驗室" }[task.target]}\n風格：${task.style}\n需求：${task.prompt}\n\n${task.steps.map((s, i) => i + 1 + ". " + s).join("\n")}\n\n這是依關鍵字與規則產生的任務，不會宣稱已完成外部軟體操作。`;
    return task;
  }
  $("#agent-plan").onclick = () => {
    try {
      build();
      api.onChange();
    } catch (e) {
      api.toast(e.message);
    }
  };
  $("#agent-run").onclick = () => {
    try {
      api.runTask(build());
    } catch (e) {
      api.toast(e.message);
    }
  };
  $("#agent-save").onclick = () => {
    try {
      const t = build();
      const id = api.saveWork(
        t.prompt.slice(0, 100),
        $("#agent-result").textContent,
        "research",
        savedId ? { id: savedId } : {},
      );
      if (id) savedId = id;
    } catch (e) {
      api.toast(e.message);
    }
  };
  $("#agent-json").onclick = () => {
    try {
      api.download(
        JSON.stringify(build(), null, 2),
        "創作任務.json",
        "application/json",
      );
    } catch (e) {
      api.toast(e.message);
    }
  };
  $("#agent-copy").onclick = () => {
    try {
      build();
      api.copy($("#agent-result").textContent);
    } catch (e) {
      api.toast(e.message);
    }
  };
  $("#agent-script").onclick = () => {
    try {
      const script = automationScript(
        $("#agent-url").value,
        $("#agent-selector").value,
        $("#agent-value").value || $("#agent-prompt").value,
      );
      api.download(script, "外部工作流程.mjs", "text/javascript;charset=utf-8");
    } catch (e) {
      api.toast(e.message);
    }
  };
  function link() {
    try {
      const u = new URL($("#agent-url").value);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
        throw Error();
      $("#agent-open").href = u.href;
      $("#agent-open").hidden = false;
    } catch {
      $("#agent-open").removeAttribute("href");
      $("#agent-open").hidden = true;
    }
  }
  $("#agent-url").oninput = link;
  root.addEventListener("restore-draft", () => {
    link();
    if ($("#agent-prompt").value) build();
  });
  return () => {};
}
