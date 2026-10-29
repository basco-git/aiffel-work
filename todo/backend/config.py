"""공통 설정: .env 로드와 경로."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# sqlite = 길 A (로컬 todo.db), supabase = 길 B (클라우드 + 로그인 + RLS)
DB_BACKEND = os.getenv("DB_BACKEND", "sqlite").strip().lower()
if DB_BACKEND not in ("sqlite", "supabase"):
    raise SystemExit(f".env의 DB_BACKEND는 sqlite 또는 supabase 여야 합니다: {DB_BACKEND!r}")
