/**
 * 표(테이블) 추출기.
 * Tesseract가 돌려준 단어 위치(bbox)와 이미지의 표 괘선(세로/가로 줄)을 함께 사용해
 * 행·열 구조를 복원하고 CSV 문자열로 만듭니다.
 */
import sharp from "sharp";

const DARK_THRESHOLD = 128;
const MIN_COLUMNS = 2;
const MIN_ROWS = 2;

/** Tesseract blocks -> 텍스트 줄 목록 (단어 bbox 포함) */
function collectLines(blocks) {
  const lines = [];
  for (const block of blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const words = (line.words || [])
          .filter((word) => word.text?.trim() && word.bbox)
          .map((word) => ({
            text: word.text.trim(),
            bbox: word.bbox,
            confidence: word.confidence ?? 0,
          }));
        if (!words.length) continue;

        words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
        const y0 = Math.min(...words.map((word) => word.bbox.y0));
        const y1 = Math.max(...words.map((word) => word.bbox.y1));
        lines.push({ words, y0, y1, centerY: (y0 + y1) / 2 });
      }
    }
  }
  lines.sort(
    (a, b) => a.centerY - b.centerY || a.words[0].bbox.x0 - b.words[0].bbox.x0,
  );
  return lines;
}

/** 픽셀 투영(projection)으로 긴 세로/가로 괘선 위치를 찾습니다. */
async function detectRules(buffer) {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const columnDark = new Uint32Array(width);
  const rowDark = new Uint32Array(height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if (data[rowStart + x] < DARK_THRESHOLD) {
        columnDark[x] += 1;
        count += 1;
      }
    }
    rowDark[y] = count;
  }

  return {
    verticals: groupRuns(columnDark, height * 0.5),
    horizontals: groupRuns(rowDark, width * 0.55),
    width,
    height,
  };
}

/** 임계값을 넘는 연속 구간을 하나의 선(중심 좌표)으로 묶습니다. */
function groupRuns(counts, threshold) {
  const centers = [];
  let runStart = -1;
  let gap = 0;

  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= threshold) {
      if (runStart === -1) runStart = i;
      gap = 0;
    } else if (runStart !== -1) {
      gap += 1;
      if (gap > 2) {
        centers.push(Math.round((runStart + i - gap) / 2));
        runStart = -1;
        gap = 0;
      }
    }
  }
  if (runStart !== -1) centers.push(Math.round((runStart + counts.length - 1) / 2));

  // 두꺼운 선이 여러 조각으로 잡히면 가까운 것끼리 합칩니다.
  const merged = [];
  for (const center of centers) {
    const last = merged.at(-1);
    if (last !== undefined && center - last < 12) {
      merged[merged.length - 1] = Math.round((last + center) / 2);
    } else {
      merged.push(center);
    }
  }
  return merged;
}

/** 괘선이 없을 때: 단어 x좌표를 간격 기준으로 묶어 열을 추정합니다. */
function clusterColumns(lines, width) {
  const units = lines.flatMap((line) =>
    line.words.map((word) => ({
      center: (word.bbox.x0 + word.bbox.x1) / 2,
      height: word.bbox.y1 - word.bbox.y0,
    })),
  );
  if (!units.length) return [];

  const medianHeight = median(units.map((unit) => unit.height)) || 20;
  const gapThreshold = Math.max(medianHeight * 1.4, width * 0.02);
  const sorted = units.map((unit) => unit.center).sort((a, b) => a - b);

  const boundaries = [];
  let previous = sorted[0];
  for (const center of sorted.slice(1)) {
    if (center - previous > gapThreshold) boundaries.push(Math.round((previous + center) / 2));
    previous = center;
  }
  return boundaries;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function columnIndex(bounds, x) {
  for (let i = 0; i < bounds.length - 1; i += 1) {
    if (x >= bounds[i] && x < bounds[i + 1]) return i;
  }
  return bounds.length - 2;
}

function cleanCell(value) {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();

  // 셀 가장자리에 딸려 들어온 표 괘선 조각( |, [, ], {, } ) 제거
  text = text.replace(/^[|[\]{}¦\s]+/, "").replace(/[|[\]{}¦\s]+$/, "");
  // 점선 리더(.......)나 밑줄 잔재 제거
  text = text.replace(/[._]{3,}/g, " ").replace(/\s{2,}/g, " ").trim();
  // 앞뒤에 남은 따옴표 노이즈 제거
  text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
  // "61, 744" 처럼 끊어진 천 단위 구분 복원
  text = text.replace(/(\d),\s+(\d{3})(?!\d)/g, "$1,$2");

  return text;
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cleanCell(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

/**
 * @returns {null | {csv: string, rows: string[][], columns: number, source: string}}
 */
export async function extractTable({ imageBuffer, blocks }) {
  const lines = collectLines(blocks);
  if (lines.length < MIN_ROWS) return null;

  const rules = await detectRules(imageBuffer);
  const innerVerticals = rules.verticals.filter(
    (x) => x > rules.width * 0.02 && x < rules.width * 0.98,
  );

  let columns = innerVerticals;
  let source = "rules";
  if (columns.length < MIN_COLUMNS - 1) {
    columns = clusterColumns(lines, rules.width);
    source = "clusters";
  }
  if (!columns.length) return null;

  const bounds = [0, ...columns, rules.width];
  if (bounds.length - 1 < MIN_COLUMNS) return null;

  let targetLines = lines;
  if (rules.horizontals.length >= 2) {
    const top = Math.min(...rules.horizontals);
    const bottom = Math.max(...rules.horizontals);
    const inside = lines.filter((line) => line.centerY > top && line.centerY < bottom);
    if (inside.length >= MIN_ROWS) targetLines = inside;
  }

  const rows = targetLines.map((line) => {
    const cells = Array.from({ length: bounds.length - 1 }, () => []);
    for (const word of line.words) {
      const center = (word.bbox.x0 + word.bbox.x1) / 2;
      cells[columnIndex(bounds, center)].push(word.text);
    }
    const joined = cells.map((parts) => cleanCell(parts.join(" ")));
    while (joined.length && !joined.at(-1)) joined.pop();
    return joined;
  });

  const filled = rows.filter((row) => row.some((cell) => cell.trim()));
  if (filled.length < MIN_ROWS) return null;

  return {
    csv: toCsv(filled),
    rows: filled,
    columns: bounds.length - 1,
    source,
  };
}
