"""T6: 결과 검증 — 분할 겹침, 지표 재계산, 순위 일관성, 배분 기준값 (PRD §12)."""

import json
import sys
import unittest
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_auc_score

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
import allocate  # noqa: E402

ROOT = HERE.parent
RES = ROOT / "results"
DATA = ROOT / "data"


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


@unittest.skipUnless((RES / "meta.json").exists(), "results 없음 - train_eval.py 먼저 실행")
class TestResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta = load(RES / "meta.json")
        cls.scores = {sc: load(RES / sc / "scores.json") for sc in "AB"}
        cls.metrics = {sc: load(RES / sc / "metrics.json") for sc in "AB"}
        cls.ref = load(RES / "reference.json")

    def test_분할_겹침_없음과_크기(self):
        sp = load(DATA / "split.json")
        tr, te = set(sp["train"]), set(sp["test"])
        self.assertFalse(tr & te)
        self.assertEqual(len(tr) + len(te), self.meta["n"])
        self.assertAlmostEqual(len(te) / self.meta["n"], 0.3, places=2)
        self.assertEqual(self.scores["A"]["stage2"]["n"], len(te))

    def test_1단계는_A와_B가_같다(self):
        self.assertEqual(self.scores["A"]["stage1"], self.scores["B"]["stage1"])

    def test_순위는_순열이고_확률과_일관(self):
        s1 = self.scores["A"]["stage1"]
        n = s1["n"]
        for m in s1["methods"]:
            self.assertEqual(sorted(m["rank"]), list(range(n)), m["id"])
            if m["prob"] is not None:
                p, r = np.array(m["prob"]), np.array(m["rank"])
                order = np.argsort(r)
                self.assertTrue((np.diff(p[order]) <= 1e-12).all(), m["id"])
        tb = self.scores["A"]["stage2"]["tiebreak"]
        self.assertEqual(sorted(tb), list(range(len(tb))))

    def test_1단계_지표_재계산_일치(self):
        s1 = self.scores["A"]["stage1"]
        y = np.array(s1["left"])
        met = {m["id"]: m for m in self.metrics["A"]["stage1"]["methods"]}
        for m in s1["methods"]:
            if m["prob"] is not None:
                self.assertAlmostEqual(roc_auc_score(y, m["prob"]), met[m["id"]]["auc"], places=3, msg=m["id"])
            r = np.array(m["rank"])
            for k in ("10", "20"):
                s = int(round(len(y) * int(k) / 100))
                self.assertAlmostEqual(y[r < s].sum() / y.sum(), met[m["id"]]["capture"][k], places=5, msg=m["id"])
        self.assertAlmostEqual(self.metrics["A"]["stage1"]["all_stay_accuracy"], 1 - y.mean(), places=5)

    def test_배분_기준값_재계산_일치(self):
        for case in self.ref["cases"]:
            d = {k: np.asarray(v) if isinstance(v, list) else v
                 for k, v in self.scores[case["scenario"]]["stage2"].items()}
            inp = case["inputs"]
            for mid, exp in case["stage2"].items():
                got = allocate.stage2(mid, d, inp["m"], inp["k"], inp["C_replace"], inp["C_lead"], inp["C_exec"])
                self.assertEqual(got["exec"], exp["exec"])
                self.assertEqual(got["lead"], exp["lead"])
                self.assertEqual(got["backfire"], exp["backfire"])
                self.assertAlmostEqual(got["net"], exp["net"], delta=1.0)

    def test_배분_규칙_작은_손계산_예시(self):
        # 3명, 임원 1, 팀장 1(k=1/3), C_replace 100, C_lead 1, C_exec 5
        d = {"tiebreak": np.array([0, 1, 2]), "risk": np.array([0.9, 0.5, 0.1]),
             "tau_hat_lead": np.array([0.10, 0.20, -0.05]), "tau_hat_exec": np.array([0.10, 0.30, 0.50]),
             "tau_lead": np.array([0.10, 0.20, -0.05]), "tau_exec": np.array([0.10, 0.30, 0.50])}
        # 가치: V_exec = [5, 25, 45], V_lead = [9, 19, -6] → 임원 이득 = [-4, 6, 45] → 임원 2번 행
        # 남은 0·1번 중 V_lead 큰 1번 → 팀장
        a = allocate.assign("oracle", d, 1, 1 / 3, 100, 1, 5)
        self.assertEqual(a.tolist(), ["", "lead", "exec"])
        r = allocate.stage2("oracle", d, 1, 1 / 3, 100, 1, 5)
        self.assertAlmostEqual(r["net"], (0.5 + 0.2) * 100 - 5 - 1)
        # 위험 순: 0번 임원, 1번 팀장
        self.assertEqual(allocate.assign("risk", d, 1, 1 / 3, 100, 1, 5).tolist(), ["exec", "lead", ""])

    def test_고지_가능한_값_범위(self):
        for sc in "AB":
            s2 = self.scores[sc]["stage2"]
            self.assertTrue(all(0 <= p <= 1 for p in s2["risk"]))
            self.assertEqual(set(s2["talk_by"]), {"none", "lead", "exec"})
            self.assertNotIn("emp_id", json.dumps(self.scores[sc]))


if __name__ == "__main__":
    unittest.main()
