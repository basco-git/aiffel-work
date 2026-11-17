"""T3: 데이터 생성 테스트 (PRD §12)."""

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from generate_data import generate  # noqa: E402

N = 9000


class TestGenerate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.a = generate("A", 42, N)
        cls.b = generate("B", 42, N)

    def test_재현성_같은_시드_같은_결과(self):
        obs2, truth2, _ = generate("B", 42, N)
        pd.testing.assert_frame_equal(self.b[0], obs2)
        pd.testing.assert_frame_equal(self.b[1], truth2)

    def test_다른_시드는_다른_결과(self):
        obs2, _, _ = generate("A", 7, N)
        self.assertFalse(self.a[0]["left"].equals(obs2["left"]))

    def test_열과_범위(self):
        obs = self.a[0]
        for c in ["sat_pay", "sat_job_fit", "sat_benefits", "sat_direction", "job_level"]:
            self.assertTrue(obs[c].between(1, 5).all(), c)
        self.assertTrue(obs["leader_conflict"].isin([0, 1]).all())
        self.assertTrue(obs["left"].isin([0, 1]).all())
        self.assertTrue(obs["monthly_income_rank"].between(0, 1).all())
        self.assertTrue(obs["tenure_years"].between(0, 25).all())
        self.assertTrue(obs["age"].between(21, 60).all())
        self.assertEqual(set(obs["talk_by"]), {"none", "lead", "exec"})
        self.assertEqual(obs["emp_id"].tolist(), list(range(1, N + 1)))

    def test_대조군_퇴사율_목표_범위(self):
        rate = self.a[2]["leave_rate"]["none"]
        self.assertTrue(0.12 <= rate <= 0.18, rate)

    def test_처치_배정_비율(self):
        share = self.a[0]["talk_by"].value_counts(normalize=True)
        self.assertAlmostEqual(share["none"], 0.4, places=2)
        self.assertAlmostEqual(share["lead"], 0.3, places=2)
        self.assertAlmostEqual(share["exec"], 0.3, places=2)

    def test_A와_B는_대조군이_같다(self):
        oa, ob = self.a[0], self.b[0]
        ctrl = oa["talk_by"] == "none"
        self.assertTrue((oa.loc[ctrl, "left"].values == ob.loc[ctrl, "left"].values).all())
        np.testing.assert_allclose(self.a[1]["p_none"], self.b[1]["p_none"])

    def test_A와_B의_평균_효과_로짓이_같다(self):
        for arm in ("lead", "exec"):
            self.assertAlmostEqual(self.a[2]["mean_delta"][arm], self.b[2]["mean_delta"][arm], places=3)

    def test_A는_효과가_균일하고_B는_역효과가_있다(self):
        self.assertEqual(self.a[2]["negative_tau_lead_share"], 0.0)
        self.assertGreater(self.b[2]["negative_tau_lead_share"], 0.0)
        # B의 역효과는 팀장 갈등이 있는 사람에게서만
        neg = self.b[1]["tau_lead"] < 0
        self.assertTrue((self.b[0].loc[neg, "leader_conflict"] == 1).all())

    def test_decided는_효과가_없다(self):
        t = self.b[1]
        dec = t["decided"] == 1
        self.assertTrue(dec.any())
        self.assertTrue((t.loc[dec, "tau_lead"].abs() < 1e-9).all())
        self.assertTrue((t.loc[dec, "tau_exec"].abs() < 1e-9).all())

    def test_한글_CSV로_쓰고_읽어도_같다(self):
        import tempfile
        from generate_data import read_data, to_ko
        with tempfile.TemporaryDirectory() as d:
            for df in (self.b[0], self.b[1]):
                path = Path(d) / "t.csv"
                to_ko(df).to_csv(path, index=False, encoding="utf-8-sig")
                self.assertTrue(path.read_bytes().startswith(b"\xef\xbb\xbf"))  # BOM
                back = read_data(path)
                pd.testing.assert_frame_equal(df.reset_index(drop=True), back, check_dtype=False, atol=1e-6)

    def test_궁합_강도_0이면_A와_같다(self):
        _, t0, _ = generate("B", 42, N, strength=0.0)
        np.testing.assert_allclose(t0["tau_exec"], self.a[1]["tau_exec"])

    def test_회사유형_기준은_이전과_같고_연봉복지_만족이_낮을수록_퇴사가_많다(self):
        # 11-17 추가: 회사 유형 옵션의 기본값은 이전 데이터와 같아야 하고,
        # 연봉·복지 만족을 내린 중소기업형일수록 면담 없음 퇴사율이 높아야 한다.
        obs, truth, _ = generate("B", 42, N, company="기준")
        pd.testing.assert_frame_equal(self.b[0], obs)
        pd.testing.assert_frame_equal(self.b[1], truth)
        info = {c: generate("A", 42, N, company=c) for c in ("대기업형", "기준", "중소기업형")}
        pay = [info[c][0]["sat_pay"].mean() for c in ("대기업형", "기준", "중소기업형")]
        rate = [info[c][2]["leave_rate"]["none"] for c in ("대기업형", "기준", "중소기업형")]
        self.assertTrue(pay[0] > pay[1] > pay[2])
        self.assertTrue(rate[0] < rate[1] < rate[2])
        # 연봉·복지 외 열은 바뀌지 않는다
        pd.testing.assert_series_equal(info["대기업형"][0]["sat_job_fit"], info["기준"][0]["sat_job_fit"])


if __name__ == "__main__":
    unittest.main()
