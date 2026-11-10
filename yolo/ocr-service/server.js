/**
 * OCR 웹 서비스 서버.
 * 업로드한 이미지를 tesseract.js로 인식하고, 결과를 outputs/ 폴더에 저장합니다.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { extractTable } from "./table.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const OUTPUT_DIR = process.env.OCR_OUTPUT_DIR
  ? path.resolve(process.env.OCR_OUTPUT_DIR)
  : path.join(__dirname, "outputs");
const CACHE_DIR = path.join(__dirname, ".tessdata");
const SAMPLE_IMAGE = path.join(__dirname, "..", "ocr-test.png");

const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** UI에서 고를 수 있는 언어 조합 (tesseract 학습 데이터 이름) */
const LANGUAGES = new Map([
  ["eng", "영어"],
  ["kor", "한국어"],
  ["eng+kor", "영어 + 한국어"],
  ["jpn", "일본어"],
  ["chi_sim", "중국어(간체)"],
  ["deu", "독일어"],
  ["fra", "프랑스어"],
]);

/** 페이지 분할 방식(PSM: Page Segmentation Mode) */
const PSM_MODES = new Map([
  ["3", "자동 (기본)"],
  ["4", "단일 열"],
  ["6", "단일 블록 / 표"],
  ["11", "흩어진 텍스트"],
  ["12", "흩어진 텍스트 + 방향 자동"],
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif"]);

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(CACHE_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isImage = (file.mimetype || "").startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
    if (!isImage) {
      const error = new Error("이미지 파일만 업로드할 수 있습니다.");
      error.status = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

/* ------------------------------------------------------------------ */
/* 작업자(worker) 관리: 언어별로 1개씩 재사용하고, 요청은 순서대로 처리 */
/* ------------------------------------------------------------------ */
const workers = new Map(); // lang -> Promise<Worker>
const queues = new Map(); // lang -> Promise (직렬 처리용)

async function getWorker(lang) {
  if (!workers.has(lang)) {
    const created = createWorker(lang, 1, {
      cachePath: CACHE_DIR,
      logger: () => {}, // 진행률은 응답으로 보내지 않음
      errorHandler: (error) => console.error(`[tesseract:${lang}]`, error),
    }).then(async (worker) => {
      await worker.setParameters({ preserve_interword_spaces: "1" });
      return worker;
    });

    // 생성에 실패하면 캐시에서 지워서 다음 요청에서 재시도할 수 있게 합니다.
    created.catch(() => workers.delete(lang));
    workers.set(lang, created);
  }
  return workers.get(lang);
}

function runExclusive(lang, task) {
  const previous = queues.get(lang) ?? Promise.resolve();
  const current = previous.then(task, task);
  queues.set(
    lang,
    current.catch(() => {}),
  );
  return current;
}

/**
 * OCR 전 이미지를 보정합니다. 작은 글씨가 뭉개진 스캔본에서 인식률이 올라갑니다.
 * - 흑백 변환, 2배 확대, 대비 정규화, 샤프닝
 * 보정에 실패하면 원본을 그대로 사용합니다.
 */
async function preprocessImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const shouldUpscale = width > 0 && width * 2 <= 3200;
    let pipeline = sharp(buffer).grayscale();
    if (shouldUpscale) pipeline = pipeline.resize({ width: width * 2, kernel: "lanczos3" });
    return await pipeline.normalize().sharpen({ sigma: 1.2 }).png().toBuffer();
  } catch (error) {
    console.warn("[preprocess] 원본 이미지를 사용합니다:", error.message);
    return buffer;
  }
}

/* ------------------------------------------------------------------ */
/* 저장 파일 관리 */
/* ------------------------------------------------------------------ */
function timestampId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `ocr-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

function safeId(id) {
  return /^ocr-[0-9]{8}-[0-9]{6}-[a-z0-9]{4}$/.test(id);
}

function outputPaths(id) {
  return {
    text: path.join(OUTPUT_DIR, `${id}.txt`),
    meta: path.join(OUTPUT_DIR, `${id}.json`),
    csv: path.join(OUTPUT_DIR, `${id}.csv`),
  };
}

async function saveResult({ id, text, meta, csv = null }) {
  const files = outputPaths(id);
  await fs.writeFile(files.text, text, "utf8");
  await fs.writeFile(files.meta, JSON.stringify(meta, null, 2), "utf8");
  if (csv) await fs.writeFile(files.csv, csv.startsWith("\ufeff") ? csv : `\ufeff${csv}`, "utf8");
}

/* ------------------------------------------------------------------ */
/* API */
/* ------------------------------------------------------------------ */
app.get("/api/config", (_req, res) => {
  res.json({
    languages: [...LANGUAGES].map(([value, label]) => ({ value, label })),
    psmModes: [...PSM_MODES].map(([value, label]) => ({ value, label })),
    maxUploadMb: MAX_UPLOAD_BYTES / 1024 / 1024,
    outputDir: OUTPUT_DIR,
  });
});

app.post("/api/ocr", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "이미지 파일이 필요합니다." });
    return;
  }

  const language = String(req.body.language || "eng");
  if (!LANGUAGES.has(language)) {
    res.status(400).json({ error: `지원하지 않는 언어입니다: ${language}` });
    return;
  }

  const psm = String(req.body.psm || "3");
  if (!PSM_MODES.has(psm)) {
    res.status(400).json({ error: `지원하지 않는 PSM 값입니다: ${psm}` });
    return;
  }

  const shouldSave = String(req.body.save ?? "true") !== "false";
  const usePreprocess = String(req.body.preprocess ?? "true") === "true";
  const wantTable = String(req.body.table ?? "true") !== "false";
  const startedAt = Date.now();

  const imageBuffer = usePreprocess ? await preprocessImage(req.file.buffer) : req.file.buffer;

  let text;
  let confidence = 0;
  let table = null;
  try {
    const result = await runExclusive(language, async () => {
      const worker = await getWorker(language);
      await worker.setParameters({ tessedit_pageseg_mode: psm, user_defined_dpi: "300" });
      return worker.recognize(imageBuffer, {}, { text: true, blocks: true });
    });

    text = (result.data.text || "").trim();
    confidence = Math.round(result.data.confidence || 0);

    if (wantTable) {
      table = await extractTable({ imageBuffer, blocks: result.data.blocks }).catch((error) => {
        console.warn("[table]", error.message);
        return null;
      });
    }
  } catch (error) {
    console.error("[ocr]", error);
    const hint = /download|network|ENOTFOUND|fetch/i.test(String(error?.message))
      ? " (처음 실행 시 언어 데이터를 내려받습니다. 인터넷 연결을 확인해 주세요.)"
      : "";
    res.status(500).json({ error: `OCR 처리에 실패했습니다.${hint}` });
    return;
  }

  const durationMs = Date.now() - startedAt;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const lineCount = text ? text.split("\n").filter((line) => line.trim()).length : 0;
  const originalName = Buffer.from(req.file.originalname || "image", "latin1").toString("utf8");

  const payload = {
    text,
    stats: {
      chars: text.length,
      words: wordCount,
      lines: lineCount,
      confidence,
      durationMs,
      preprocess: usePreprocess,
    },
  };

  if (table) {
    payload.table = {
      csv: table.csv,
      rows: table.rows.slice(0, 30),
      columns: table.columns,
      rowCount: table.rows.length,
      source: table.source,
    };
  }

  if (shouldSave && text) {
    const id = timestampId();
    const createdAt = new Date().toISOString();
    const meta = {
      id,
      originalName,
      language,
      psm,
      preprocess: usePreprocess,
      ...payload.stats,
      table: table ? { columns: table.columns, rows: table.rows.length, source: table.source } : null,
      createdAt,
      bytes: req.file.size,
    };
    await saveResult({ id, text, meta, csv: table?.csv ?? null });
    payload.saved = {
      id,
      createdAt,
      downloadUrl: `/api/history/${id}/download`,
      csvUrl: table ? `/api/history/${id}/download.csv` : null,
    };
  } else {
    payload.saved = null;
  }

  res.json(payload);
});

app.post("/api/save", express.json(), async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  if (!text.trim()) {
    res.status(400).json({ error: "저장할 텍스트가 없습니다." });
    return;
  }

  const id = timestampId();
  const createdAt = new Date().toISOString();
  await saveResult({
    id,
    text: text.endsWith("\n") ? text : `${text}\n`,
    meta: {
      id,
      originalName: String(req.body?.originalName || "직접 저장"),
      language: String(req.body?.language || "-"),
      psm: String(req.body?.psm || "-"),
      chars: text.length,
      createdAt,
      bytes: Buffer.byteLength(text, "utf8"),
    },
  });

  res.status(201).json({ saved: { id, createdAt, downloadUrl: `/api/history/${id}/download` } });
});

app.get("/api/history", async (_req, res) => {
  const entries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => entry.name.slice(0, -4))
    .filter(safeId);

  const items = await Promise.all(
    ids.map(async (id) => {
      const files = outputPaths(id);
      const [stat, text, metaRaw, csvExists] = await Promise.all([
        fs.stat(files.text),
        fs.readFile(files.text, "utf8"),
        fs.readFile(files.meta, "utf8").catch(() => null),
        fs
          .stat(files.csv)
          .then(() => true)
          .catch(() => false),
      ]);
      let meta = {};
      if (metaRaw) {
        try {
          meta = JSON.parse(metaRaw);
        } catch {
          meta = {};
        }
      }
      return {
        id,
        originalName: meta.originalName || "이름 없음",
        language: meta.language || "-",
        confidence: meta.confidence ?? null,
        chars: text.trim().length,
        createdAt: meta.createdAt || stat.mtime.toISOString(),
        preview: text.trim().replace(/\s+/g, " ").slice(0, 100),
        downloadUrl: `/api/history/${id}/download`,
        csvUrl: csvExists ? `/api/history/${id}/download.csv` : null,
      };
    }),
  );

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ items: items.slice(0, 100), total: items.length });
});

app.get("/api/history/:id", async (req, res) => {
  const { id } = req.params;
  if (!safeId(id)) {
    res.status(400).json({ error: "잘못된 id입니다." });
    return;
  }
  try {
    const files = outputPaths(id);
    const text = await fs.readFile(files.text, "utf8");
    const meta = await fs
      .readFile(files.meta, "utf8")
      .then((raw) => JSON.parse(raw))
      .catch(() => ({}));
    const csv = await fs
      .readFile(files.csv, "utf8")
      .then((raw) => raw.replace(/^\ufeff/, ""))
      .catch(() => null);
    res.json({ id, text, meta, csv });
  } catch {
    res.status(404).json({ error: "저장된 결과를 찾을 수 없습니다." });
  }
});

app.get("/api/history/:id/download", async (req, res) => {
  const { id } = req.params;
  if (!safeId(id)) {
    res.status(400).json({ error: "잘못된 id입니다." });
    return;
  }
  const files = outputPaths(id);
  try {
    await fs.access(files.text);
  } catch {
    res.status(404).json({ error: "저장된 결과를 찾을 수 없습니다." });
    return;
  }
  res.download(files.text, `${id}.txt`);
});

app.get("/api/history/:id/download.csv", async (req, res) => {
  const { id } = req.params;
  if (!safeId(id)) {
    res.status(400).json({ error: "잘못된 id입니다." });
    return;
  }
  const files = outputPaths(id);
  try {
    await fs.access(files.csv);
  } catch {
    res.status(404).json({ error: "저장된 CSV가 없습니다." });
    return;
  }
  res.download(files.csv, `${id}.csv`);
});

app.delete("/api/history/:id", async (req, res) => {
  const { id } = req.params;
  if (!safeId(id)) {
    res.status(400).json({ error: "잘못된 id입니다." });
    return;
  }
  const files = outputPaths(id);
  try {
    await fs.unlink(files.text);
  } catch {
    res.status(404).json({ error: "저장된 결과를 찾을 수 없습니다." });
    return;
  }
  await fs.unlink(files.meta).catch(() => {});
  await fs.unlink(files.csv).catch(() => {});
  res.json({ deleted: id });
});

app.get("/api/sample", (_req, res) => {
  res.sendFile(SAMPLE_IMAGE, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ error: "샘플 이미지(../ocr-test.png)가 없습니다." });
    }
  });
});

/* 공통 오류 처리 */
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? `파일이 너무 큽니다. 최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB까지 업로드할 수 있습니다.`
        : error.message;
    res.status(400).json({ error: message });
    return;
  }
  if (error?.status === 400) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error("[server]", error);
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

const server = app.listen(PORT, () => {
  console.log(`OCR 웹 서비스 실행: http://localhost:${PORT}`);
  console.log(`저장 폴더: ${OUTPUT_DIR}`);
});

async function shutdown() {
  server.close();
  await Promise.allSettled(
    [...workers.values()].map(async (pending) => (await pending).terminate()),
  );
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
