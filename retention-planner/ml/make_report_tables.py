"""보고서 표 자동 생성: results/*.json → docs/REPORT.md의 표시 구간에 한글 표를 채운다.

REPORT.md 안에서 아래 두 줄 사이의 내용을 통째로 바꾼다(그 밖의 글은 건드리지 않음).
    <!-- 표:이름 -->
    <!-- /표:이름 -->
수치를 손으로 옮기지 않기 위한 도구다. run_all.ps1의 마지막 단계에서 실행된다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "results"
REPORT = ROOT / "docs" / "REPORT.md"  # README.md도 함께 채움

NAME1 = {"random": "무작위", "tenure": "근속 짧은 순", "logit": "로지스틱 회귀", "rf": "랜덤 포레스트",
         "hgb": "히스토그램 부스팅(HistGradientBoosting)", "gb": "그래디언트 부스팅", "tabicl": "TabICL(사전학습)"}
NAME2 = {"random": "무작위", "risk": "위험 순", "expert": "HR 전문가 규칙",
         "uplift": "효과 순(추정)", "oracle": "진짜 효과 순(상한)"}
UPLIFT = {"t_hgb": "두 모델 비교법 · 부스팅 (T-learner, HistGB)",
          "t_logit": "두 모델 비교법 · 로지스틱 (T-learner)",
          "s_logit": "한 모델 상호작용법 · 로지스틱 (S-learner)"}
ARM = {"none": "면담 없음", "lead": "팀장 면담", "exec": "임원 면담"}


def load(p):
    return json.loads((RES / p).read_text(encoding="utf-8"))


def pct(x, nd=1):
    return "—" if x is None else f"{x * 100:.{nd}f}%"


def num(x, nd=3):
    return "—" if x is None else f"{x:.{nd}f}"


def eok(won):
    return f"{won / 1e8:.2f}억"


def table(head, rows):
    out = ["| " + " | ".join(head) + " |", "| " + " | ".join(["---"] * len(head)) + " |"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def case(ref, sc, k=0.2):
    return next(c for c in ref["cases"] if c["scenario"] == sc and c["inputs"]["k"] == k)


def build():
    meta, ref = load("meta.json"), load("reference.json")
    met = {sc: load(f"{sc}/metrics.json") for sc in "AB"}
    t = {}

    # 실행 정보
    v = meta["versions"]
    t["실행정보"] = table(["항목", "값"], [
        ["생성 시각", meta["generated_at"]],
        ["시드 / 인원", f"{meta['seed']} / {meta['n']:,}명"],
        ["분할", f"훈련 {meta['split']['train']:,}명 · 시험 {meta['split']['test']:,}명 (1단계 시험 {meta['split']['stage1_test']:,}명은 면담 없음 갈래만)"],
        ["실행 시간", f"{meta['runtime_sec']}초"],
        ["환경", f"Python {v['python']}, numpy {v['numpy']}, pandas {v['pandas']}, scikit-learn {v['scikit-learn']}"],
    ])

    # 데이터 요약
    rows = []
    for sc, label in (("A", "A (효과 균일)"), ("B", "B (사유 × 권한 궁합)")):
        s = meta["scenarios"][sc]
        rows.append([label] + [pct(s["leave_rate"][a]) for a in ("none", "lead", "exec")] + [pct(s["decided_rate"])])
    t["데이터"] = table(["시나리오", "퇴사율: 면담 없음", "팀장 면담", "임원 면담", "이미 결심(숨은 변수)"], rows)

    # 1단계 비교
    s1 = met["A"]["stage1"]
    rows = []
    for m in s1["methods"]:
        rows.append([("**" + NAME1[m["id"]] + "**") if m["id"] == meta["best_stage1_model"] else NAME1[m["id"]],
                     num(m["cv_auc"]), num(m["auc"]), pct(m["accuracy"]), num(m["brier_cal"]),
                     pct(m["capture"]["10"]), pct(m["capture"]["20"]), num(m["lift"]["20"], 2)])
    t["1단계"] = (table(["방법", "훈련 교차검증 AUC", "시험 AUC", "정확도", "Brier(보정 후)", "상위 10% 포착률", "상위 20% 포착률", "리프트(20%)"], rows)
                 + f"\n\n시험 {s1['n_test']:,}명, 실제 퇴사율 {pct(s1['leave_rate'])}, "
                 f"\"모두 남는다\"고만 답할 때의 정확도 {pct(s1['all_stay_accuracy'])}. 굵은 글씨는 훈련 교차검증으로 고른 대표 모델.")

    # 1단계 비용
    c = case(ref, "A")
    inp = c["inputs"]
    rows = []
    for mid in [m for m in ("random", "tenure", "logit", "rf", "hgb", "gb", "tabicl") if m in c["stage1"]]:
        x = c["stage1"][mid]
        rows.append([NAME1[mid], f"{x['S']}명", f"{x['TP']}명", f"{x['TP'] * inp['r']:.1f}명", f"{x['unneeded']}명", eok(x["net"])])
        if "threshold" in x and mid == meta["best_stage1_model"]:
            th = x["threshold"]
            rows.append([f"{NAME1[mid]} · 비용 기준 선택", f"{th['S']}명", f"{th['TP']}명", f"{th['TP'] * inp['r']:.1f}명", f"{th['S'] - th['TP']}명", eok(th["net"])])
    # 11-17 표현 변경(사용자 요청): 찾은 퇴사자 → 면담 안 하면 떠났을 사람, 불필요한 면담 → 면담 없이도 재직했을 사람
    t["1단계비용"] = (table(["방법", "면담 인원", "면담 안 하면 떠났을 사람", "면담 후 재직(예상)", "면담 없이도 재직했을 사람", "순이익"], rows)
                    + f"\n\n입력: 상위 {inp['k'] * 100:.0f}%, 면담 성공률 {inp['r']}, 대체 비용 {inp['C_replace'] / 1e4:,.0f}만 원, 면담 비용 {inp['C_lead'] / 1e4:,.0f}만 원. "
                    "면담 후 재직(예상) = 떠났을 사람 × 성공률. 순이익 = 면담 후 재직 × 대체 비용 − 면담 인원 전체 × 면담 비용.")

    # 업리프트 추정기 선택
    rows = []
    for cid, label in UPLIFT.items():
        rows.append([label] + [num(met[sc]["stage2"]["uplift_selection"]["cv_qini"][cid], 5)
                               + (" ✔" if met[sc]["stage2"]["uplift_selection"]["chosen"] == cid else "") for sc in "AB"])
    t["추정기선택"] = table(["효과 추정기 후보", "A: 훈련 교차검증 Qini", "B: 훈련 교차검증 Qini"], rows) + "\n\n✔ = 선택(팀장·임원 평균 Qini가 가장 큼). 시험 자료는 보지 않았다."

    # 2단계 순이익
    ca, cb = case(ref, "A"), case(ref, "B")
    rows = []
    for mid in ("random", "risk", "expert", "uplift", "oracle"):
        a, b = ca["stage2"][mid], cb["stage2"][mid]
        rows.append([NAME2[mid], eok(a["net"]), f"{a['saved']:.1f}명", eok(b["net"]), f"{b['saved']:.1f}명", f"{b['backfire']}명",
                     f"{b['net'] / cb['stage2']['oracle']['net'] * 100:.0f}%"])
    inp = cb["inputs"]
    t["2단계"] = (table(["방법", "A 순이익", "A 면담 후 재직(예상)", "B 순이익", "B 면담 후 재직(예상)", "B 역효과 우려", "B 최대치 대비"], rows)
                 + f"\n\n입력: 팀장 면담 {inp['k'] * 100:.0f}%, 임원 면담 {inp['m']}명(시험 인원의 5%), 대체 비용 {inp['C_replace'] / 1e4:,.0f}만 원, "
                 f"팀장 {inp['C_lead'] / 1e4:,.0f}만 원, 임원 {inp['C_exec'] / 1e4:,.0f}만 원. 면담 후 재직(예상)과 순이익은 진짜 효과로 채점(사람별 확률의 합이라 소수가 나옴). "
                 "역효과 우려 = 팀장 면담을 받으면 오히려 퇴사 확률이 오르는 사람(팀장 갈등)에게 팀장 면담을 배정한 수. 최대치 = 진짜 효과를 알 때의 순이익.")

    # 2단계 Qini·상관
    rows = []
    for sc in "AB":
        for m in met[sc]["stage2"]["methods"]:
            if m["id"] == "expert":
                continue
            rows.append([sc, NAME2[m["id"]], num(m["qini_lead"], 4), num(m["qini_exec"], 4), num(m["corr_lead"], 2), num(m["corr_exec"], 2)])
    t["Qini"] = table(["시나리오", "방법", "Qini 팀장", "Qini 임원", "진짜 효과와 순위 상관: 팀장", "임원"], rows) + \
        "\n\nQini: 효과 순으로 줄 세운 정도(관측 자료로 계산, 클수록 좋음). 순위 상관: 가상 데이터라서만 계산할 수 있는 검증. 전문가 규칙은 점수가 아니라 배분 규칙이라 빠짐."

    # 민감도
    sp = RES / "sensitivity.json"
    if sp.exists():
        sens = load("sensitivity.json")
        cells = {(c["n"], c["strength"]): c for c in sens["cells"]}
        head = ["시범 인원"] + [{0.0: "궁합 없음 (A형)", 0.5: "궁합 중간", 1.0: "궁합 강함 (B형)"}[s] for s in sens["strength"]]
        r1, r2 = [], []
        for n in sens["n"]:
            r1.append([f"{n:,}명"] + [f"{cells[(n, s)]['benefit_ratio']['mean']:.2f} ({cells[(n, s)]['benefit_ratio']['min']:.2f}~{cells[(n, s)]['benefit_ratio']['max']:.2f}), {cells[(n, s)]['uplift_wins']}/{sens['repeats']}승"
                                      for s in sens["strength"]])
            r2.append([f"{n:,}명"] + [f"{cells[(n, s)]['expert_ratio']['mean']:.2f}" for s in sens["strength"]])
        rep = sens.get("representative_learner", "t_hgb")
        names = {"t_hgb": "두 모델 비교법·부스팅", "t_logit": "두 모델 비교법·로지스틱"}
        extra = ""
        if all("by_learner" in c for c in sens["cells"]):
            r3 = [[f"{n:,}명"] + [" / ".join(f"{cells[(n, s)]['by_learner'][l]['benefit_ratio']['mean']:.2f}"
                                           f" ({cells[(n, s)]['by_learner'][l]['uplift_wins']}승)" for l in ("t_hgb", "t_logit"))
                                for s in sens["strength"]] for n in sens["n"]]
            extra = "\n\n**추정기별 효과 순 ÷ 위험 순** (부스팅 / 로지스틱, 시드 3개 평균, 이긴 횟수)\n\n" + table(head, r3)
        t["민감도"] = (f"**효과 순 ÷ 위험 순** — 대표 추정기: {names[rep]} (시드 3개 평균, 최소~최대, 이긴 횟수)\n\n" + table(head, r1)
                     + "\n\n**HR 전문가 규칙 ÷ 위험 순** (시드 3개 평균)\n\n" + table(head, r2) + extra
                     + "\n\n1.0보다 크면 위험 순보다 낫다. 대표 추정기는 본 실행(9,000명)의 시나리오 B 교차검증에서 고른 것. "
                     + f"고정 조건: 위험 모델 로지스틱(보정), 잡음 σ 1.0. 실행 {sens['runtime_sec']}초.")

    # 공정성 (B)
    fp = RES / "B" / "fairness.json"
    if fp.exists():
        f = load("B/fairness.json")
        rows = [[g["group"], pct(g["share"])] + [pct(g[m]["exec_rate"]) for m in ("risk", "expert", "uplift")]
                + [pct(g[m]["lead_rate"]) for m in ("risk", "expert", "uplift")] for g in f["groups"]]
        t["공정성"] = table(["집단", "인원 비중", "임원 배정: 위험 순", "규칙", "효과 순", "팀장 배정: 위험 순", "규칙", "효과 순"], rows) + \
            "\n\n시나리오 B, 예시 입력. 나이·성별은 모델 입력에 없지만, 다른 열과의 상관으로 배정 비율에 차이가 날 수 있다(원인 해석 금지)."

    # 요인 (B)
    ip = RES / "B" / "importance.json"
    if ip.exists():
        im = load("B/importance.json")
        rows = []
        for i in range(5):
            a, b = im["risk"][i], im["uplift_exec"][i]
            rows.append([i + 1, f"{a['label']} ({a['mean']:.4f})", f"{b['label']} ({b['mean']:.4f})"])
        t["요인"] = table(["순위", "퇴사 위험에 영향(AUC 하락량)", "임원 면담 효과 추정에 영향(추정 효과 변화량)"], rows) + \
            "\n\n시나리오 B, 순열 중요도. 점수가 무엇에 반응하는지를 보여 줄 뿐 원인이 아니다."
    return t


def fill(text: str, tables: dict) -> tuple[str, list]:
    missing = []
    for name, body in tables.items():
        # GitHub은 한 줄에 물결표가 두 번 나오면 그 사이를 취소선으로 그린다("0.81~0.90 … 0.97~1.00").
        # 범위 표시는 하이픈(-)으로 통일한다(11-17 사용자 결정).
        body = body.replace("~", "-")
        pat = re.compile(rf"(<!-- 표:{re.escape(name)} -->\n)(.*?)(<!-- /표:{re.escape(name)} -->)", re.S)
        if not pat.search(text):
            missing.append(name)
            continue
        text = pat.sub(lambda m: m.group(1) + body + "\n" + m.group(3), text)
    return text, missing


def main():
    tables = build()
    # 보고서와 README 둘 다 채운다. 각 문서에 있는 표시 구간만 바뀐다.
    for doc in (REPORT, ROOT / "README.md"):
        if not doc.exists():
            print(f"  없음: {doc}")
            continue
        text, missing = fill(doc.read_text(encoding="utf-8"), tables)
        doc.write_text(text, encoding="utf-8")
        print(f"  {doc.name}: 표 {len(tables) - len(missing)}개 갱신")


if __name__ == "__main__":
    main()
