# OCR Studio

이미지에서 글자를 뽑아 텍스트와 표(CSV)로 저장하는 웹 서비스입니다. 업로드한 이미지를
[tesseract.js](https://github.com/naptha/tesseract.js)(WASM)로 인식하고, 결과를 서버의
`outputs/` 폴더에 `.txt` + `.json`(메타데이터) + `.csv`(표가 있을 때)로 저장합니다.

> 설치 없이 쓰는 **공개 웹 버전**: <https://basco-git.github.io/aiffel-work/yolo-ocr/>
> (OCR이 브라우저에서 실행되고, 결과는 브라우저에 저장됩니다. 아래 서버 버전은 파일로 저장합니다.)

## 기능

- **이미지 여러 장 한 번에** 선택 → 순서대로 OCR (한 번에 최대 20장)
- 드래그 & 드롭, 클릭 선택, **Ctrl+V 붙여넣기** 모두 지원
- **표 자동 추출 → CSV**: 이미지의 세로 괘선과 단어 좌표로 행·열을 복원
  - 괘선이 없는 표는 단어 간격으로 열을 추정 (화면에 "좌표 기준"으로 표시)
- 추출 텍스트 화면에서 수정 → 복사 / TXT 다운로드 / 다시 저장
- 표 미리보기 표 + CSV 다운로드(엑셀에서 한글 안 깨지도록 BOM 포함)
- 저장 기록 목록(열기 · TXT · CSV · 삭제)
- 스캔본 인식률을 높이는 자동 보정(흑백·2배 확대·대비 정규화·샤프닝)
- 언어 선택(영어/한국어/영어+한국어/일본어/중국어/독일어/프랑스어), 페이지 모드(PSM) 선택

## 실행

```powershell
cd ocr-service
npm install
npm start
```

브라우저에서 <http://localhost:3000> 을 엽니다.

- 포트 변경: `$env:PORT=4000; npm start`
- 저장 폴더 변경: `$env:OCR_OUTPUT_DIR="D:\ocr-results"; npm start`
- 개발 모드(파일 변경 시 자동 재시작): `npm run dev`

처음 인식할 때 언어 학습 데이터(`.tessdata/`)를 내려받기 때문에 수십 초가 걸릴 수 있습니다.
이후에는 캐시되므로 훨씬 빠릅니다.

## 사용법

1. 이미지를 끌어다 놓거나 클릭해서 선택합니다. (샘플: `../ocr-test.png` 버튼)
   - 여러 장을 한 번에 넣으면 위에서부터 순서대로 처리합니다.
   - 썸네일의 `×`로 목록에서 뺄 수 있습니다.
2. 언어와 페이지 모드를 고릅니다.
   - 표·문서 전체: **단일 블록 / 표(6)** — 기본값
   - 신문처럼 여러 단이 섞인 경우: **단일 열(4)** 또는 **자동(3)**
   - 간판·영수증처럼 글자가 흩어진 사진: **흩어진 텍스트(11)**
3. `OCR 시작`을 누르면 결과가 오른쪽에 표시되고, 자동 저장이 켜져 있으면 `outputs/`에 저장됩니다.
4. 표가 인식되면 아래에 **표 추출 결과** 패널이 열립니다. `CSV 다운로드`로 받거나
   기록 목록의 `CSV` 버튼으로 다시 받을 수 있습니다.
5. 필요하면 텍스트를 고친 뒤 `TXT 다운로드` 또는 `저장`을 누릅니다. (`Ctrl` + `Enter`로도 실행)

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/config` | 지원 언어·페이지 모드·업로드 제한 |
| `POST` | `/api/ocr` | `multipart/form-data`: `image`(필수), `language`, `psm`, `preprocess`, `table`, `save` |
| `POST` | `/api/save` | JSON `{ text, originalName, language, psm }` — 수정한 텍스트 저장 |
| `GET` | `/api/history` | 저장 기록 목록(최근 100개, CSV 유무 포함) |
| `GET` | `/api/history/:id` | 저장된 텍스트 + 메타데이터 + CSV 본문 |
| `GET` | `/api/history/:id/download` | `.txt` 다운로드 |
| `GET` | `/api/history/:id/download.csv` | `.csv` 다운로드 (BOM 포함) |
| `DELETE` | `/api/history/:id` | 저장 기록 삭제 |
| `GET` | `/api/sample` | `../ocr-test.png` 샘플 이미지 |

예시:

```powershell
curl.exe -X POST http://localhost:3000/api/ocr `
  -F "image=@..\ocr-test.png" -F "language=eng" -F "psm=6" -F "table=true"
```

응답(요약):

```json
{
  "text": "No. 11.—Holdings of Bills Discounted ...",
  "stats": { "chars": 4561, "words": 596, "lines": 58, "confidence": 66, "durationMs": 38800, "preprocess": true },
  "table": {
    "csv": "Date,Total,Within...",
    "rows": [["Date", "Total"], ["1934—Jan, 81", "82,732", "..."]],
    "rowCount": 54,
    "columns": 8,
    "source": "rules"
  },
  "saved": {
    "id": "ocr-20261110-161621-19xc",
    "downloadUrl": "/api/history/ocr-20261110-161621-19xc/download",
    "csvUrl": "/api/history/ocr-20261110-161621-19xc/download.csv"
  }
}
```

`table=false`로 보내면 표 추출을 건너뜁니다(빠름).

### 서버 없이 OCR만 확인

```powershell
npm start                     # 다른 터미널에서 서버 실행 중이어야 함
node scripts/test-ocr.mjs ..\ocr-test.png eng 6
```

## 폴더 구조

```
ocr-service/
├─ server.js            # Express 서버 + OCR/저장 API
├─ table.js             # 괘선·좌표로 표 구조 복원 + CSV 생성
├─ public/
│  ├─ index.html        # 화면
│  ├─ style.css
│  └─ app.js            # 업로드·일괄 처리·기록 UI 로직
├─ scripts/
│  └─ test-ocr.mjs      # 서버에 이미지를 보내 결과를 출력하는 확인용 스크립트
├─ outputs/             # 저장된 결과 (ocr-*.txt / .json / .csv) — git 제외
├─ .tessdata/           # 언어 학습 데이터 캐시 — git 제외
└─ package.json
```

## 표 추출 방식

1. Tesseract가 돌려준 단어별 좌표(bbox)를 모읍니다.
2. 이미지 픽셀을 세로·가로로 투영해 긴 괘선 위치를 찾습니다(괘선 기준).
   괘선이 거의 없으면 단어 x좌표 사이 간격으로 열을 추정합니다(좌표 기준).
3. 각 단어를 열 구간에 배정하고, 같은 줄의 단어를 셀 하나로 합칩니다.
4. 셀 가장자리의 괘선 조각, 점선 리더(`.....`), `61, 744` 같은 끊긴 숫자를 정리합니다.

## 참고·한계

- 인식률은 원본 이미지 품질에 크게 좌우됩니다. 글자가 작은 스캔본은 `자동 보정`을 켜 두는 편이 좋습니다.
- `Maturity`처럼 여러 열에 걸친 머리글은 CSV에서 한 열에만 들어갑니다(CSV에는 병합 개념이 없음).
- 오래된 스캔 표(예: `ocr-test.png`)는 오른쪽 흐린 열의 숫자가 일부 깨집니다. 표 구조(행·열)는 유지됩니다.
- 업로드 제한은 장당 20MB, 한 번에 20장입니다. 여러 장은 언어별로 순서대로 처리됩니다.
