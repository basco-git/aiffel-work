"""길 B: Supabase 저장소 + 로그인(Supabase Auth).

- DB 접근은 이 파일에서만, Supabase REST API(PostgREST)로 한다.
- 키는 공개용 키(publishable / anon)만 쓴다. 모든 데이터 요청에는 로그인한 사용자의
  access token을 붙이므로, 무엇이 보이고 바뀌는지는 DB의 RLS가 결정한다.
- service_role 키는 쓰지 않는다 (RLS를 우회하기 때문).
- 로그인 토큰은 Flask 세션(서명된 HttpOnly 쿠키)에 둔다.
"""
import os
from datetime import date, datetime

import requests
from flask import session

from errors import BadRequest, Conflict, NotFound, Unauthorized, Upstream

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""

if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit(".env에 SUPABASE_URL 과 SUPABASE_PUBLISHABLE_KEY(또는 SUPABASE_ANON_KEY)를 넣어 주세요.")
if "service_role" in SUPABASE_KEY or SUPABASE_KEY.startswith("sb_secret_"):
    raise SystemExit("service_role / secret 키는 RLS를 우회합니다. 공개용(publishable/anon) 키를 넣어 주세요.")

TIMEOUT = 15
_http = requests.Session()


# ---------- 로그인 (Supabase Auth) ----------

_AUTH_MESSAGES = {
    "invalid_credentials": "이메일 또는 비밀번호가 맞지 않습니다.",
    "email_not_confirmed": "이메일 인증이 아직 안 됐습니다. 받은 메일의 링크를 눌러 주세요.",
    "user_already_exists": "이미 가입된 이메일입니다.",
    "weak_password": "비밀번호가 너무 약합니다. 6자 이상으로 해 주세요.",
    "validation_failed": "이메일 형식을 확인해 주세요.",
    "over_request_rate_limit": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    "over_email_send_rate_limit": "인증 메일 발송 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.",
}


def _auth(path, body, token=None):
    headers = {"apikey": SUPABASE_KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        res = _http.post(f"{SUPABASE_URL}/auth/v1/{path}", json=body, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise Upstream("Supabase에 연결할 수 없습니다.") from e
    data = res.json() if res.content else {}
    if not res.ok:
        code = data.get("error_code") or data.get("code") or data.get("error")
        msg = _AUTH_MESSAGES.get(code) or data.get("msg") or data.get("error_description") or "로그인 요청 실패"
        if res.status_code >= 500:
            raise Upstream(msg)
        if code == "invalid_credentials":
            raise Unauthorized(msg)
        raise BadRequest(msg)
    return data


def _save_session(data):
    user = data.get("user") or {}
    session["sb"] = {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "user_id": user.get("id"),
        "email": user.get("email"),
    }
    session.permanent = True


def current_user():
    sb = session.get("sb")
    return {"id": sb["user_id"], "email": sb["email"]} if sb else None


def sign_in(email, password):
    _save_session(_auth("token?grant_type=password", {"email": email, "password": password}))
    return current_user()


def sign_up(email, password):
    data = _auth("signup", {"email": email, "password": password})
    if data.get("access_token"):            # 이메일 인증을 끈 프로젝트: 바로 로그인
        _save_session(data)
        return {"user": current_user(), "needs_confirmation": False}
    return {"user": None, "needs_confirmation": True}


def sign_out():
    sb = session.pop("sb", None)
    if sb:
        try:
            _auth("logout", {}, token=sb["access_token"])
        except (Unauthorized, BadRequest, Upstream):
            pass                            # 토큰이 이미 만료돼도 로컬 세션은 지운다


def _refresh():
    sb = session.get("sb")
    if not sb:
        raise Unauthorized("로그인이 필요합니다.")
    try:
        _save_session(_auth("token?grant_type=refresh_token", {"refresh_token": sb["refresh_token"]}))
    except (Unauthorized, BadRequest):
        session.pop("sb", None)
        raise Unauthorized("로그인이 만료됐습니다. 다시 로그인해 주세요.") from None


# ---------- 데이터 요청 (PostgREST) ----------

def _rest(method, path, *, params=None, json=None, prefer=None, _retry=True):
    sb = session.get("sb")
    if not sb:
        raise Unauthorized("로그인이 필요합니다.")
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {sb['access_token']}"}
    if prefer:
        headers["Prefer"] = prefer
    try:
        res = _http.request(method, f"{SUPABASE_URL}/rest/v1/{path}", params=params, json=json,
                            headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise Upstream("Supabase에 연결할 수 없습니다.") from e

    if res.status_code == 401 and _retry:   # access token 만료 → 갱신 후 한 번 재시도
        _refresh()
        return _rest(method, path, params=params, json=json, prefer=prefer, _retry=False)
    if res.ok:
        return res.json() if res.content else None

    err = res.json() if res.content else {}
    code, msg = err.get("code"), err.get("message", "")
    if res.status_code == 401:
        raise Unauthorized("로그인이 필요합니다.")
    if code == "23505":
        raise Conflict("이미 있는 항목입니다.")
    if code == "P0002":
        raise NotFound("항목이 없습니다.")
    if code == "P0001" and err.get("hint") == "same_due":
        raise Conflict("기존 마감일과 같은 날짜입니다.")
    if code in ("23514", "22P02", "22007", "22008", "23503", "42501"):
        raise BadRequest(f"저장할 수 없는 값입니다. ({code})")
    raise Upstream(f"Supabase 오류 ({res.status_code} {code}): {msg}")


def _rpc(name, **args):
    return _rest("POST", f"rpc/{name}", json=args)


def _fmt_ts(value):
    """timestamptz(UTC) → 이 컴퓨터 시간대의 'YYYY-MM-DD HH:MM:SS' (길 A와 같은 모양)"""
    if not value:
        return None
    return datetime.fromisoformat(value).astimezone().strftime("%Y-%m-%d %H:%M:%S")


def _normalize(t, today):
    t["is_done"] = int(t["is_done"])
    t["is_today_pick"] = int(t["is_today_pick"])
    for key in ("done_at", "created_at", "updated_at"):
        t[key] = _fmt_ts(t.get(key))
    t["is_overdue"] = int(not t["is_done"] and t["due_date"] is not None and t["due_date"] < today)
    return t


def _list(**args):
    today = date.today().isoformat()
    rows = _rpc("todo_list", p_today=today, **args) or []
    return [_normalize(t, today) for t in rows]


# ---------- 저장소 인터페이스 (store_sqlite.py 와 같은 함수) ----------

def init_db():
    """Supabase 쪽 표는 supabase/schema.sql 을 SQL Editor에서 실행해 만든다."""


def list_todos(q=None, tag_id=None, status=None):
    return _list(p_q=q, p_tag=tag_id, p_status=status or "all")


def list_today():
    return _list(p_today_only=True)


def get_todo(todo_id):
    rows = _list(p_id=todo_id)
    if not rows:
        raise NotFound(f"할 일 {todo_id}이(가) 없습니다.")
    return rows[0]


def create_todo(title, memo=None, due_date=None, tag_ids=()):
    row = _rest("POST", "todos", json={"title": title, "memo": memo, "due_date": due_date},
                prefer="return=representation")[0]
    if tag_ids:
        _rpc("todo_set_tags", p_todo=row["id"], p_tags=list(tag_ids))
    return get_todo(row["id"])


def update_todo(todo_id, fields):
    body = {k: bool(fields[k]) for k in ("is_done", "is_today_pick") if k in fields}
    body.update({k: fields[k] for k in ("title", "memo") if k in fields})
    if body:
        rows = _rest("PATCH", "todos", params={"id": f"eq.{todo_id}"}, json=body,
                     prefer="return=representation")
        if not rows:                         # 없는 id이거나 RLS로 남의 행이라 안 보임
            raise NotFound(f"할 일 {todo_id}이(가) 없습니다.")
    else:
        get_todo(todo_id)
    if "tag_ids" in fields:
        _rpc("todo_set_tags", p_todo=todo_id, p_tags=list(fields["tag_ids"]))
    return get_todo(todo_id)


def reschedule(todo_id, new_due, reason=None):
    _rpc("todo_reschedule", p_todo=todo_id, p_due=new_due, p_reason=reason)
    return get_todo(todo_id)


def due_history(todo_id):
    get_todo(todo_id)
    rows = _rest("GET", "due_history", params={
        "todo_id": f"eq.{todo_id}", "order": "id.desc",
        "select": "id,todo_id,old_due,new_due,reason,changed_at"})
    for r in rows:
        r["changed_at"] = _fmt_ts(r["changed_at"])
    return rows


def delete_todo(todo_id):
    rows = _rest("DELETE", "todos", params={"id": f"eq.{todo_id}"}, prefer="return=representation")
    if not rows:
        raise NotFound(f"할 일 {todo_id}이(가) 없습니다.")


def list_tags():
    rows = _rest("GET", "tags", params={"select": "id,name,color,created_at,todo_tags(count)", "order": "name"})
    for r in rows:
        r["todo_count"] = (r.pop("todo_tags") or [{"count": 0}])[0]["count"]
        r["created_at"] = _fmt_ts(r["created_at"])
    return rows


def create_tag(name, color="#888888"):
    try:
        row = _rest("POST", "tags", json={"name": name, "color": color}, prefer="return=representation")[0]
    except Conflict:
        raise Conflict(f"이미 있는 태그입니다: {name}") from None
    row["created_at"] = _fmt_ts(row["created_at"])
    return row


def tags_exist(tag_ids):
    ids = list(dict.fromkeys(tag_ids))
    if not ids:
        return True
    rows = _rest("GET", "tags", params={"id": f"in.({','.join(map(str, ids))})", "select": "id"})
    return len(rows) == len(ids)


def delete_tag(tag_id):
    rows = _rest("DELETE", "tags", params={"id": f"eq.{tag_id}"}, prefer="return=representation")
    if not rows:
        raise NotFound(f"태그 {tag_id}이(가) 없습니다.")
