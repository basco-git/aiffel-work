import { runOcr } from "./ocr.js";

const $ = (id) => document.getElementById(id);

const el = {
  dropzone: $("dropzone"),
  fileInput: $("fileInput"),
  dzEmpty: $("dzEmpty"),
  thumbs: $("thumbs"),
  sampleBtn: $("sampleBtn"),
  fileMeta: $("fileMeta"),
  language: $("language"),
  psm: $("psm"),
  preprocess: $("preprocess"),
  tableMode: $("tableMode"),
  autoSave: $("autoSave"),
  runBtn: $("runBtn"),
  resetBtn: $("resetBtn"),
  status: $("status"),
  queue: $("queue"),
  result: $("result"),
  stats: $("stats"),
  copyBtn: $("copyBtn"),
  downloadBtn: $("downloadBtn"),
  saveBtn: $("saveBtn"),
  resultStatus: $("resultStatus"),
  csvPanel: $("csvPanel"),
  csvMeta: $("csvMeta"),
  csvDownload: $("csvDownload"),
  csvPreview: $("csvPreview"),
  refreshBtn: $("refreshBtn"),
  historyList: $("historyList"),
};

const MAX_FILES = 20;
const HISTORY_KEY = "ocr-studio:history:v1";
const HISTORY_LIMIT = 30;

const LANGUAGES = [
  ["eng", "영어"],
  ["kor", "한국어"],
  ["eng+kor", "영어 + 한국어"],
  ["jpn", "일본어"],
  ["chi_sim", "중국어(간체)"],
  ["deu", "독일어"],
  ["fra", "프랑스어"],
];

const PSM_MODES = [
  ["3", "자동 (기본)"],
  ["4", "단일 열"],
  ["6", "단일 블록 / 표"],
  ["11", "흩어진 텍스트"],
  ["12", "흩어진 텍스트 + 방향 자동"],
];

const state = {
  files: [],
  results: [],
  current: null,
  busy: false,
  dragDepth: 0,
  history: [],
};

/* ---------------------------------------------------------------- */
/* 유틸                                                             */
/* ---------------------------------------------------------------- */
function setStatus(message, tone = "") {
  el.status.textContent = message;
  el.status.className = `status ${tone}`;
}

function setResultStatus(message, tone = "") {
  el.resultStatus.textContent = message;
  el.resultStatus.className = `status ${tone}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateRunButton() {
  const count = state.files.length;
  el.runBtn.textContent = state.busy
    ? "인식 중…"
    : count > 1
      ? `OCR 시작 (${count}장)`
      : "OCR 시작";
  el.runBtn.disabled = state.busy || count === 0;
}

function setBusy(busy) {
  state.busy = busy;
  updateRunButton();
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* ---------------------------------------------------------------- */
/* 이미지 선택                                                       */
/* ---------------------------------------------------------------- */
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => {
  event.preventDefault();
  if (event.target instanceof Element && event.target.closest("#dropzone")) return;
  const files = event.dataTransfer?.files;
  if (files?.length) addFiles(files);
});

function addFiles(fileList) {
  const incoming = Array.from(fileList || []).filter(
    (file) => file && (!file.type || file.type.startsWith("image/")),
  );
  if (!incoming.length) {
    setStatus("이미지 파일만 사용할 수 있습니다.", "error");
    return;
  }

  let skipped = 0;
  for (const file of incoming) {
    if (state.files.length >= MAX_FILES) {
      skipped += 1;
      continue;
    }
    if (file.size > 20 * 1024 * 1024) {
      skipped += 1;
      continue;
    }
    if (state.files.some((entry) => entry.file.name === file.name && entry.file.size === file.size)) {
      continue;
    }
    state.files.push({ file, name: file.name || "image.png", url: URL.createObjectURL(file) });
  }

  state.results = [];
  renderThumbs();
  renderQueue();
  updateRunButton();
  setStatus(
    skipped > 0 ? `최대 ${MAX_FILES}장 · 장당 20MB까지 처리합니다. ${skipped}장은 제외했습니다.` : "",
    skipped > 0 ? "error" : "",
  );
}

function renderThumbs() {
  el.thumbs.replaceChildren();
  el.thumbs.hidden = state.files.length === 0;
  el.dropzone.classList.toggle("has-files", state.files.length > 0);
  el.dzEmpty.querySelector("strong").textContent = state.files.length
    ? "이미지 더 추가하기"
    : "이미지를 끌어다 놓거나 클릭하세요";

  state.files.forEach((entry, index) => {
    const thumb = document.createElement("div");
    thumb.className = "thumb";

    const img = document.createElement("img");
    img.src = entry.url;
    img.alt = entry.name;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = entry.name;
    name.title = entry.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = "목록에서 빼기";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      URL.revokeObjectURL(entry.url);
      state.files.splice(index, 1);
      renderThumbs();
      updateRunButton();
    });

    thumb.append(img, name, remove);
    el.thumbs.append(thumb);
  });

  const total = state.files.reduce((sum, entry) => sum + entry.file.size, 0);
  el.fileMeta.textContent = state.files.length
    ? `${state.files.length}장 · ${formatBytes(total)}`
    : "";
}

el.fileInput.addEventListener("change", () => {
  addFiles(el.fileInput.files);
  el.fileInput.value = "";
});

el.dropzone.addEventListener("click", () => el.fileInput.click());
el.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    el.fileInput.click();
  }
});

el.dropzone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  state.dragDepth += 1;
  el.dropzone.classList.add("dragging");
});

el.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

el.dropzone.addEventListener("dragleave", (event) => {
  event.preventDefault();
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) el.dropzone.classList.remove("dragging");
});

el.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  state.dragDepth = 0;
  el.dropzone.classList.remove("dragging");
  const files = event.dataTransfer?.files;
  if (files?.length) addFiles(files);
});

document.addEventListener("paste", (event) => {
  const files = Array.from(event.clipboardData?.files || []);
  if (files.length) {
    event.preventDefault();
    addFiles(files);
  }
});

el.sampleBtn.addEventListener("click", async () => {
  try {
    setStatus("샘플 이미지를 불러오는 중…");
    // 로컬(/web/)과 GitHub Pages(/yolo-cor/) 모두에서 같은 파일을 찾습니다.
    const sampleUrl = location.pathname.includes("/web/") ? "../ocr-test.png" : "ocr-test.png";
    const response = await fetch(sampleUrl);
    if (!response.ok) throw new Error("샘플 이미지를 찾을 수 없습니다.");
    const blob = await response.blob();
    addFiles([new File([blob], "ocr-test.png", { type: blob.type || "image/png" })]);
    setStatus("샘플 이미지를 불러왔습니다. 'OCR 시작'을 눌러 주세요.");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

el.resetBtn.addEventListener("click", () => {
  for (const entry of state.files) URL.revokeObjectURL(entry.url);
  state.files = [];
  state.results = [];
  state.current = null;
  el.result.value = "";
  el.stats.textContent = "";
  el.csvPanel.hidden = true;
  setStatus("");
  setResultStatus("");
  renderThumbs();
  renderQueue();
  setBusy(false);
});

/* ---------------------------------------------------------------- */
/* OCR 실행                                                          */
/* ---------------------------------------------------------------- */
function renderStats(stats) {
  if (!stats) {
    el.stats.textContent = "";
    return;
  }
  const parts = [
    `${(stats.chars ?? 0).toLocaleString()}자`,
    `${(stats.words ?? 0).toLocaleString()}단어`,
    `${(stats.lines ?? 0).toLocaleString()}줄`,
  ];
  if (typeof stats.confidence === "number") parts.push(`신뢰도 ${stats.confidence}%`);
  if (stats.tableRows) parts.push(`표 ${stats.tableRows}행 × ${stats.tableColumns}열`);
  if (typeof stats.durationMs === "number") parts.push(`${(stats.durationMs / 1000).toFixed(1)}초`);
  el.stats.textContent = parts.join(" · ");
}

function csvRowsToTable(rows) {
  const table = document.createElement("table");
  const body = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  return table;
}

function applyResult(result) {
  state.current = result;
  el.result.value = result.text || "";
  renderStats(result.stats);

  if (result.table?.rows?.length) {
    el.csvPanel.hidden = false;
    el.csvMeta.textContent = `${result.table.rowCount}행 × ${result.table.columns}열 · ${
      result.table.source === "rules" ? "괘선 기준" : "좌표 기준"
    }`;
    el.csvPreview.replaceChildren(csvRowsToTable(result.table.rows.slice(0, 30)));
    el.csvDownload.disabled = false;
  } else {
    el.csvPanel.hidden = true;
    el.csvPreview.replaceChildren();
    el.csvDownload.disabled = true;
  }

  renderQueue();
}

async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽지 못했습니다."));
    };
    image.src = url;
  });
}

async function runBatch() {
  if (!state.files.length || state.busy) return;

  setBusy(true);
  state.results = [];
  state.current = null;
  renderQueue();

  const language = el.language.value;
  const psm = el.psm.value;
  const preprocess = el.preprocess.checked;
  const table = el.tableMode.checked;
  const autoSave = el.autoSave.checked;

  let succeeded = 0;
  for (let index = 0; index < state.files.length; index += 1) {
    const entry = state.files[index];
    const label = `${index + 1}/${state.files.length}`;
    setStatus(`${label} 준비 중… (${entry.name})`);

    try {
      const source = await loadImage(entry.file);
      const startedAt = performance.now();
      const outcome = await runOcr({
        source,
        language,
        psm,
        preprocess,
        table,
        onProgress: (message) => {
          if (message.status === "recognizing text") {
            setStatus(
              `${label} 인식 중… ${Math.round((message.progress || 0) * 100)}% (${entry.name})`,
            );
          } else if (message.status) {
            setStatus(`${label} ${message.status}… (${entry.name})`);
          }
        },
      });
      if (typeof source.close === "function") source.close();

      const durationMs = Math.round(performance.now() - startedAt);
      const result = {
        name: entry.name,
        ok: true,
        text: outcome.text,
        stats: {
          chars: outcome.text.length,
          words: outcome.text ? outcome.text.split(/\s+/).filter(Boolean).length : 0,
          lines: outcome.text ? outcome.text.split("\n").filter((line) => line.trim()).length : 0,
          confidence: outcome.confidence,
          durationMs,
          tableRows: outcome.table?.rows.length,
          tableColumns: outcome.table?.columns,
        },
        table: outcome.table
          ? {
              csv: outcome.table.csv,
              rows: outcome.table.rows,
              rowCount: outcome.table.rows.length,
              columns: outcome.table.columns,
              source: outcome.table.source,
            }
          : null,
        saved: null,
      };

      if (autoSave && outcome.text) {
        result.saved = { id: addHistoryEntry(result, { language, psm, preprocess }) };
      }

      state.results.push(result);
      succeeded += 1;
      if (state.results.length === 1) applyResult(result);
    } catch (error) {
      console.error(error);
      state.results.push({ name: entry.name, ok: false, error: error.message || "인식 실패" });
    }
    renderQueue();
  }

  setBusy(false);

  if (state.files.length === 1) {
    const only = state.results[0];
    if (only?.ok) {
      applyResult(only);
      if (!only.text) {
        setStatus("글자를 찾지 못했습니다. 다른 페이지 모드나 언어를 시도해 보세요.", "error");
      } else if (only.saved) {
        setStatus("인식 완료 · 이 브라우저에 저장했습니다.", "ok");
        setResultStatus("자동 저장됨", "ok");
      } else {
        setStatus("인식 완료 · 자동 저장이 꺼져 있습니다.", "ok");
      }
    } else {
      setStatus(only?.error || "OCR 처리에 실패했습니다.", "error");
    }
  } else {
    const failed = state.results.length - succeeded;
    setStatus(
      `${state.results.length}장 처리 완료 · 성공 ${succeeded}장${failed ? ` · 실패 ${failed}장` : ""}`,
      failed ? "error" : "ok",
    );
  }
}

function renderQueue() {
  el.queue.replaceChildren();
  if (!state.results.length) {
    el.queue.hidden = true;
    return;
  }
  el.queue.hidden = false;

  for (const result of state.results) {
    const li = document.createElement("li");
    if (state.current === result) li.classList.add("active");

    const name = document.createElement("span");
    name.className = "q-name";
    name.textContent = result.name;
    name.title = result.name;

    const stateText = document.createElement("span");
    stateText.className = `q-state ${result.ok ? "ok" : "error"}`;
    stateText.textContent = result.ok
      ? `${result.stats?.confidence ?? "-"}%${result.saved ? " · 저장됨" : ""}`
      : result.error || "실패";

    li.append(name, stateText);

    if (result.ok) {
      const openBtn = document.createElement("button");
      openBtn.textContent = "열기";
      openBtn.addEventListener("click", () => applyResult(result));
      li.append(openBtn);
    }

    el.queue.append(li);
  }
}

el.runBtn.addEventListener("click", runBatch);

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runBatch();
  }
});

/* ---------------------------------------------------------------- */
/* 결과 다루기                                                       */
/* ---------------------------------------------------------------- */
el.copyBtn.addEventListener("click", async () => {
  if (!el.result.value) {
    setResultStatus("복사할 텍스트가 없습니다.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(el.result.value);
    setResultStatus("클립보드에 복사했습니다.", "ok");
  } catch {
    setResultStatus("복사에 실패했습니다. 텍스트를 직접 선택해 복사해 주세요.", "error");
  }
});

el.downloadBtn.addEventListener("click", () => {
  const text = el.result.value;
  if (!text.trim()) {
    setResultStatus("다운로드할 텍스트가 없습니다.", "error");
    return;
  }
  const name = state.current?.saved?.id || `ocr-${Date.now()}`;
  downloadBlob(text, `${name}.txt`, "text/plain;charset=utf-8");
  setResultStatus(`${name}.txt 로 다운로드했습니다.`, "ok");
});

el.csvDownload.addEventListener("click", () => {
  const csv = state.current?.table?.csv;
  if (!csv) {
    setResultStatus("내려받을 표가 없습니다.", "error");
    return;
  }
  const name = state.current?.saved?.id || `ocr-${Date.now()}`;
  downloadBlob(`\ufeff${csv}`, `${name}.csv`, "text/csv;charset=utf-8");
  setResultStatus(`${name}.csv 로 다운로드했습니다.`, "ok");
});

el.saveBtn.addEventListener("click", () => {
  const text = el.result.value;
  if (!text.trim()) {
    setResultStatus("저장할 텍스트가 없습니다.", "error");
    return;
  }
  const result = {
    name: state.files[0]?.name || state.current?.name || "직접 저장",
    text,
    table: state.current?.table ?? null,
    stats: state.current?.stats ?? { chars: text.length },
  };
  const id = addHistoryEntry(result, {
    language: el.language.value,
    psm: el.psm.value,
    preprocess: el.preprocess.checked,
  });
  if (state.current) state.current.saved = { id };
  setResultStatus(`이 브라우저에 저장했습니다 (${id})`, "ok");
});

/* ---------------------------------------------------------------- */
/* 브라우저 저장 기록 (localStorage)                                  */
/* ---------------------------------------------------------------- */
function loadStore() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function writeStore(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
    return true;
  } catch {
    // 저장 공간이 부족하면 오래된 기록부터 줄여 다시 시도합니다.
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 10)));
      return true;
    } catch {
      return false;
    }
  }
}

function addHistoryEntry(result, settings) {
  const id = `ocr-${Date.now().toString(36)}`;
  const entry = {
    id,
    name: result.name,
    createdAt: new Date().toISOString(),
    text: result.text,
    csv: result.table?.csv ?? null,
    stats: result.stats ?? null,
    settings,
  };
  state.history = [entry, ...state.history.filter((item) => item.id !== id)];
  if (!writeStore(state.history)) {
    setResultStatus("브라우저 저장 공간이 부족해 기록을 저장하지 못했습니다.", "error");
  }
  renderHistory();
  return id;
}

function deleteHistoryEntry(id) {
  state.history = state.history.filter((item) => item.id !== id);
  writeStore(state.history);
  renderHistory();
}

function historyItem(item) {
  const li = document.createElement("li");
  li.className = "history-item";

  const header = document.createElement("header");
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = item.name;
  name.title = item.name;
  const time = document.createElement("time");
  time.textContent = formatDate(item.createdAt);
  header.append(name, time);

  const preview = document.createElement("p");
  preview.textContent = item.text.replace(/\s+/g, " ").slice(0, 100) || "(빈 결과)";

  const row = document.createElement("div");
  row.className = "row";

  const openBtn = document.createElement("button");
  openBtn.textContent = "열기";
  openBtn.addEventListener("click", () => openHistoryEntry(item));

  const downloadBtn = document.createElement("button");
  downloadBtn.textContent = "TXT";
  downloadBtn.addEventListener("click", () => {
    downloadBlob(item.text, `${item.id}.txt`, "text/plain;charset=utf-8");
  });
  row.append(openBtn, downloadBtn);

  if (item.csv) {
    const csvBtn = document.createElement("button");
    csvBtn.textContent = "CSV";
    csvBtn.addEventListener("click", () => {
      downloadBlob(`\ufeff${item.csv}`, `${item.id}.csv`, "text/csv;charset=utf-8");
    });
    row.append(csvBtn);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "삭제";
  deleteBtn.className = "danger";
  deleteBtn.addEventListener("click", () => {
    if (!window.confirm(`'${item.name}' 결과를 삭제할까요?`)) return;
    deleteHistoryEntry(item.id);
  });
  row.append(deleteBtn);

  li.append(header, preview, row);
  return li;
}

function renderHistory() {
  el.historyList.replaceChildren();
  if (!state.history.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "아직 저장된 결과가 없습니다.";
    el.historyList.append(empty);
    return;
  }
  for (const item of state.history) el.historyList.append(historyItem(item));
}

function openHistoryEntry(item) {
  const rows = item.csv ? parseCsv(item.csv) : null;
  state.current = {
    name: item.name,
    ok: true,
    text: item.text,
    stats: {
      chars: item.text.length,
      words: item.text.split(/\s+/).filter(Boolean).length,
      lines: item.text.split("\n").filter((line) => line.trim()).length,
      confidence: item.stats?.confidence,
      durationMs: item.stats?.durationMs,
      tableRows: rows?.length,
      tableColumns: rows?.[0]?.length,
    },
    table: rows
      ? {
          csv: item.csv,
          rows,
          rowCount: rows.length,
          columns: rows[0]?.length ?? 0,
          source: item.settings?.tableSource ?? "rules",
        }
      : null,
    saved: { id: item.id },
  };
  applyResult(state.current);
  setResultStatus(`저장된 결과를 불러왔습니다 (${item.id})`, "ok");
}

el.refreshBtn.addEventListener("click", () => {
  state.history = loadStore();
  renderHistory();
});

/* ---------------------------------------------------------------- */
/* 초기화                                                            */
/* ---------------------------------------------------------------- */
el.language.replaceChildren(...LANGUAGES.map(([value, label]) => new Option(label, value)));
el.psm.replaceChildren(...PSM_MODES.map(([value, label]) => new Option(label, value)));
el.language.value = "eng";
el.psm.value = "6";

state.history = loadStore();
renderHistory();
updateRunButton();
