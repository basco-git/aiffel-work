"""터미널용 todo 명령. 앱 코드를 바꾸지 않는 얇은 진입점이다.

기존 Flask 앱(app.py)의 API를 test_client로 같은 프로세스 안에서 부른다.
그래서 입력 검사, 저장소 선택(.env의 DB_BACKEND), 로그인과 RLS가 웹 화면과 똑같이 적용된다.

  sqlite   → todo.db (DB_PATH)
  supabase → 공개용 키 + 로그인한 사용자 토큰 (RLS 그대로)
             로그인 정보는 환경 변수 TODO_CLI_EMAIL / TODO_CLI_PASSWORD 로만 받는다.

사용법:
  todo add "제목" [--due YYYY-MM-DD] [--memo 메모]
  todo list [--status all|active|done] [--today]
  todo done ID [ID ...]
  todo summary
  (모든 명령에 --json 을 붙이면 JSON으로 출력)
"""
import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# 파이프로 읽을 때(AI 도구 등)도 한글이 깨지지 않게 UTF-8로 출력한다
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

import app as todo_app  # noqa: E402  (sys.path 설정 뒤에 불러와야 한다)


class CliError(Exception):
    pass


class Api:
    """앱의 HTTP API를 프로세스 안에서 부르는 작은 클라이언트."""

    def __init__(self):
        todo_app.db.init_db()  # sqlite: 표가 없으면 만든다 / supabase: 아무것도 안 함
        # https 주소로 부르면 SESSION_COOKIE_SECURE=1 이어도 로그인 쿠키가 유지된다
        self.client = todo_app.app.test_client()
        self.base = "https://localhost"
        if todo_app.DB_BACKEND == "supabase":
            self._login()

    def _login(self):
        email = os.getenv("TODO_CLI_EMAIL")
        password = os.getenv("TODO_CLI_PASSWORD")
        if not email or not password:
            raise CliError(
                "Supabase 모드입니다. 테스트 계정을 환경 변수로 넣어 주세요: "
                "TODO_CLI_EMAIL, TODO_CLI_PASSWORD"
            )
        self.call("POST", "/api/auth/login", {"email": email, "password": password})

    def call(self, method, path, body=None, query=None):
        res = self.client.open(path, method=method, json=body, query_string=query,
                               base_url=self.base)
        data = res.get_json(silent=True)
        if res.status_code >= 400:
            msg = (data or {}).get("error") or f"요청 실패 ({res.status_code})"
            raise CliError(msg)
        return data


# ---------- 출력 ----------

def _line(t):
    box = "[x]" if t["is_done"] else "[ ]"
    extra = []
    if t.get("due_date"):
        extra.append(f"마감 {t['due_date']}" + (" 지남" if t.get("is_overdue") else ""))
    if t.get("is_done") and t.get("done_at"):
        extra.append(f"완료 {t['done_at']}")
    if t.get("tags"):
        extra.append(" ".join("#" + g["name"] for g in t["tags"]))
    tail = f"  ({', '.join(extra)})" if extra else ""
    return f"{box} {t['id']:>4}  {t['title']}{tail}"


def _print(as_json, data, text):
    if as_json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(text)


# ---------- 명령 ----------

def cmd_add(api, args):
    body = {"title": args.title}
    if args.due:
        body["due_date"] = args.due
    if args.memo:
        body["memo"] = args.memo
    todo = api.call("POST", "/api/todos", body)
    _print(args.json, todo, "추가했습니다.\n" + _line(todo))


def cmd_list(api, args):
    if args.today:
        todos = api.call("GET", "/api/todos/today")
        title = "오늘 할 일"
    else:
        todos = api.call("GET", "/api/todos", query={"status": args.status})
        title = {"all": "전체", "active": "미완료", "done": "완료"}[args.status]
    lines = [f"{title} {len(todos)}건"] + [_line(t) for t in todos]
    _print(args.json, todos, "\n".join(lines))


def cmd_done(api, args):
    results, lines = [], []
    for todo_id in args.ids:
        todo = api.call("GET", f"/api/todos/{todo_id}")
        if todo["is_done"]:
            # 다시 완료 처리하면 완료 시각이 바뀌므로 건드리지 않는다
            lines.append(f"이미 완료: {_line(todo)}")
        else:
            todo = api.call("PATCH", f"/api/todos/{todo_id}", {"is_done": True})
            lines.append(f"완료 처리: {_line(todo)}")
        results.append(todo)
    _print(args.json, results, "\n".join(lines))


def cmd_summary(api, args):
    today = date.today().isoformat()
    done = api.call("GET", "/api/todos", query={"status": "done"})
    done_today = sorted(
        (t for t in done if (t.get("done_at") or "").startswith(today)),
        key=lambda t: t["done_at"],
    )
    remaining = api.call("GET", "/api/todos/today")
    overdue = [t for t in remaining if t.get("is_overdue")]
    data = {"date": today, "done_today": done_today, "remaining_today": remaining}

    lines = [f"{today} 완료 요약", f"- 오늘 완료: {len(done_today)}건"]
    lines += [f"    {t['done_at'][11:16]}  #{t['id']} {t['title']}" for t in done_today]
    lines.append(f"- 오늘 남은 일: {len(remaining)}건 (마감 지남 {len(overdue)}건)")
    lines += [f"    {_line(t)}" for t in remaining]
    _print(args.json, data, "\n".join(lines))


def _parser():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true", help="JSON으로 출력")

    p = argparse.ArgumentParser(prog="todo", description="todo 앱 터미널 명령")
    sub = p.add_subparsers(dest="cmd", required=True, metavar="{add,list,done,summary}")

    a = sub.add_parser("add", parents=[common], help="할 일 추가")
    a.add_argument("title", help="제목")
    a.add_argument("--due", help="마감일 YYYY-MM-DD")
    a.add_argument("--memo", help="메모")
    a.set_defaults(func=cmd_add)

    l = sub.add_parser("list", parents=[common], help="할 일 목록")
    l.add_argument("--status", choices=("all", "active", "done"), default="all")
    l.add_argument("--today", action="store_true", help="오늘 할 일만 (마감 오늘·지남 + 직접 고른 것)")
    l.set_defaults(func=cmd_list)

    d = sub.add_parser("done", parents=[common], help="완료 처리")
    d.add_argument("ids", nargs="+", type=int, metavar="ID")
    d.set_defaults(func=cmd_done)

    s = sub.add_parser("summary", parents=[common], help="오늘 완료 요약")
    s.set_defaults(func=cmd_summary)
    return p


def main(argv=None):
    args = _parser().parse_args(argv)
    try:
        args.func(Api(), args)
    except CliError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
