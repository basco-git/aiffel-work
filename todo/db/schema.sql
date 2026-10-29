-- Todo 앱 DB 스키마 (SQLite)
-- 날짜/시각 열은 DATE / DATETIME 형식으로 선언하고 CHECK로 형식을 강제한다.
--   DATE     : 'YYYY-MM-DD'          (예: 2026-10-29)
--   DATETIME : 'YYYY-MM-DD HH:MM:SS' (예: 2026-10-29 16:30:00)
-- 형식이 틀린 값(예: '2026/10/29', '2026-02-30')은 INSERT/UPDATE 시 거부된다.

PRAGMA foreign_keys = ON;   -- SQLite는 연결마다 이걸 켜야 FK/CASCADE가 동작함

-- 할 일
CREATE TABLE IF NOT EXISTS todos (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  title           TEXT     NOT NULL CHECK (length(trim(title)) > 0),
  memo            TEXT,
  due_date        DATE     CHECK (due_date IS NULL OR date(due_date) IS due_date),
  is_done         INTEGER  NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  done_at         DATETIME CHECK (done_at IS NULL OR datetime(done_at) IS done_at),
  is_today_pick   INTEGER  NOT NULL DEFAULT 0 CHECK (is_today_pick IN (0, 1)),
  reschedule_cnt  INTEGER  NOT NULL DEFAULT 0 CHECK (reschedule_cnt >= 0),
  created_at      DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
                           CHECK (datetime(created_at) IS created_at),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
                           CHECK (datetime(updated_at) IS updated_at)
);

-- 카테고리(태그)
CREATE TABLE IF NOT EXISTS tags (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  name        TEXT     NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  color       TEXT     NOT NULL DEFAULT '#888888',
  created_at  DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
                       CHECK (datetime(created_at) IS created_at)
);

-- 할 일 ↔ 태그 연결 (N:M)
CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id  INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);

-- 마감일 재설정 기록 (미수행 시 기간 재설정)
CREATE TABLE IF NOT EXISTS due_history (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  todo_id     INTEGER  NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  old_due     DATE     CHECK (old_due IS NULL OR date(old_due) IS old_due),
  new_due     DATE     NOT NULL CHECK (date(new_due) IS new_due),
  reason      TEXT,
  changed_at  DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
                       CHECK (datetime(changed_at) IS changed_at)
);

CREATE INDEX IF NOT EXISTS idx_todos_done_due  ON todos(is_done, due_date);
CREATE INDEX IF NOT EXISTS idx_todo_tags_tag   ON todo_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_due_history_todo ON due_history(todo_id);

-- 수정 시각 자동 갱신
CREATE TRIGGER IF NOT EXISTS trg_todos_updated_at
AFTER UPDATE ON todos
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE todos SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;

-- 마감일이 바뀌면 재설정 기록을 남기고 횟수를 올림
CREATE TRIGGER IF NOT EXISTS trg_todos_due_changed
AFTER UPDATE OF due_date ON todos
FOR EACH ROW WHEN NEW.due_date IS NOT OLD.due_date AND NEW.due_date IS NOT NULL
BEGIN
  INSERT INTO due_history (todo_id, old_due, new_due) VALUES (NEW.id, OLD.due_date, NEW.due_date);
  UPDATE todos SET reschedule_cnt = reschedule_cnt + 1 WHERE id = NEW.id;
END;

-- 오늘의 할 일: 미완료 중 마감이 오늘/지남(미수행) 이거나 직접 고른 것
CREATE VIEW IF NOT EXISTS v_today AS
SELECT t.*,
       CASE WHEN t.due_date < date('now', 'localtime') THEN 1 ELSE 0 END AS is_overdue
FROM todos t
WHERE t.is_done = 0
  AND (t.due_date <= date('now', 'localtime') OR t.is_today_pick = 1);
