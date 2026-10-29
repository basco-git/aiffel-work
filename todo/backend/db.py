"""SQLite 접근 계층. DB를 직접 다루는 코드는 이 파일에만 둔다."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
SCHEMA_PATH = BASE_DIR / "db" / "schema.sql"

load_dotenv(BASE_DIR / ".env")
_db_path = Path(os.getenv("DB_PATH", "./todo.db"))
DB_PATH = _db_path if _db_path.is_absolute() else (BASE_DIR / _db_path).resolve()


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def _tx():
    """연결을 열고, 블록이 끝나면 커밋(오류 시 롤백)한 뒤 반드시 닫는다."""
    conn = get_conn()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db():
    """todo.db가 없으면 만들고, 표가 없으면 생성한다. 기존 데이터는 건드리지 않는다."""
    with _tx() as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def _escape_like(text):
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _attach_tags(conn, rows):
    todos = [dict(r) for r in rows]
    if not todos:
        return todos
    ids = [t["id"] for t in todos]
    marks = ",".join("?" * len(ids))
    tag_rows = conn.execute(
        f"""SELECT tt.todo_id, g.id, g.name, g.color
            FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id
            WHERE tt.todo_id IN ({marks}) ORDER BY g.name""",
        ids,
    ).fetchall()
    by_todo = {i: [] for i in ids}
    for r in tag_rows:
        by_todo[r["todo_id"]].append({"id": r["id"], "name": r["name"], "color": r["color"]})
    today = conn.execute("SELECT date('now', 'localtime')").fetchone()[0]
    for t in todos:
        t["tags"] = by_todo[t["id"]]
        t["is_overdue"] = int(not t["is_done"] and t["due_date"] is not None and t["due_date"] < today)
    return todos


def _set_tags(conn, todo_id, tag_ids):
    conn.execute("DELETE FROM todo_tags WHERE todo_id = ?", (todo_id,))
    conn.executemany(
        "INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)",
        [(todo_id, tid) for tid in dict.fromkeys(tag_ids)],
    )


# 마감일 없는 일은 맨 뒤, 그다음 마감일 순, 같은 날이면 최근 추가 순
_ORDER = "ORDER BY t.is_done, t.due_date IS NULL, t.due_date, t.id DESC"


def list_todos(q=None, tag_id=None, status=None):
    where, params = [], []
    if q:
        like = f"%{_escape_like(q)}%"
        where.append(
            """(t.title LIKE ? ESCAPE '\\' OR t.memo LIKE ? ESCAPE '\\'
                OR EXISTS (SELECT 1 FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id
                           WHERE tt.todo_id = t.id AND g.name LIKE ? ESCAPE '\\'))"""
        )
        params += [like, like, like]
    if tag_id is not None:
        where.append("EXISTS (SELECT 1 FROM todo_tags tt WHERE tt.todo_id = t.id AND tt.tag_id = ?)")
        params.append(tag_id)
    if status == "active":
        where.append("t.is_done = 0")
    elif status == "done":
        where.append("t.is_done = 1")
    sql = "SELECT t.* FROM todos t"
    if where:
        sql += " WHERE " + " AND ".join(where)
    with _tx() as conn:
        result = _attach_tags(conn, conn.execute(f"{sql} {_ORDER}", params).fetchall())
    return result


def list_today():
    with _tx() as conn:
        rows = conn.execute(
            """SELECT t.id, t.title, t.memo, t.due_date, t.is_done, t.done_at, t.is_today_pick,
                      t.reschedule_cnt, t.created_at, t.updated_at
               FROM v_today t ORDER BY t.due_date IS NULL, t.due_date, t.id DESC"""
        ).fetchall()
        result = _attach_tags(conn, rows)
    return result


def _get_todo(conn, todo_id):
    row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if row is None:
        raise NotFound(f"할 일 {todo_id}이(가) 없습니다.")
    return _attach_tags(conn, [row])[0]


def get_todo(todo_id):
    with _tx() as conn:
        todo = _get_todo(conn, todo_id)
    return todo


def create_todo(title, memo=None, due_date=None, tag_ids=()):
    with _tx() as conn:
        cur = conn.execute(
            "INSERT INTO todos (title, memo, due_date) VALUES (?, ?, ?)", (title, memo, due_date)
        )
        _set_tags(conn, cur.lastrowid, tag_ids)
        todo = _get_todo(conn, cur.lastrowid)
    return todo


def update_todo(todo_id, fields):
    """fields: title, memo, is_done, is_today_pick, tag_ids 중 일부. 마감일은 reschedule()로만 바꾼다."""
    with _tx() as conn:
        _get_todo(conn, todo_id)
        sets, params = [], []
        for col in ("title", "memo", "is_today_pick"):
            if col in fields:
                sets.append(f"{col} = ?")
                params.append(fields[col])
        if "is_done" in fields:
            sets.append("is_done = ?")
            params.append(fields["is_done"])
            sets.append("done_at = CASE WHEN ? = 1 THEN datetime('now', 'localtime') ELSE NULL END")
            params.append(fields["is_done"])
        if sets:
            conn.execute(f"UPDATE todos SET {', '.join(sets)} WHERE id = ?", (*params, todo_id))
        if "tag_ids" in fields:
            _set_tags(conn, todo_id, fields["tag_ids"])
        todo = _get_todo(conn, todo_id)
    return todo


def reschedule(todo_id, new_due, reason=None):
    """마감일을 바꾼다. 기록 추가와 횟수 증가는 schema.sql의 트리거가 처리한다."""
    with _tx() as conn:
        todo = _get_todo(conn, todo_id)
        if todo["due_date"] == new_due:
            raise Conflict("기존 마감일과 같은 날짜입니다.")
        conn.execute("UPDATE todos SET due_date = ? WHERE id = ?", (new_due, todo_id))
        if reason:
            conn.execute(
                """UPDATE due_history SET reason = ?
                   WHERE id = (SELECT max(id) FROM due_history WHERE todo_id = ?)""",
                (reason, todo_id),
            )
        todo = _get_todo(conn, todo_id)
    return todo


def due_history(todo_id):
    with _tx() as conn:
        _get_todo(conn, todo_id)
        rows = conn.execute(
            "SELECT * FROM due_history WHERE todo_id = ? ORDER BY id DESC", (todo_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def delete_todo(todo_id):
    with _tx() as conn:
        if conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,)).rowcount == 0:
            raise NotFound(f"할 일 {todo_id}이(가) 없습니다.")


def list_tags():
    with _tx() as conn:
        rows = conn.execute(
            """SELECT g.*, (SELECT count(*) FROM todo_tags tt WHERE tt.tag_id = g.id) AS todo_count
               FROM tags g ORDER BY g.name"""
        ).fetchall()
    return [dict(r) for r in rows]


def create_tag(name, color="#888888"):
    try:
        with _tx() as conn:
            cur = conn.execute("INSERT INTO tags (name, color) VALUES (?, ?)", (name, color))
            row = conn.execute("SELECT * FROM tags WHERE id = ?", (cur.lastrowid,)).fetchone()
    except sqlite3.IntegrityError as e:
        if "UNIQUE" in str(e):
            raise Conflict(f"이미 있는 태그입니다: {name}") from e
        raise
    return dict(row)


def tags_exist(tag_ids):
    if not tag_ids:
        return True
    ids = list(dict.fromkeys(tag_ids))
    with _tx() as conn:
        n = conn.execute(
            f"SELECT count(*) FROM tags WHERE id IN ({','.join('?' * len(ids))})", ids
        ).fetchone()[0]
    return n == len(ids)


def delete_tag(tag_id):
    with _tx() as conn:
        if conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,)).rowcount == 0:
            raise NotFound(f"태그 {tag_id}이(가) 없습니다.")
