/**
 * 브라우저 OCR 모듈.
 * tesseract.js(CDN, UMD)로 이미지를 인식하고, 필요하면 표 구조까지 뽑습니다.
 * 언어별 worker를 재사용하고, 동시 요청은 순서대로 처리합니다.
 */
import { extractTable } from "./table.js";

const workers = new Map();
const queues = new Map();

let progressHandler = null;

function getWorker(language) {
  if (!workers.has(language)) {
    const created = Tesseract.createWorker(language, 1, {
      logger: (message) => {
        if (progressHandler && typeof message.progress === "number") {
          progressHandler(message);
        }
      },
    }).then(async (worker) => {
      await worker.setParameters({ preserve_interword_spaces: "1" });
      return worker;
    });

    created.catch(() => workers.delete(language));
    workers.set(language, created);
  }
  return workers.get(language);
}

function runExclusive(language, task) {
  const previous = queues.get(language) ?? Promise.resolve();
  const current = previous.then(task, task);
  queues.set(
    language,
    current.catch(() => {}),
  );
  return current;
}

/** 2배 확대 + 흑백 + 대비 정규화 + 샤프닝 */
export function prepareCanvas(image, preprocess) {
  const scale = preprocess && image.width * 2 <= 3200 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (preprocess) {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    enhance(imageData);
    context.putImageData(imageData, 0, 0);
  }
  return canvas;
}

function enhance(imageData) {
  const { data, width, height } = imageData;
  const total = width * height;
  const gray = new Uint8ClampedArray(total);
  const histogram = new Uint32Array(256);

  for (let i = 0, j = 0; j < total; i += 4, j += 1) {
    const value = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    gray[j] = value;
    histogram[value] += 1;
  }

  // 상하위 2%를 잘라 대비를 늘립니다.
  const cut = total * 0.02;
  let low = 0;
  let high = 255;
  let accumulated = 0;
  for (let value = 0; value < 256; value += 1) {
    accumulated += histogram[value];
    if (accumulated >= cut) {
      low = value;
      break;
    }
  }
  accumulated = 0;
  for (let value = 255; value >= 0; value -= 1) {
    accumulated += histogram[value];
    if (accumulated >= cut) {
      high = value;
      break;
    }
  }
  const span = high - low;
  const factor = span > 10 ? 255 / span : 1;

  const normalized = new Uint8ClampedArray(total);
  for (let j = 0; j < total; j += 1) {
    normalized[j] = span > 10 ? (gray[j] - low) * factor : gray[j];
  }

  // 3x3 샤프닝 커널 [0,-1,0,-1,5,-1,0,-1,0]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const center = normalized[i];
      const up = y > 0 ? normalized[i - width] : center;
      const down = y < height - 1 ? normalized[i + width] : center;
      const left = x > 0 ? normalized[i - 1] : center;
      const right = x < width - 1 ? normalized[i + 1] : center;
      const value = center * 5 - up - down - left - right;
      const out = i * 4;
      data[out] = value;
      data[out + 1] = value;
      data[out + 2] = value;
      data[out + 3] = 255;
    }
  }
}

/**
 * 이미지를 인식합니다.
 * @param {{source: CanvasImageSource & {width:number,height:number}, language: string, psm: string,
 *          preprocess: boolean, table: boolean, onProgress?: (message: object) => void}} options
 */
export async function runOcr({ source, language, psm, preprocess, table, onProgress }) {
  progressHandler = onProgress || null;
  try {
    const canvas = prepareCanvas(source, preprocess);

    const result = await runExclusive(language, async () => {
      const worker = await getWorker(language);
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        user_defined_dpi: "300",
      });
      return worker.recognize(canvas, {}, { text: true, blocks: true });
    });

    const text = (result.data.text || "").trim();
    const confidence = Math.round(result.data.confidence || 0);

    let tableResult = null;
    if (table) {
      try {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        tableResult = extractTable({ imageData, blocks: result.data.blocks });
      } catch (error) {
        console.warn("표 추출을 건너뜁니다:", error);
      }
    }

    return { text, confidence, table: tableResult };
  } finally {
    progressHandler = null;
  }
}
