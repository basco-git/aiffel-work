/** 로컬 서버에 ocr-test.png를 보내 표 추출 결과를 확인하는 테스트 스크립트 */
import fs from "node:fs";

const [target = "../ocr-test.png", language = "eng", psm = "6"] = process.argv.slice(2);

const form = new FormData();
form.append("image", new Blob([fs.readFileSync(target)], { type: "image/png" }), "ocr-test.png");
form.append("language", language);
form.append("psm", psm);
form.append("preprocess", "true");
form.append("table", "true");
form.append("save", "true");

const response = await fetch("http://localhost:3000/api/ocr", { method: "POST", body: form });
const data = await response.json();

if (!response.ok) {
  console.error("실패:", response.status, data);
  process.exit(1);
}

console.log(
  `conf=${data.stats.confidence} chars=${data.stats.chars} table=${data.table?.rowCount ?? 0}행 x ${data.table?.columns ?? 0}열 source=${data.table?.source ?? "-"}`,
);
console.log((data.table?.rows ?? []).map((row) => row.join(" | ")).join("\n"));
console.log("saved:", data.saved?.id, data.saved?.csvUrl ?? "(no csv)");
