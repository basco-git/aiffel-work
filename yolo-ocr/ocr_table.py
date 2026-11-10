"""과제 B: 표 이미지를 PaddleOCR로 읽어 행·열이 연결된 표와 검토 문서를 만든다.

실행 (yolo-ocr 폴더에서):
    .venv\\Scripts\\python ocr_table.py                 # OCR부터 다시 실행
    .venv\\Scripts\\python ocr_table.py --reuse         # 저장된 원시 OCR로 표·문서만 다시 생성

결과:
    outputs/ocr/       입력 사본, 원시 OCR JSON, 텍스트·좌표 CSV, 영역 시각화 2장
    outputs/table.csv  행 이름과 열 제목이 연결된 표 (숫자는 쉼표 없이)
    outputs/document.md  제목·출처·페이지, 복원 표, 검토 기록, 확인 필요, 합계 검산
    outputs/review_marks.png  원본 위에 수정·확인 필요·대조 위치 표시
    outputs/viewer.html  원본과 복원 표를 나란히 보는 화면
    outputs/manifest.json  출처, 입력, 모델·패키지 버전, 실행 위치와 설정
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import html
import json
import os
import platform
import re
import shutil
import sys
import time
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs"
OCR_DIR = OUT / "ocr"

STATUS_COLOR = {"수정": (230, 120, 0), "확인 필요": (220, 30, 30), "원본 일치": (20, 150, 60)}
STATUS_CSS = {"수정": "fix", "확인 필요": "check", "원본 일치": "ok"}


# ---------------------------------------------------------------- OCR 단계
def run_ocr(spec: dict, image_copy: Path) -> dict:
    """PaddleOCR을 실행하고 원시 결과와 시각화를 outputs/ocr/에 저장한다."""
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    from paddleocr import PaddleOCR

    o = spec["ocr"]
    # 모델 이름을 직접 지정한다. lang="en" + ocr_version="PP-OCRv5"가 고르는 영어 전용 모델과 같다.
    # (PaddleOCR 3.7은 lang="en"만 주면 다국어 PP-OCRv6 모델을 고르므로 영어 모델을 명시)
    ocr = PaddleOCR(
        text_detection_model_name=o["text_detection_model_name"],
        text_recognition_model_name=o["text_recognition_model_name"],
        use_doc_orientation_classify=o["use_doc_orientation_classify"],
        use_doc_unwarping=o["use_doc_unwarping"],
        use_textline_orientation=o["use_textline_orientation"],
        enable_mkldnn=o["enable_mkldnn"],
        device=o["device"],
    )
    started = time.perf_counter()
    res = ocr.predict(str(image_copy))[0]
    elapsed = round(time.perf_counter() - started, 2)

    raw = res.json["res"]
    (OCR_DIR / "raw_ocr.json").write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")

    # PaddleOCR 기본 시각화 (검출 영역 + 인식 글자)
    tmp = OCR_DIR / "_vis"
    tmp.mkdir(exist_ok=True)
    res.save_to_img(str(tmp))
    pngs = sorted(tmp.glob("*.png"))
    if pngs:
        shutil.move(str(pngs[0]), OCR_DIR / "ocr_vis_paddle.png")
    shutil.rmtree(tmp, ignore_errors=True)
    return {"seconds": elapsed}


def load_lines() -> list[dict]:
    raw = json.loads((OCR_DIR / "raw_ocr.json").read_text(encoding="utf-8"))
    lines = []
    for i, (text, score, box) in enumerate(zip(raw["rec_texts"], raw["rec_scores"], raw["rec_boxes"]), 1):
        x1, y1, x2, y2 = box
        lines.append({"id": i, "text": text, "score": round(float(score), 3),
                      "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                      "cx": (x1 + x2) / 2, "cy": (y1 + y2) / 2})
    return lines


def save_lines(lines: list[dict]) -> None:
    with open(OCR_DIR / "ocr_lines.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "text", "score", "x1", "y1", "x2", "y2"])
        for l in lines:
            w.writerow([l["id"], l["text"], l["score"], l["x1"], l["y1"], l["x2"], l["y2"]])


def font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_boxes(image_path: Path, lines: list[dict], out: Path) -> None:
    """모든 OCR 영역에 번호를 붙인 그림. 검토 기록의 '영역 번호'가 이 번호다."""
    im = Image.open(image_path).convert("RGB")
    d = ImageDraw.Draw(im)
    f = font(11)
    for l in lines:
        color = (220, 30, 30) if l["score"] < 0.95 else (40, 90, 220)
        d.rectangle([l["x1"], l["y1"], l["x2"], l["y2"]], outline=color, width=2)
        d.text((l["x1"] + 1, max(0, l["y1"] - 11)), str(l["id"]), fill=color, font=f)
    im.save(out)


# ---------------------------------------------------------------- 표 복원 단계
def clean_label(text: str) -> str:
    return re.sub(r"[\s.]+$", "", text).strip()


def to_number(text: str) -> str | None:
    """천 단위 쉼표·공백만 지운다. 그 밖의 글자가 남으면 None(자동으로 고치지 않음)."""
    s = re.sub(r"[,\s]", "", text)
    return s if s.isdigit() else None


def in_range(v, r):
    return r[0] <= v < r[1]


def column_of(line, cols):
    for c in cols:
        if in_range(line["cx"], c["x"]):
            return c
    return None


def build_table(spec: dict, lines: list[dict]) -> dict:
    lay = spec["layout"]
    cols = lay["columns"]
    label_col = cols[0]

    header = [l for l in lines if in_range(l["cy"], lay["header_y"])]
    body = [l for l in lines if in_range(l["cy"], lay["body_y"])]
    footer = [l for l in lines if in_range(l["cy"], lay["footer_y"])]

    title_lines = [l for l in header if re.match(lay["title_pattern"], l["text"])]
    col_titles = {}
    for c in cols:
        parts = sorted((l for l in header if column_of(l, cols) is c and l not in title_lines),
                       key=lambda l: l["cy"])
        col_titles[c["key"]] = {"raw": " ".join(p["text"] for p in parts), "ids": [p["id"] for p in parts]}

    # 행: 행 이름 열에 있는 줄 하나가 한 행
    rows = []
    parent = None
    for l in sorted((l for l in body if column_of(l, cols) is label_col), key=lambda l: l["cy"]):
        name = clean_label(l["text"])
        is_child = in_range(l["x1"], lay["child_x1"])
        row = {"name": name, "label_line": l, "group": parent if is_child else "", "cells": {}}
        if l["x1"] < lay["child_x1"][0]:
            parent = name
        rows.append(row)

    # 값: 같은 높이(세로 중심이 가장 가까운) 행에 붙인다
    unassigned = []
    for l in body:
        c = column_of(l, cols)
        if c is None or c is label_col:
            if c is None:
                unassigned.append(l)
            continue
        best = min(rows, key=lambda r: abs(r["label_line"]["cy"] - l["cy"]))
        gap = abs(best["label_line"]["cy"] - l["cy"])
        if gap > (l["y2"] - l["y1"]) * 0.6 or c["key"] in best["cells"]:
            unassigned.append(l)
            continue
        best["cells"][c["key"]] = l

    return {"title_lines": title_lines, "col_titles": col_titles, "rows": rows,
            "footer": sorted(footer, key=lambda l: l["x1"]), "unassigned": unassigned}


def apply_review(spec: dict, table: dict) -> tuple[list[dict], list[dict]]:
    """원시 셀 값에 검토 기록을 적용한다. 반환: (검토 항목 목록, 자동 경고 목록)."""
    lay = spec["layout"]
    cols = lay["columns"]
    by_cell = {(c["row"], c["col"]): c for c in spec["corrections"]}
    reviews, warnings = [], []
    n = 0

    def add(entry):
        nonlocal n
        n += 1
        entry["no"] = f"R{n}"
        reviews.append(entry)

    # 열 제목
    for hc in spec["header_corrections"]:
        got = table["col_titles"][hc["col"]]
        ok = got["raw"] == hc["raw"]
        if not ok:
            warnings.append(f"열 제목 '{hc['col']}' 원시값이 검토 때와 다름: 지금 '{got['raw']}', 기록 '{hc['raw']}'")
        add({"kind": "열 제목", "row": "(머리글)", "col": hc["col"], "ids": got["ids"], "raw": got["raw"],
             "value": hc["value"] if ok else got["raw"], "status": hc["status"] if ok else "확인 필요",
             "reason": hc["reason"] if ok else "원시 OCR이 검토 기록과 달라 다시 대조해야 함"})
        table["col_titles"][hc["col"]]["value"] = hc["value"] if ok else got["raw"]

    for row in table["rows"]:
        row["values"], row["status"], row["footnotes"] = {}, {}, {}
        for c in cols:
            key = c["key"]
            line = row["label_line"] if c["type"] == "label" else row["cells"].get(key)
            raw = line["text"] if line else ""
            auto = clean_label(raw) if c["type"] == "label" else (to_number(raw) if raw else "")
            rec = by_cell.get((row["name"], key))
            if rec:
                if rec["raw"] != raw:
                    warnings.append(f"{row['name']} / {key}: 원시값이 검토 때와 다름 (지금 '{raw}', 기록 '{rec['raw']}')")
                    value, status, reason = auto or "", "확인 필요", "원시 OCR이 검토 기록과 달라 다시 대조해야 함"
                else:
                    value, status, reason = rec["value"], rec["status"], rec["reason"]
                    if rec.get("footnote"):
                        row["footnotes"][key] = rec["footnote"]
                add({"kind": "셀", "row": row["name"], "col": key, "ids": [line["id"]] if line else [],
                     "raw": raw, "value": value, "status": status, "reason": reason,
                     "score": line["score"] if line else None, "box": line, "row_obj": row})
            elif auto is None:
                # 쉼표·공백 외의 글자가 섞인 숫자: 추측해서 고치지 않고 확인 필요로 남긴다
                value, status = "", "확인 필요"
                add({"kind": "셀", "row": row["name"], "col": key, "ids": [line["id"]], "raw": raw, "value": "",
                     "status": status, "reason": "숫자 외 글자가 섞여 자동 정리 불가. 원본 대조 필요",
                     "score": line["score"], "box": line, "row_obj": row})
            elif line and line["score"] < lay["low_score"]:
                value, status = auto, "확인 필요"
                add({"kind": "셀", "row": row["name"], "col": key, "ids": [line["id"]], "raw": raw, "value": auto,
                     "status": status, "reason": f"OCR 신뢰도 {line['score']} < {lay['low_score']}. 원본 대조 필요",
                     "score": line["score"], "box": line, "row_obj": row})
            else:
                value, status = auto or "", None
            row["values"][key] = value
            row["status"][key] = status
    return reviews, warnings


def run_checks(spec: dict, table: dict) -> list[dict]:
    rows = {r["name"]: r for r in table["rows"]}
    num_cols = [c["key"] for c in spec["layout"]["columns"] if c["type"] == "number"]
    out = []

    def raw_num(r, k):
        line = r["cells"].get(k)
        s = to_number(line["text"].replace(".", "")) if line else None  # 원시값은 점까지 지운 숫자로 계산
        return int(s) if s else 0

    for chk in spec["checks"]:
        total = rows[chk["total"]]
        parts = ([r for r in table["rows"] if r["group"] == chk["total"]] if chk["parts"] == "children"
                 else [rows[p] for p in chk["parts"]])
        for k in num_cols:
            fixed_sum = sum(int(p["values"][k] or 0) for p in parts)
            raw_sum = sum(raw_num(p, k) for p in parts)
            want = int(total["values"][k] or 0)
            out.append({"name": chk["name"], "col": k, "total_row": chk["total"], "parts": len(parts),
                        "expected": want, "raw_sum": raw_sum, "fixed_sum": fixed_sum,
                        "raw_ok": raw_sum == want, "fixed_ok": fixed_sum == want})
    return out


# ---------------------------------------------------------------- 결과 저장 단계
def fmt(v: str) -> str:
    return f"{int(v):,}" if v and v.isdigit() else v


def cell_rect(spec, row, key):
    """셀 위치: OCR 영역이 있으면 그 영역, 없으면(빈칸) 행 높이 × 열 범위."""
    line = row["cells"].get(key) if key != "area" else row["label_line"]
    if line:
        return [line["x1"], line["y1"], line["x2"], line["y2"]]
    col = next(c for c in spec["layout"]["columns"] if c["key"] == key)
    l = row["label_line"]
    return [col["x"][0] + 10, l["y1"] + 4, col["x"][1] - 10, l["y2"] - 4]


def save_marks(spec, image_path, table, reviews, out):
    src = Image.open(image_path).convert("RGB")
    W, H = src.size
    im = Image.new("RGB", (W + 48, H + 30), "white")  # 오른쪽: 번호 자리, 아래: 범례 자리
    im.paste(src, (0, 0))
    d = ImageDraw.Draw(im)
    f = font(13)
    for rv in reviews:
        color = STATUS_COLOR[rv["status"]]
        if rv["kind"] == "셀":
            rect = cell_rect(spec, rv["row_obj"], rv["col"])
        else:
            ids = rv["ids"]
            hl = [l for l in table["_all"] if l["id"] in ids]
            rect = [min(l["x1"] for l in hl), min(l["y1"] for l in hl), max(l["x2"] for l in hl), max(l["y2"] for l in hl)]
        d.rectangle([rect[0] - 2, rect[1] - 1, rect[2] + 2, rect[3] + 1], outline=color, width=2)
        last_col = rect[2] > W - 60
        d.text((W + 6 if last_col else rect[2] + 5, rect[1] + 2), rv["no"], fill=color, font=f)
    # 범례
    x = 10
    for s, c in STATUS_COLOR.items():
        d.rectangle([x, im.height - 22, x + 14, im.height - 8], outline=c, width=3)
        d.text((x + 18, im.height - 23), {"수정": "fixed", "확인 필요": "check needed", "원본 일치": "verified"}[s], fill=c, font=f)
        x += 130
    im.save(out)


def write_csv(spec, table, path):
    cols = spec["layout"]["columns"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["group", *[c["csv"] for c in cols], "note"])
        for r in table["rows"]:
            notes = []
            for k, n in r["footnotes"].items():
                notes.append(f"{k}: footnote {n} ({table['footnote_text'].get(n, '')})")
            for k, s in r["status"].items():
                if s == "확인 필요":
                    notes.append(f"{k}: 확인 필요")
            w.writerow([r["group"], *[r["values"][c["key"]] for c in cols], "; ".join(notes)])


def md_escape(s: str) -> str:
    return str(s).replace("|", "\\|")


def write_document(spec, table, reviews, warnings, checks, manifest, path):
    cols = spec["layout"]["columns"]
    titles = {c["key"]: table["col_titles"][c["key"]].get("value", table["col_titles"][c["key"]]["raw"]) for c in cols}
    src = spec["source"]
    L = []
    L.append(f"# {spec['title']} — OCR 복원 문서\n")
    L.append("| 항목 | 내용 |\n|---|---|")
    L.append(f"| 표 제목 | {spec['title']} (원시 OCR: `{table['title_lines'][0]['text'] if table['title_lines'] else ''}`) |")
    L.append(f"| 출처 | {src['collection']} |")
    L.append(f"| 원문 문헌 | {src['document']} |")
    L.append(f"| 원문 페이지 | {src['page']} |")
    L.append(f"| 원문 링크 | {'<' + src['url'] + '>' if src['url'].startswith('http') else src['url']} |")
    L.append(f"| 공유 조건 | {src['license']} |")
    L.append(f"| 입력 파일 | `{spec['input']}` (사본: `ocr/{Path(spec['input']).name}`) |")
    L.append(f"| OCR | PaddleOCR {manifest['packages']['paddleocr']}, 검출 `{spec['ocr']['text_detection_model_name']}`, 인식 `{spec['ocr']['text_recognition_model_name']}` (영어) |")
    L.append(f"| 실행 | {manifest['run']['location']}, {manifest['run']['started_at']} |\n")

    L.append("## 원본과 검토 표시\n")
    L.append("| 원본 | 검토 표시 (주황 수정 · 빨강 확인 필요 · 초록 원본 일치) |\n|---|---|")
    L.append(f"| ![원본](ocr/{Path(spec['input']).name}) | ![검토 표시](review_marks.png) |\n")
    L.append("원본과 복원 표를 나란히 보려면 [viewer.html](viewer.html)을 엽니다. "
             "OCR 영역 번호는 [ocr/ocr_boxes.png](ocr/ocr_boxes.png), 좌표는 [ocr/ocr_lines.csv](ocr/ocr_lines.csv)에 있습니다.\n")

    L.append("## 복원한 표\n")
    L.append("숫자는 원본처럼 천 단위 쉼표를 붙여 표시합니다. [table.csv](table.csv)에는 쉼표 없이 저장했습니다. "
             "`¹`·`²`는 원본 각주이고, 빈칸은 원본에 값이 없는 칸입니다. 표시 옆 번호는 아래 검토 기록 번호입니다.\n")
    L.append("| 구분 | " + " | ".join(md_escape(titles[c["key"]]) for c in cols) + " |")
    L.append("|---|" + "|".join(["---"] + ["---:"] * (len(cols) - 1)) + "|")
    rv_at = {(rv["row"], rv["col"]): rv for rv in reviews if rv["kind"] == "셀"}
    for r in table["rows"]:
        cells = []
        for c in cols:
            v = r["values"][c["key"]]
            v = fmt(v) if c["type"] == "number" else v
            fn = r["footnotes"].get(c["key"])
            if fn:
                v = {"1": "¹", "2": "²"}.get(fn, fn) + v
            rv = rv_at.get((r["name"], c["key"]))
            if rv and rv["status"] != "원본 일치":
                v = f"{v} ({rv['status']} {rv['no']})" if v else f"({rv['status']} {rv['no']})"
            cells.append(md_escape(v))
        L.append(f"| {r['group'] or '-'} | " + " | ".join(cells) + " |")
    L.append("")
    for n, t in table["footnote_text"].items():
        L.append(f"- {t}")
    L.append("")

    L.append("## 검토 기록\n")
    L.append("숫자는 왼쪽 행 이름과 위쪽 열 제목을 함께 짚어 원본을 확대해 대조했습니다. "
             "'영역 번호'는 `ocr/ocr_boxes.png`·`ocr/ocr_lines.csv`의 번호입니다.\n")
    L.append("| 번호 | 위치 (행 / 열) | 영역 번호 | 원시 OCR | 결과 | 상태 | 근거 |\n|---|---|---|---|---|---|---|")
    for rv in reviews:
        col_title = titles.get(rv["col"], rv["col"])
        val = fmt(rv["value"]) if rv["kind"] == "셀" and rv["col"] != "area" else rv["value"]
        L.append(f"| {rv['no']} | {md_escape(rv['row'])} / {md_escape(col_title)} | {', '.join(map(str, rv['ids'])) or '-'} | "
                 f"`{md_escape(rv['raw']) or '(빈칸)'}` | {md_escape(val) or '(빈칸)'} | **{rv['status']}** | {md_escape(rv['reason'])} |")
    L.append("")
    L.append("표 밖 글자(제목·각주) 수정:\n")
    L.append("| 원시 OCR | 결과 | 근거 |\n|---|---|---|")
    for t in spec["text_corrections"]:
        L.append(f"| `{t['raw']}` | {t['value']} | {t['reason']} |")
    L.append("")
    L.append("자동 정리 규칙 (칸마다 기록하지 않음): 숫자의 천 단위 쉼표와 공백(`3, 743, 306` → `3743306`), "
             "행 이름 끝의 점선 리더(`Alaska..` → `Alaska`). 쉼표·공백 외의 글자가 섞인 숫자는 자동으로 고치지 않고 확인 필요로 남깁니다.\n")

    L.append("## 확인 필요\n")
    pending = [rv for rv in reviews if rv["status"] == "확인 필요"]
    if pending:
        for rv in pending:
            L.append(f"- **{rv['no']}** {rv['row']} / {titles.get(rv['col'], rv['col'])}: {rv['reason']}")
    else:
        L.append("- 표 안에는 없음")
    for label, key in (("원문 문헌", "document"), ("원문 페이지", "page"), ("출처 URL", "url")):
        if src[key].startswith("확인 필요"):
            L.append(f"- {label}: {src[key].removeprefix('확인 필요').lstrip(': ') or '정보 없음'}")
    for w in warnings:
        L.append(f"- 자동 경고: {w}")
    L.append("")

    L.append("## 합계 검산\n")
    L.append("원본 표의 합계 행과 부분값의 합을 비교합니다. 원시 OCR 합은 쉼표·공백·점만 지운 값으로 계산했습니다. "
             "원시 합이 어긋난 곳은 각주 숫자가 값 앞에 붙은 칸이 있는 열이고, 검토 후에는 모두 맞습니다.\n")
    L.append("| 검산 | 열 | 원본 합계 | 원시 OCR 합 | 검토 후 합 | 결과 |\n|---|---|---:|---:|---:|---|")
    for ck in checks:
        L.append(f"| {ck['name']} ({ck['parts']}개 행) | {titles[ck['col']]} | {ck['expected']:,} | {ck['raw_sum']:,} "
                 f"{'✅' if ck['raw_ok'] else '❌'} | {ck['fixed_sum']:,} | {'일치' if ck['fixed_ok'] else '불일치'} |")
    L.append("")

    L.append("## 처리 범위와 한계\n")
    L.append(f"- 처리한 범위: `{spec['input']}` 한 장의 Table 1 전체 ({len(table['rows'])}행 × {len(cols) - 1}개 값 열 = {len(table['rows']) * (len(cols) - 1)}칸).")
    L.append("- 처리하지 않은 것: FRASER No. 11(`input/fraser-table.png`)은 이번 과제 범위에서 뺐습니다.")
    L.append("- 행·열 연결 기준: 열은 원본 세로 괘선 위치로 정한 x 범위(`review/census-table1.json`의 `layout.columns`), "
             "행은 행 이름 줄과 세로 중심이 가장 가까운 값을 붙였습니다. 들여쓴 행(x1 55~85)은 위의 'Outlying possessions'에 속한 행으로 `group`에 적었습니다.")
    L.append(f"- 어느 행에도 붙지 않은 OCR 줄: {len(table['unassigned'])}개"
             + ("" if not table["unassigned"] else " — " + ", ".join(f"#{l['id']} `{l['text']}`" for l in table["unassigned"])))
    L.append("- 'Population: 1910' 열이지만 Philippine Islands는 1903년, Panama Canal Zone은 1912년 인구입니다(원본 각주). CSV의 `note` 열에 남겼습니다.")
    L.append("- Guam·Samoa 인구는 원본 행 이름대로 추정치입니다.")
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


def write_viewer(spec, table, reviews, checks, path):
    cols = spec["layout"]["columns"]
    titles = {c["key"]: table["col_titles"][c["key"]].get("value", table["col_titles"][c["key"]]["raw"]) for c in cols}
    rv_at = {(rv["row"], rv["col"]): rv for rv in reviews if rv["kind"] == "셀"}
    e = html.escape
    rows_html = []
    for r in table["rows"]:
        tds = [f"<td class='grp'>{e(r['group'])}</td>"]
        for c in cols:
            v = r["values"][c["key"]]
            v = fmt(v) if c["type"] == "number" else v
            fn = r["footnotes"].get(c["key"])
            if fn:
                v = {"1": "¹", "2": "²"}.get(fn, fn) + v
            rv = rv_at.get((r["name"], c["key"]))
            cls = ["num" if c["type"] == "number" else "lbl"]
            tip = ""
            badge = ""
            if rv:
                cls.append(STATUS_CSS[rv["status"]])
                tip = f" title='{e(rv['no'])} {e(rv['status'])}: 원시 \"{e(rv['raw'])}\" — {e(rv['reason'])}'"
                badge = f"<sup>{e(rv['no'])}</sup>"
            tds.append(f"<td class='{' '.join(cls)}'{tip}>{e(v) or '&nbsp;'}{badge}</td>")
        rows_html.append("<tr>" + "".join(tds) + "</tr>")
    rev_html = "".join(
        f"<tr class='{STATUS_CSS[rv['status']]}'><td>{e(rv['no'])}</td><td>{e(rv['row'])} / {e(titles.get(rv['col'], rv['col']))}</td>"
        f"<td><code>{e(rv['raw']) or '(빈칸)'}</code></td><td>{e(fmt(rv['value']) if rv['kind'] == '셀' and rv['col'] != 'area' else rv['value']) or '(빈칸)'}</td>"
        f"<td><b>{e(rv['status'])}</b></td><td>{e(rv['reason'])}</td></tr>" for rv in reviews)
    chk_html = "".join(
        f"<tr><td>{e(c['name'])}</td><td>{e(titles[c['col']])}</td><td>{c['expected']:,}</td><td>{c['raw_sum']:,} {'✅' if c['raw_ok'] else '❌'}</td>"
        f"<td>{c['fixed_sum']:,} {'✅' if c['fixed_ok'] else '❌'}</td></tr>" for c in checks)
    counts = {s: sum(1 for rv in reviews if rv["status"] == s) for s in STATUS_COLOR}
    page = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Census Table 1 OCR 검토</title>
<style>
:root{{--bg:#fafaf8;--fg:#1d1d1b;--mut:#666;--line:#ddd;--fix:#e67800;--check:#dc1e1e;--ok:#14963c;--card:#fff}}
@media (prefers-color-scheme:dark){{:root{{--bg:#16171a;--fg:#e8e8e6;--mut:#9a9a9a;--line:#333;--card:#1f2024}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,"Malgun Gothic",sans-serif}}
header{{padding:16px 20px;border-bottom:1px solid var(--line)}}h1{{font-size:18px;margin:0 0 4px}}header p{{margin:0;color:var(--mut)}}
.wrap{{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;padding:16px 20px}}
@media (max-width:900px){{.wrap{{grid-template-columns:1fr}}}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto}}
.card h2{{font-size:14px;margin:0 0 8px}}img{{width:100%;height:auto;background:#fff;border-radius:4px}}
table{{border-collapse:collapse;width:100%}}th,td{{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}}
th{{font-weight:600;font-size:12px;color:var(--mut)}}td.num{{text-align:right;font-variant-numeric:tabular-nums}}td.grp{{color:var(--mut);font-size:12px}}
td.fix{{box-shadow:inset 0 0 0 2px var(--fix)}}td.check{{box-shadow:inset 0 0 0 2px var(--check)}}td.ok{{box-shadow:inset 0 0 0 2px var(--ok)}}
sup{{font-size:10px;color:var(--mut);margin-left:2px}}tr.fix td:nth-child(5){{color:var(--fix)}}tr.check td:nth-child(5){{color:var(--check)}}tr.ok td:nth-child(5){{color:var(--ok)}}
.legend span{{display:inline-block;margin-right:12px}}.legend i{{display:inline-block;width:12px;height:12px;border:2px solid;margin-right:4px;vertical-align:-1px}}
.full{{grid-column:1/-1}}.full td:nth-child(5),.full td:nth-child(1){{white-space:nowrap}}code{{font-size:12px}}
</style></head><body>
<header><h1>{e(spec['title'])} — 원본과 복원 표</h1>
<p>PaddleOCR {e(spec['ocr']['text_recognition_model_name'])} · 수정 {counts['수정']} · 확인 필요 {counts['확인 필요']} · 원본 일치 {counts['원본 일치']} · 칸에 마우스를 올리면 원시 OCR과 근거가 보입니다</p>
<p class="legend"><span><i style="border-color:var(--fix)"></i>수정</span><span><i style="border-color:var(--check)"></i>확인 필요</span><span><i style="border-color:var(--ok)"></i>원본 일치(대조함)</span></p></header>
<div class="wrap">
<section class="card"><h2>원본 (검토 표시)</h2><img src="review_marks.png" alt="원본 표 이미지에 검토 위치를 표시한 그림"></section>
<section class="card"><h2>복원한 표</h2><table><thead><tr><th>구분</th>{''.join(f'<th>{e(titles[c["key"]])}</th>' for c in cols)}</tr></thead><tbody>{''.join(rows_html)}</tbody></table>
<p>{'<br>'.join(e(t) for t in table['footnote_text'].values())}</p></section>
<section class="card full"><h2>검토 기록</h2><table><thead><tr><th>번호</th><th>위치 (행 / 열)</th><th>원시 OCR</th><th>결과</th><th>상태</th><th>근거</th></tr></thead><tbody>{rev_html}</tbody></table></section>
<section class="card full"><h2>합계 검산</h2><table><thead><tr><th>검산</th><th>열</th><th>원본 합계</th><th>원시 OCR 합</th><th>검토 후 합</th></tr></thead><tbody>{chk_html}</tbody></table></section>
</div></body></html>"""
    path.write_text(page, encoding="utf-8")


def pkg(name):
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description="표 이미지 OCR → 행·열 연결 CSV와 검토 문서")
    ap.add_argument("--spec", default="review/census-table1.json", help="처리 설정·검토 기록 파일")
    ap.add_argument("--reuse", action="store_true", help="저장된 outputs/ocr/raw_ocr.json을 다시 쓰고 OCR은 건너뜀")
    args = ap.parse_args()

    spec_path = ROOT / args.spec
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    src_img = ROOT / spec["input"]
    OCR_DIR.mkdir(parents=True, exist_ok=True)
    image_copy = OCR_DIR / src_img.name
    shutil.copy2(src_img, image_copy)

    started_at = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    manifest_path = OUT / "manifest.json"
    if args.reuse:
        if not (OCR_DIR / "raw_ocr.json").exists():
            sys.exit("outputs/ocr/raw_ocr.json이 없습니다. --reuse 없이 먼저 실행하세요.")
        prev = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
        ocr_info = prev.get("ocr_run", {"seconds": None})
        started_at = prev.get("run", {}).get("started_at", started_at)
    else:
        print("PaddleOCR 실행 중... (처음에는 모델을 내려받아 시간이 더 걸립니다)")
        ocr_info = run_ocr(spec, image_copy)
        print(f"OCR 완료: {ocr_info['seconds']}초")

    lines = load_lines()
    save_lines(lines)
    draw_boxes(image_copy, lines, OCR_DIR / "ocr_boxes.png")

    table = build_table(spec, lines)
    table["_all"] = lines
    fixed = {t["raw"]: t["value"] for t in spec["text_corrections"]}
    table["footnote_text"] = {}
    for l in table["footer"]:
        t = fixed.get(l["text"], l["text"])
        m = re.match(r"^[¹²1-9]", t)
        key = {"¹": "1", "²": "2"}.get(t[0], t[0]) if m else str(len(table["footnote_text"]) + 1)
        table["footnote_text"][key] = t

    reviews, warnings = apply_review(spec, table)
    checks = run_checks(spec, table)

    raw_doc = json.loads((OCR_DIR / "raw_ocr.json").read_text(encoding="utf-8"))
    manifest = {
        "task": "아이펠 과제 B: OCR 표 이미지 문서화",
        "table": spec["title"],
        "source": spec["source"],
        "input": {"file": spec["input"], "copy": f"outputs/ocr/{src_img.name}", "sha256": sha256(src_img),
                  "size_px": list(Image.open(src_img).size)},
        "models": {"lang": spec["ocr"]["lang"], "ocr_version": spec["ocr"]["ocr_version"],
                   "text_detection": spec["ocr"]["text_detection_model_name"],
                   "text_recognition": spec["ocr"]["text_recognition_model_name"],
                   "cache_dir": "~/.paddlex/official_models (PaddleOCR가 처음 실행할 때 내려받음)"},
        "packages": {n: pkg(n) for n in ("paddlepaddle", "paddleocr", "paddlex", "opencv-contrib-python", "numpy", "pillow")},
        "run": {"location": "로컬 PC (Windows 11, CPU, GPU 없음)",
                "python": platform.python_version(), "platform": platform.platform(),
                "command": "python ocr_table.py" + (" --reuse" if args.reuse else ""),
                "started_at": started_at},
        "ocr_run": ocr_info,
        "settings": {**spec["ocr"], "text_det_params": raw_doc.get("text_det_params"),
                     "text_rec_score_thresh": raw_doc.get("text_rec_score_thresh"),
                     "layout": spec["layout"], "spec_file": args.spec},
        "results": {"ocr_lines": len(lines), "rows": len(table["rows"]),
                    "value_cells": len(table["rows"]) * (len(spec["layout"]["columns"]) - 1),
                    "reviews": {s: sum(1 for r in reviews if r["status"] == s) for s in STATUS_COLOR},
                    "unassigned_lines": [l["id"] for l in table["unassigned"]],
                    "checks_passed": f"{sum(c['fixed_ok'] for c in checks)}/{len(checks)}",
                    "warnings": warnings},
        "outputs": ["outputs/ocr/" + src_img.name, "outputs/ocr/raw_ocr.json", "outputs/ocr/ocr_lines.csv",
                    "outputs/ocr/ocr_boxes.png", "outputs/ocr/ocr_vis_paddle.png", "outputs/table.csv",
                    "outputs/document.md", "outputs/review_marks.png", "outputs/viewer.html", "outputs/manifest.json"],
    }

    save_marks(spec, image_copy, table, reviews, OUT / "review_marks.png")
    write_csv(spec, table, OUT / "table.csv")
    write_document(spec, table, reviews, warnings, checks, manifest, OUT / "document.md")
    write_viewer(spec, table, reviews, checks, OUT / "viewer.html")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"OCR 줄 {len(lines)}개, 표 {len(table['rows'])}행, 검토 {manifest['results']['reviews']}, "
          f"합계 검산 {manifest['results']['checks_passed']}, 미배정 {len(table['unassigned'])}개")
    for w in warnings:
        print("경고:", w)


if __name__ == "__main__":
    main()
