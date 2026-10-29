// 화면 코드. 데이터는 백엔드 API(/api/...)로만 주고받는다.

const $ = (sel) => document.querySelector(sel);

const state = {
  view: "today",   // today | active | done | all
  q: "",
  tag: "",
  tags: [],
  selectedTags: new Set(),
  reschedId: null,
};

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/auth/")) {
    showAuth(data.error);              // 로그인이 풀렸으면 로그인 화면으로
    throw new Error(data.error || "로그인이 필요합니다.");
  }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

// ---------- 로그인 (길 B: Supabase) ----------

function showAuth(message) {
  $("#app").hidden = true;
  $("#user-box").hidden = true;
  $("#auth").hidden = false;
  authMessage(message);
}

function authMessage(text, isError = true) {
  const el = $("#auth-msg");
  el.textContent = text || "";
  el.hidden = !text;
  el.className = isError ? "error" : "muted";
}

function showApp(me) {
  $("#auth").hidden = true;
  $("#app").hidden = false;
  $("#user-box").hidden = !me.user;
  if (me.user) $("#user-email").textContent = me.user.email;
}

async function boot() {
  const me = await api("GET", "/auth/me");
  const badge = $("#mode-badge");
  badge.hidden = false;
  badge.textContent = me.mode === "supabase" ? "Supabase" : "로컬 SQLite";
  badge.classList.toggle("supabase", me.mode === "supabase");
  if (me.auth && !me.user) return showAuth();
  showApp(me);
  await refresh();
}

async function authSubmit(kind) {
  const body = { email: $("#auth-email").value.trim(), password: $("#auth-password").value };
  if (!body.email || !body.password) return authMessage("이메일과 비밀번호를 입력해 주세요.");
  try {
    const res = await api("POST", `/auth/${kind}`, body);
    if (kind === "signup" && res.needs_confirmation) {
      return authMessage("가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.", false);
    }
    $("#auth-password").value = "";
    authMessage("");
    await boot();
  } catch (err) {
    authMessage(err.message);
  }
}

$("#auth-form").addEventListener("submit", (e) => { e.preventDefault(); authSubmit("login"); });
$("#signup").addEventListener("click", () => authSubmit("signup"));
$("#logout").addEventListener("click", () => run(async () => {
  await api("POST", "/auth/logout");
  $("#list").replaceChildren();
  showAuth();
}));

function showError(err) {
  const el = $("#error");
  el.textContent = err ? err.message : "";
  el.hidden = !err;
}

async function run(fn) {
  try {
    showError(null);
    await fn();
  } catch (err) {
    showError(err);
  }
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function chip(tag) {
  const el = document.createElement("span");
  el.className = "chip";
  el.style.setProperty("--c", tag.color);
  el.textContent = tag.name;
  return el;
}

// ---------- 태그 ----------

async function loadTags() {
  state.tags = await api("GET", "/tags");
  const ids = new Set(state.tags.map((t) => t.id));
  state.selectedTags = new Set([...state.selectedTags].filter((id) => ids.has(id)));
  if (state.tag && !ids.has(Number(state.tag))) state.tag = "";
  renderTags();
}

function renderTags() {
  const filter = $("#tag-filter");
  filter.replaceChildren(new Option("모든 태그", ""));
  for (const t of state.tags) filter.add(new Option(t.name, t.id));
  filter.value = state.tag;

  const pick = $("#add-tags");
  pick.replaceChildren();
  for (const t of state.tags) {
    const c = chip(t);
    c.classList.add("toggle");
    c.classList.toggle("on", state.selectedTags.has(t.id));
    c.tabIndex = 0;
    c.setAttribute("role", "checkbox");
    c.setAttribute("aria-checked", state.selectedTags.has(t.id));
    const toggle = () => {
      state.selectedTags.has(t.id) ? state.selectedTags.delete(t.id) : state.selectedTags.add(t.id);
      renderTags();
    };
    c.addEventListener("click", toggle);
    c.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggle()));
    pick.append(c);
  }
  if (!state.tags.length) pick.textContent = "태그가 없습니다. 아래 '태그 관리'에서 만들 수 있어요.";

  const list = $("#tag-list");
  list.replaceChildren();
  for (const t of state.tags) {
    const c = chip(t);
    c.append(` (${t.todo_count})`);
    const x = document.createElement("button");
    x.className = "chip-x";
    x.textContent = "×";
    x.title = "태그 삭제";
    x.addEventListener("click", () => run(async () => {
      if (!confirm(`'${t.name}' 태그를 삭제할까요? 할 일은 지워지지 않습니다.`)) return;
      await api("DELETE", `/tags/${t.id}`);
      await refresh();
    }));
    c.append(x);
    list.append(c);
  }
}

// ---------- 할 일 목록 ----------

async function loadTodos() {
  let todos;
  if (state.view === "today") {
    todos = await api("GET", "/todos/today");
    // 오늘 탭에서도 검색·태그 필터를 적용
    const q = state.q.toLowerCase();
    todos = todos.filter((t) =>
      (!state.tag || t.tags.some((g) => String(g.id) === state.tag)) &&
      (!q || [t.title, t.memo || "", ...t.tags.map((g) => g.name)].some((s) => s.toLowerCase().includes(q))));
  } else {
    const p = new URLSearchParams({ status: state.view });
    if (state.q) p.set("q", state.q);
    if (state.tag) p.set("tag", state.tag);
    todos = await api("GET", `/todos?${p}`);
  }
  renderTodos(todos);
}

function renderTodos(todos) {
  const list = $("#list");
  list.replaceChildren();
  const today = todayStr();
  const overdue = todos.filter((t) => t.is_overdue).length;
  $("#summary").textContent =
    `${todos.length}개` + (overdue ? ` · 마감 지난 일 ${overdue}개` : "") +
    (state.view === "today" ? " · 오늘 마감, 마감 지남, ☆로 고른 일" : "");

  if (!todos.length) {
    const li = document.createElement("li");
    li.className = "empty muted";
    li.textContent = state.q || state.tag ? "조건에 맞는 할 일이 없습니다." : "할 일이 없습니다.";
    list.append(li);
    return;
  }

  for (const t of todos) {
    const li = $("#item-tpl").content.firstElementChild.cloneNode(true);
    li.classList.toggle("is-done", !!t.is_done);
    li.classList.toggle("is-overdue", !!t.is_overdue);

    const cb = li.querySelector(".done");
    cb.checked = !!t.is_done;
    cb.addEventListener("change", () => run(async () => {
      await api("PATCH", `/todos/${t.id}`, { is_done: cb.checked });
      await refresh();
    }));

    li.querySelector(".title").textContent = t.title;
    const memo = li.querySelector(".memo");
    memo.textContent = t.memo || "";
    memo.hidden = !t.memo;

    const meta = li.querySelector(".meta");
    if (t.due_date) {
      const due = document.createElement("span");
      due.className = "due";
      if (t.is_overdue) { due.classList.add("overdue"); due.textContent = `마감 ${t.due_date} (지남)`; }
      else if (t.due_date === today && !t.is_done) { due.classList.add("today"); due.textContent = `마감 오늘`; }
      else due.textContent = `마감 ${t.due_date}`;
      meta.append(due);
    }
    if (t.reschedule_cnt) {
      const r = document.createElement("span");
      r.className = "badge";
      r.textContent = `미룸 ${t.reschedule_cnt}회`;
      meta.append(r);
    }
    if (t.is_done && t.done_at) {
      const d = document.createElement("span");
      d.className = "muted";
      d.textContent = `완료 ${t.done_at.slice(0, 16)}`;
      meta.append(d);
    }
    for (const g of t.tags) meta.append(chip(g));

    const pick = li.querySelector(".pick");
    pick.textContent = t.is_today_pick ? "★" : "☆";
    pick.classList.toggle("on", !!t.is_today_pick);
    pick.title = t.is_today_pick ? "오늘 할 일에서 빼기" : "오늘 할 일로 고르기";
    pick.hidden = !!t.is_done;
    pick.addEventListener("click", () => run(async () => {
      await api("PATCH", `/todos/${t.id}`, { is_today_pick: !t.is_today_pick });
      await refresh();
    }));

    const resched = li.querySelector(".resched");
    resched.hidden = !!t.is_done;
    if (!t.due_date) resched.textContent = "마감일 지정";
    resched.addEventListener("click", () => run(() => openReschedule(t)));

    li.querySelector(".del").addEventListener("click", () => run(async () => {
      if (!confirm(`'${t.title}'을(를) 삭제할까요?`)) return;
      await api("DELETE", `/todos/${t.id}`);
      await refresh();
    }));

    list.append(li);
  }
}

// ---------- 기간 재설정 ----------

async function openReschedule(t) {
  state.reschedId = t.id;
  $("#resched-title").textContent = `${t.title} · 현재 마감: ${t.due_date || "없음"}`;
  $("#resched-due").value = "";
  $("#resched-due").min = todayStr();
  $("#resched-reason").value = "";
  const hist = await api("GET", `/todos/${t.id}/history`);
  const ul = $("#resched-history");
  ul.replaceChildren();
  if (!hist.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "기록 없음";
    ul.append(li);
  }
  for (const h of hist) {
    const li = document.createElement("li");
    li.textContent = `${h.changed_at.slice(0, 16)} · ${h.old_due || "없음"} → ${h.new_due}` + (h.reason ? ` · ${h.reason}` : "");
    ul.append(li);
  }
  $("#resched-dialog").showModal();
}

$("#resched-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    await api("POST", `/todos/${state.reschedId}/reschedule`, {
      due_date: $("#resched-due").value,
      reason: $("#resched-reason").value,
    });
    $("#resched-dialog").close();
    await refresh();
  });
});
$("#resched-cancel").addEventListener("click", () => $("#resched-dialog").close());

// ---------- 추가 / 필터 ----------

$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    await api("POST", "/todos", {
      title: $("#add-title").value,
      due_date: $("#add-due").value || null,
      memo: $("#add-memo").value,
      tag_ids: [...state.selectedTags],
    });
    $("#add-form").reset();
    state.selectedTags.clear();
    await refresh();
    $("#add-title").focus();
  });
});

$("#tag-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    await api("POST", "/tags", { name: $("#tag-name").value, color: $("#tag-color").value });
    $("#tag-name").value = "";
    await refresh();
  });
});

document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    state.view = btn.dataset.view;
    run(loadTodos);
  }));

let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value.trim(); run(loadTodos); }, 250);
});

$("#tag-filter").addEventListener("change", (e) => {
  state.tag = e.target.value;
  run(loadTodos);
});

async function refresh() {
  await loadTags();
  await loadTodos();
}

run(boot);
