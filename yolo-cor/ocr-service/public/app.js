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

const state = {
  files: [], // { file, name, url }
  results: [], // { name, ok, text, stats, table, saved, error }
  current: null,
  busy: false,
  dragDepth: 0,
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
  if (state.busy) {
    el.runBtn.textContent = "인식 중…";
  } else {
    el.runBtn.textContent = count > 1 ? `OCR 시작 (${count}장)` : "OCR 시작";
  }
  el.runBtn.disabled = state.busy || count === 0;
}

function setBusy(busy) {
  state.busy = busy;
  updateRunButton();
}

/* ---------------------------------------------------------------- */
/* 이미지 선택 (클릭 · 드래그&드롭 · 붙여넣기)                        */
/* ---------------------------------------------------------------- */

// 파일을 놓았을 때 브라우저가 이미지를 새 탭에서 열어버리는 것을 막습니다.
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
    skipped > 0
      ? `한 번에 최대 ${MAX_FILES}장까지 처리합니다. ${skipped}장은 제외했습니다.`
      : "",
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
      state.results = state.results.filter((result) => result.name !== entry.name);
      renderThumbs();
      renderQueue();
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
    const response = await fetch("/api/sample");
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
/* OCR 실행 (여러 장은 순서대로 처리)                                 */
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
  if (typeof stats.tableRows === "number" && stats.tableRows > 0) {
    parts.push(`표 ${stats.tableRows}행 × ${stats.tableColumns}열`);
  }
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

  if (result.table && result.table.rows?.length) {
    el.csvPanel.hidden = false;
    el.csvMeta.textContent = `${result.table.rowCount}행 × ${result.table.columns}열 · ${
      result.table.source === "rules" ? "괘선 기준" : "좌표 기준"
    }`;
    el.csvPreview.replaceChildren(csvRowsToTable(result.table.rows));
    el.csvDownload.disabled = false;
  } else {
    el.csvPanel.hidden = true;
    el.csvPreview.replaceChildren();
    el.csvDownload.disabled = true;
  }

  renderQueue();
}

async function runBatch() {
  if (!state.files.length || state.busy) return;

  setBusy(true);
  state.results = [];
  state.current = null;
  renderQueue();

  let succeeded = 0;
  for (let index = 0; index < state.files.length; index += 1) {
    const entry = state.files[index];
    setStatus(`${index + 1}/${state.files.length} 인식 중… (${entry.name})`);

    const form = new FormData();
    form.append("image", entry.file, entry.name);
    form.append("language", el.language.value);
    form.append("psm", el.psm.value);
    form.append("preprocess", el.preprocess.checked ? "true" : "false");
    form.append("table", el.tableMode.checked ? "true" : "false");
    form.append("save", el.autoSave.checked ? "true" : "false");

    try {
      const response = await fetch("/api/ocr", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `요청이 실패했습니다 (HTTP ${response.status})`);

      const result = {
        name: entry.name,
        ok: true,
        text: data.text || "",
        stats: {
          ...(data.stats || {}),
          tableRows: data.table?.rowCount,
          tableColumns: data.table?.columns,
        },
        table: data.table || null,
        saved: data.saved || null,
      };
      state.results.push(result);
      succeeded += 1;
      if (!state.current || state.results.length === 1) applyResult(result);
    } catch (error) {
      state.results.push({ name: entry.name, ok: false, error: error.message });
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
        setStatus(`인식 완료 · outputs/ 에 저장했습니다 (${only.saved.id})`, "ok");
        setResultStatus("자동 저장됨", "ok");
      } else {
        setStatus("인식 완료 · 자동 저장이 꺼져 있어 저장하지 않았습니다.", "ok");
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

  loadHistory();
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

      if (result.saved?.csvUrl) {
        const csvBtn = document.createElement("button");
        csvBtn.textContent = "CSV";
        csvBtn.addEventListener("click", () => {
          window.location.href = result.saved.csvUrl;
        });
        li.append(csvBtn);
      }
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

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
  const table = state.current?.table;
  if (!table?.csv) {
    setResultStatus("내려받을 표가 없습니다.", "error");
    return;
  }
  if (state.current?.saved?.csvUrl) {
    window.location.href = state.current.saved.csvUrl;
    return;
  }
  const name = state.current?.saved?.id || `ocr-${Date.now()}`;
  downloadBlob(`\ufeff${table.csv}`, `${name}.csv`, "text/csv;charset=utf-8");
  setResultStatus(`${name}.csv 로 다운로드했습니다.`, "ok");
});

el.saveBtn.addEventListener("click", async () => {
  const text = el.result.value;
  if (!text.trim()) {
    setResultStatus("저장할 텍스트가 없습니다.", "error");
    return;
  }
  el.saveBtn.disabled = true;
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        originalName: state.files[0]?.name || "직접 저장",
        language: el.language.value,
        psm: el.psm.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "저장에 실패했습니다.");
    if (state.current) state.current.saved = data.saved;
    setResultStatus(`outputs/ 에 저장했습니다 (${data.saved.id})`, "ok");
    loadHistory();
  } catch (error) {
    setResultStatus(error.message, "error");
  } finally {
    el.saveBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------- */
/* 저장 기록                                                         */
/* ---------------------------------------------------------------- */
function historyItem(item) {
  const li = document.createElement("li");
  li.className = "history-item";

  const header = document.createElement("header");
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = item.originalName;
  name.title = item.originalName;
  const time = document.createElement("time");
  time.textContent = formatDate(item.createdAt);
  header.append(name, time);

  const preview = document.createElement("p");
  preview.textContent = item.preview || "(빈 결과)";

  const row = document.createElement("div");
  row.className = "row";

  const openBtn = document.createElement("button");
  openBtn.textContent = "열기";
  openBtn.addEventListener("click", () => openHistory(item.id));

  const downloadLink = document.createElement("button");
  downloadLink.textContent = "TXT";
  downloadLink.addEventListener("click", () => {
    window.location.href = item.downloadUrl;
  });
  row.append(openBtn, downloadLink);

  if (item.csvUrl) {
    const csvBtn = document.createElement("button");
    csvBtn.textContent = "CSV";
    csvBtn.addEventListener("click", () => {
      window.location.href = item.csvUrl;
    });
    row.append(csvBtn);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "삭제";
  deleteBtn.className = "danger";
  deleteBtn.addEventListener("click", () => deleteHistory(item.id, item.originalName));
  row.append(deleteBtn);

  li.append(header, preview, row);
  return li;
}

async function loadHistory() {
  try {
    const response = await fetch("/api/history");
    const data = await response.json();
    el.historyList.replaceChildren();

    if (!data.items?.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "아직 저장된 결과가 없습니다.";
      el.historyList.append(empty);
      return;
    }

    for (const item of data.items) {
      el.historyList.append(historyItem(item));
    }
  } catch {
    el.historyList.replaceChildren();
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "기록을 불러오지 못했습니다.";
    el.historyList.append(empty);
  }
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

async function openHistory(id) {
  try {
    const response = await fetch(`/api/history/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "불러오지 못했습니다.");

    const allRows = data.csv ? parseCsv(data.csv) : null;
    state.current = {
      name: data.meta?.originalName || id,
      ok: true,
      text: data.text,
      stats: {
        chars: data.meta?.chars ?? data.text.length,
        words: data.text.split(/\s+/).filter(Boolean).length,
        lines: data.text.split("\n").filter((line) => line.trim()).length,
        confidence: data.meta?.confidence,
        durationMs: data.meta?.durationMs,
        tableRows: allRows?.length,
        tableColumns: data.meta?.table?.columns,
      },
      table: allRows
        ? {
            csv: data.csv,
            rows: allRows.slice(0, 30),
            rowCount: allRows.length,
            columns: data.meta?.table?.columns ?? allRows[0]?.length ?? 0,
            source: data.meta?.table?.source ?? "rules",
          }
        : null,
      saved: {
        id,
        downloadUrl: `/api/history/${id}/download`,
        csvUrl: data.csv ? `/api/history/${id}/download.csv` : null,
      },
    };
    applyResult(state.current);
    setResultStatus(`저장된 결과를 불러왔습니다 (${id})`, "ok");
  } catch (error) {
    setResultStatus(error.message, "error");
  }
}

async function deleteHistory(id, name) {
  if (!window.confirm(`'${name}' 결과를 삭제할까요?`)) return;
  try {
    const response = await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "삭제에 실패했습니다.");
    }
    if (state.current?.saved?.id === id) state.current.saved = null;
    loadHistory();
  } catch (error) {
    setResultStatus(error.message, "error");
  }
}

el.refreshBtn.addEventListener("click", loadHistory);

/* ---------------------------------------------------------------- */
/* 초기화                                                            */
/* ---------------------------------------------------------------- */
async function init() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();

    el.language.replaceChildren(
      ...config.languages.map(({ value, label }) => new Option(label, value)),
    );
    el.psm.replaceChildren(...config.psmModes.map(({ value, label }) => new Option(label, value)));
    el.language.value = "eng";
    el.psm.value = "6";
    $("engineBadge").textContent = `tesseract.js · 장당 최대 ${config.maxUploadMb}MB`;
  } catch {
    setStatus("서버 설정을 불러오지 못했습니다. 서버가 실행 중인지 확인해 주세요.", "error");
  }
  updateRunButton();
  loadHistory();
}

init();
