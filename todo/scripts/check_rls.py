"""Supabase RLS 확인 스크립트 (길 B).

  .venv\\Scripts\\python scripts\\check_rls.py

1) 비로그인(anon): 공개 키만으로 todos를 읽기/쓰기 → 막혀야 한다.
2) 사용자 A·B: A로 임시 할 일을 만들고, B가 그 id로 읽기/수정/삭제 → 0건이어야 한다.
   (2는 앱에서 가입한 계정 2개가 필요. 비밀번호는 이 창에서 직접 입력하며 저장하지 않는다.)

결과는 화면과 docs/rls-check-result.txt 에 남긴다 (비밀번호·토큰은 남기지 않음).
"""
import getpass
import os
import sys
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
if not URL or not KEY:
    sys.exit(".env에 SUPABASE_URL 과 SUPABASE_PUBLISHABLE_KEY 를 먼저 넣어 주세요.")

results = []


def check(name, ok, detail=""):
    line = f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else "")
    print(line)
    results.append((ok, line))


def rest(method, path, token=None, **kw):
    headers = {"apikey": KEY}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if method in ("POST", "PATCH", "DELETE"):
        headers["Prefer"] = "return=representation"
    return requests.request(method, f"{URL}/rest/v1/{path}", headers=headers, timeout=15, **kw)


def login(email, password):
    r = requests.post(f"{URL}/auth/v1/token?grant_type=password", json={"email": email, "password": password},
                      headers={"apikey": KEY}, timeout=15)
    if not r.ok:
        sys.exit(f"{email} 로그인 실패: {r.json().get('msg') or r.text}")
    return r.json()["access_token"]


def mask(email):
    name, _, domain = email.partition("@")
    return f"{name[:2]}***@{domain}"


# ---------- 1. 비로그인 ----------
r = rest("GET", "todos", params={"select": "id"})
rows = r.json() if r.ok else []
check("비로그인 읽기 차단", (not r.ok) or rows == [], f"HTTP {r.status_code}, 보인 행 {len(rows)}개")
r = rest("POST", "todos", json={"title": "anon 쓰기 시도"})
check("비로그인 쓰기 차단", not r.ok, f"HTTP {r.status_code}")

# ---------- 2. 사용자 A / B ----------
print("\n사용자 2명 비교 (앱에서 가입한 서로 다른 계정). 건너뛰려면 Enter.")
email_a = input("A 이메일: ").strip()
if email_a:
    token_a = login(email_a, getpass.getpass("A 비밀번호(화면에 안 보임): "))
    email_b = input("B 이메일: ").strip()
    token_b = login(email_b, getpass.getpass("B 비밀번호(화면에 안 보임): "))

    created = rest("POST", "todos", token_a, json={"title": "[RLS 확인용] A의 할 일"}).json()[0]
    tid = created["id"]
    try:
        r = rest("GET", "todos", token_b, params={"id": f"eq.{tid}", "select": "id"})
        check("B가 A의 할 일 읽기", r.ok and r.json() == [], f"보인 행 {len(r.json()) if r.ok else '-'}개")
        r = rest("PATCH", "todos", token_b, params={"id": f"eq.{tid}"}, json={"title": "B가 바꿈"})
        check("B가 A의 할 일 수정", r.ok and r.json() == [], f"바뀐 행 {len(r.json()) if r.ok else '-'}개")
        r = rest("DELETE", "todos", token_b, params={"id": f"eq.{tid}"})
        check("B가 A의 할 일 삭제", r.ok and r.json() == [], f"지운 행 {len(r.json()) if r.ok else '-'}개")
        r = rest("POST", "todos", token_b, json={"title": "위장", "user_id": created["user_id"]})
        check("B가 A 명의로 행 만들기", not r.ok, f"HTTP {r.status_code}")
        r = rest("GET", "todos", token_a, params={"id": f"eq.{tid}", "select": "id,title"})
        check("A에게는 그대로 보임", r.ok and r.json() and r.json()[0]["title"] == "[RLS 확인용] A의 할 일")
    finally:
        rest("DELETE", "todos", token_a, params={"id": f"eq.{tid}"})   # 임시 데이터 정리
    who = f"A={mask(email_a)}, B={mask(email_b)}"
else:
    who = "사용자 비교 생략"

# ---------- 결과 ----------
passed = sum(ok for ok, _ in results)
stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
summary = f"{stamp} RLS 확인: {passed}/{len(results)} 통과 ({who})"
print("\n" + summary)
out = BASE_DIR / "docs" / "rls-check-result.txt"
out.write_text(summary + "\n" + "\n".join(line for _, line in results) + "\n", encoding="utf-8")
print(f"저장: {out}")
sys.exit(0 if passed == len(results) else 1)
