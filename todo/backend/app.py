"""Todo 앱 API 서버. 화면(frontend/)도 같이 내려준다.

DB 접근은 저장소 모듈을 통해서만 한다. .env의 DB_BACKEND로 고른다.
  sqlite   → store_sqlite.py   (길 A, 로그인 없음)
  supabase → store_supabase.py (길 B, Supabase Auth 로그인 + RLS)
"""
import os
import re
import socket
import sys
from datetime import date, timedelta

from flask import Flask, jsonify, request, send_from_directory

from config import BASE_DIR, DB_BACKEND
from errors import BadRequest, Conflict, NotFound, Unauthorized, Upstream

if DB_BACKEND == "supabase":
    import store_supabase as db
else:
    import store_sqlite as db

FRONTEND_DIR = BASE_DIR / "frontend"
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
app.json.ensure_ascii = False

if DB_BACKEND == "supabase":
    secret = os.getenv("FLASK_SECRET_KEY")
    if not secret or len(secret) < 32:
        raise SystemExit(".env에 FLASK_SECRET_KEY(32자 이상 임의 문자열)를 넣어 주세요.")
    app.config.update(
        SECRET_KEY=secret,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    )


def _error(status):
    return lambda e: (jsonify(error=str(e)), status)


for _exc, _status in ((BadRequest, 400), (Unauthorized, 401), (NotFound, 404),
                      (Conflict, 409), (Upstream, 502)):
    app.register_error_handler(_exc, _error(_status))


@app.before_request
def _require_login():
    """길 B에서는 /api/auth/* 를 뺀 모든 API에 로그인이 필요하다."""
    if DB_BACKEND == "supabase" and request.path.startswith("/api/") \
            and not request.path.startswith("/api/auth/") and db.current_user() is None:
        raise Unauthorized("로그인이 필요합니다.")


# ---------- 입력 검사 ----------

def _body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise BadRequest("JSON 본문이 필요합니다.")
    return data


def _text(data, key, required=False, max_len=500):
    value = data.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise BadRequest(f"{key}은(는) 필수입니다.")
        return None
    if not isinstance(value, str):
        raise BadRequest(f"{key}은(는) 문자열이어야 합니다.")
    value = value.strip()
    if len(value) > max_len:
        raise BadRequest(f"{key}은(는) {max_len}자 이하여야 합니다.")
    return value


def _date(data, key, required=False):
    value = data.get(key)
    if value in (None, ""):
        if required:
            raise BadRequest(f"{key}은(는) 필수입니다.")
        return None
    try:
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError
        date.fromisoformat(value)
    except ValueError:
        raise BadRequest(f"{key}은(는) YYYY-MM-DD 형식이어야 합니다.") from None
    return value


def _flag(data, key):
    value = data[key]
    if value not in (True, False, 0, 1):
        raise BadRequest(f"{key}은(는) true/false 여야 합니다.")
    return int(value)


def _tag_ids(data):
    ids = data.get("tag_ids", [])
    if not isinstance(ids, list) or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids):
        raise BadRequest("tag_ids는 정수 배열이어야 합니다.")
    if not db.tags_exist(ids):
        raise BadRequest("없는 태그가 포함되어 있습니다.")
    return ids


# ---------- 화면 ----------

@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


# ---------- 로그인 (길 B) ----------

@app.get("/api/auth/me")
def auth_me():
    if DB_BACKEND != "supabase":
        return jsonify(mode="sqlite", auth=False, user=None)
    return jsonify(mode="supabase", auth=True, user=db.current_user())


def _credentials():
    if DB_BACKEND != "supabase":
        raise BadRequest("로컬(SQLite) 모드에는 로그인이 없습니다.")
    data = _body()
    email = _text(data, "email", required=True, max_len=254)
    password = data.get("password")
    if not EMAIL_RE.match(email):
        raise BadRequest("이메일 형식을 확인해 주세요.")
    if not isinstance(password, str) or not password:
        raise BadRequest("비밀번호를 입력해 주세요.")
    return email, password


@app.post("/api/auth/login")
def auth_login():
    email, password = _credentials()
    return jsonify(user=db.sign_in(email, password))


@app.post("/api/auth/signup")
def auth_signup():
    email, password = _credentials()
    return jsonify(db.sign_up(email, password)), 201


@app.post("/api/auth/logout")
def auth_logout():
    if DB_BACKEND == "supabase":
        db.sign_out()
    return "", 204


# ---------- 할 일 ----------

@app.get("/api/todos")
def list_todos():
    status = request.args.get("status")
    if status not in (None, "", "all", "active", "done"):
        raise BadRequest("status는 all/active/done 중 하나여야 합니다.")
    tag = request.args.get("tag")
    if tag not in (None, "") and not tag.isdigit():
        raise BadRequest("tag는 숫자여야 합니다.")
    return jsonify(db.list_todos(
        q=(request.args.get("q") or "").strip() or None,
        tag_id=int(tag) if tag else None,
        status=status,
    ))


@app.get("/api/todos/today")
def list_today():
    return jsonify(db.list_today())


@app.post("/api/todos")
def create_todo():
    data = _body()
    todo = db.create_todo(
        title=_text(data, "title", required=True, max_len=200),
        memo=_text(data, "memo", max_len=2000),
        due_date=_date(data, "due_date"),
        tag_ids=_tag_ids(data),
    )
    return jsonify(todo), 201


@app.get("/api/todos/<int:todo_id>")
def get_todo(todo_id):
    return jsonify(db.get_todo(todo_id))


@app.patch("/api/todos/<int:todo_id>")
def update_todo(todo_id):
    data = _body()
    if "due_date" in data:
        raise BadRequest("마감일은 /api/todos/<id>/reschedule 로 바꿔 주세요.")
    fields = {}
    if "title" in data:
        fields["title"] = _text(data, "title", required=True, max_len=200)
    if "memo" in data:
        fields["memo"] = _text(data, "memo", max_len=2000)
    for key in ("is_done", "is_today_pick"):
        if key in data:
            fields[key] = _flag(data, key)
    if "tag_ids" in data:
        fields["tag_ids"] = _tag_ids(data)
    if not fields:
        raise BadRequest("바꿀 항목이 없습니다.")
    return jsonify(db.update_todo(todo_id, fields))


@app.post("/api/todos/<int:todo_id>/reschedule")
def reschedule(todo_id):
    data = _body()
    return jsonify(db.reschedule(
        todo_id,
        new_due=_date(data, "due_date", required=True),
        reason=_text(data, "reason", max_len=200),
    ))


@app.get("/api/todos/<int:todo_id>/history")
def due_history(todo_id):
    return jsonify(db.due_history(todo_id))


@app.delete("/api/todos/<int:todo_id>")
def delete_todo(todo_id):
    db.delete_todo(todo_id)
    return "", 204


# ---------- 태그 ----------

@app.get("/api/tags")
def list_tags():
    return jsonify(db.list_tags())


@app.post("/api/tags")
def create_tag():
    data = _body()
    color = data.get("color") or "#888888"
    if not isinstance(color, str) or not COLOR_RE.match(color):
        raise BadRequest("color는 #RRGGBB 형식이어야 합니다.")
    return jsonify(db.create_tag(_text(data, "name", required=True, max_len=30), color)), 201


@app.delete("/api/tags/<int:tag_id>")
def delete_tag(tag_id):
    db.delete_tag(tag_id)
    return "", 204


def _port_in_use(host, port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))

    # pythonw.exe(창 없이 실행)로 켜지면 출력할 곳이 없으므로 server.log에 남긴다
    if sys.stdout is None or sys.stderr is None:
        log = open(BASE_DIR / "server.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log

    # 이미 켜져 있으면 두 번째 서버를 띄우지 않는다
    if _port_in_use(host, port):
        print(f"이미 {host}:{port}에서 서버가 실행 중입니다.")
        sys.exit(0)

    db.init_db()
    app.run(host=host, port=port, debug=False)
