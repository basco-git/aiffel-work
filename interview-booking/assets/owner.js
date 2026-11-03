// 담당자 화면 — 로그인, 포지션·면접관·후보자·시간 후보 만들기, 현황 보기, 예약 취소
(function () {
  "use strict";

  if (!APP.checkReady()) return;

  const { $, esc } = APP;
  const db = APP.db;

  const state = {
    user: null,
    positions: [],
    position: null,
    interviewers: [],
    candidates: [],
    slots: [],
    availability: [],
    bookings: [],
  };

  // ---------- 화면 전환 ----------
  function showLogin(message) {
    APP.ready();
    setAuthTab("login");
    $("#login-view").hidden = false;
    $("#app-view").hidden = true;
    $("#logout").hidden = true;
    $("#who").textContent = "";
    if (message) showLoginError(message);
  }

  function showApp(session) {
    APP.ready();
    state.user = session.user;
    $("#login-view").hidden = true;
    $("#app-view").hidden = false;
    $("#logout").hidden = false;
    $("#who").textContent = session.user.email || "";
    $("#login-error").hidden = true;
    loadPositions();
  }

  function showLoginError(message) {
    const box = $("#login-error");
    box.textContent = message;
    box.hidden = false;
  }

  // ---------- 로그인 ----------
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = $("#login-btn");
    const email = $("#email").value.trim();
    const password = $("#password").value;
    $("#login-error").hidden = true;
    btn.disabled = true;
    btn.textContent = "로그인 중…";
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = "로그인";
    if (error) {
      showLoginError(
        /invalid login credentials/i.test(error.message)
          ? "이메일 또는 비밀번호가 맞지 않아요."
          : APP.errorText(error, "로그인하지 못했어요.")
      );
      return;
    }
    showApp(data.session);
  });

  $("#logout").addEventListener("click", async () => {
    await db.auth.signOut();
    state.position = null;
    state.positions = [];
    $("#password").value = "";
    showLogin();
  });

  // ---------- 회원가입 ----------
  function setAuthTab(name) {
    const isLogin = name === "login";
    $("#tab-login").classList.toggle("is-active", isLogin);
    $("#tab-signup").classList.toggle("is-active", !isLogin);
    $("#tab-login").setAttribute("aria-selected", String(isLogin));
    $("#tab-signup").setAttribute("aria-selected", String(!isLogin));
    $("#login-form").hidden = !isLogin;
    $("#signup-form").hidden = isLogin;
    $("#auth-title").textContent = isLogin ? "담당자 로그인" : "담당자 회원가입";
    $("#auth-sub").textContent = isLogin
      ? "시간 후보를 만들고 링크를 전달하는 화면이에요."
      : "계정을 만들면 내 포지션과 시간 후보를 다른 담당자와 분리해 관리해요.";
    $("#signup-error").hidden = true;
  }

  $("#tab-login").addEventListener("click", () => setAuthTab("login"));
  $("#tab-signup").addEventListener("click", () => setAuthTab("signup"));

  function showSignupError(message) {
    const box = $("#signup-error");
    box.textContent = message;
    box.hidden = false;
  }

  function signupErrorText(error) {
    const message = error.message || "";
    if (/already registered|already been registered|user already exists/i.test(message))
      return "이미 가입된 이메일이에요. 로그인해 주세요.";
    if (/password/i.test(message) && /(6|least|short|weak)/i.test(message))
      return "비밀번호는 6자 이상으로 정해 주세요.";
    if (/signups? not allowed|signup.*disabled|email signups are disabled/i.test(message))
      return "지금은 회원가입이 꺼져 있어요. 담당자에게 문의해 주세요.";
    if (/invalid.*email|email.*invalid|unable to validate email/i.test(message))
      return "이메일 형식을 확인해 주세요.";
    return APP.errorText(error, "가입하지 못했어요.");
  }

  $("#signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = $("#signup-btn");
    const email = $("#signup-email").value.trim();
    const password = $("#signup-password").value;
    const password2 = $("#signup-password2").value;
    $("#signup-error").hidden = true;
    $("#signup-info").hidden = true;

    if (password.length < 6) return showSignupError("비밀번호는 6자 이상으로 정해 주세요.");
    if (password !== password2) return showSignupError("비밀번호 확인이 일치하지 않아요.");

    btn.disabled = true;
    btn.textContent = "가입 중…";
    const { data, error } = await db.auth.signUp({ email, password });
    btn.disabled = false;
    btn.textContent = "가입하고 시작하기";

    if (error) {
      showSignupError(signupErrorText(error));
      return;
    }
    if (data.session) {
      showApp(data.session);
      APP.toast("가입했어요. 포지션을 만들어 시작해 보세요.");
      return;
    }
    // 이메일 확인이 켜진 프로젝트에서는 메일 확인 뒤 로그인해요.
    const info = $("#signup-info");
    info.textContent = "가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.";
    info.hidden = false;
    $("#signup-password").value = "";
    $("#signup-password2").value = "";
  });

  // ---------- 포지션 ----------
  function renderPositionSelect() {
    const select = $("#pos-select");
    select.innerHTML = state.positions
      .map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`)
      .join("");
    select.hidden = state.positions.length === 0;
    if (state.position) select.value = state.position.id;
    $("#new-pos-toggle").hidden = state.positions.length === 0;
    if (state.positions.length === 0) $("#pos-form").hidden = false;
  }

  async function loadPositions(keepId) {
    const { data, error } = await db
      .from("positions")
      .select("id,title,required_interviewers")
      .order("created_at", { ascending: true });
    if (error) {
      APP.toast(APP.errorText(error, "포지션을 불러오지 못했어요."), true);
      return;
    }
    state.positions = data || [];
    const wanted = keepId || (state.position && state.position.id);
    const next = state.positions.find((p) => p.id === wanted) || state.positions[0] || null;
    state.position = next;
    renderPositionSelect();
    if (next) await loadPositionData();
    else renderAll();
  }

  $("#pos-select").addEventListener("change", async (event) => {
    state.position = state.positions.find((p) => p.id === event.target.value) || null;
    await loadPositionData();
  });

  $("#new-pos-toggle").addEventListener("click", () => {
    const form = $("#pos-form");
    form.hidden = !form.hidden;
    if (!form.hidden) $("#pos-name").focus();
  });

  $("#pos-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#pos-name").value.trim();
    if (!title) return;
    const required = Number($("#pos-required").value);
    const { data, error } = await db
      .from("positions")
      .insert({ title, required_interviewers: required, owner_id: state.user.id })
      .select("id")
      .single();
    if (error) {
      APP.toast(APP.errorText(error, "포지션을 만들지 못했어요."), true);
      return;
    }
    $("#pos-name").value = "";
    $("#pos-form").hidden = true;
    $("#new-pos-toggle").hidden = false;
    await loadPositions(data.id);
    APP.toast("포지션을 만들었어요.");
  });

  // ---------- 데이터 불러오기 ----------
  async function loadPositionData() {
    const pos = state.position;
    if (!pos) {
      renderAll();
      return;
    }
    const [ivs, cands, slots] = await Promise.all([
      db.from("interviewers").select("id,name,token").eq("position_id", pos.id).order("created_at"),
      db.from("candidates").select("id,name,token").eq("position_id", pos.id).order("created_at"),
      db.from("slots").select("id,starts_at,duration_min").eq("position_id", pos.id).order("starts_at"),
    ]);
    const failed = [ivs, cands, slots].find((r) => r.error);
    if (failed) {
      APP.toast(APP.errorText(failed.error, "현황을 불러오지 못했어요."), true);
      return;
    }
    state.interviewers = ivs.data || [];
    state.candidates = cands.data || [];
    state.slots = slots.data || [];
    state.availability = [];
    state.bookings = [];

    const ids = state.slots.map((s) => s.id);
    if (ids.length) {
      const [av, bk] = await Promise.all([
        db.from("availability").select("slot_id,interviewer_id,interviewers(name)").in("slot_id", ids),
        db.from("bookings").select("slot_id,candidate_id,candidates(name)").in("slot_id", ids),
      ]);
      if (av.error || bk.error) {
        APP.toast(APP.errorText(av.error || bk.error, "현황을 불러오지 못했어요."), true);
        return;
      }
      state.availability = av.data || [];
      state.bookings = bk.data || [];
    }
    renderAll();
  }

  const nameOf = (row, table) => {
    const embedded = row && row[table];
    if (!embedded) return "";
    return (Array.isArray(embedded) ? embedded[0] : embedded).name || "";
  };

  // ---------- 그리기 ----------
  function renderAll() {
    const pos = state.position;
    $("#pos-title").textContent = pos ? pos.title : "면접 일정";
    $("#pos-sub").textContent = pos
      ? `필요 면접관 ${pos.required_interviewers}명 · 면접관이 ${pos.required_interviewers}명 이상 가능한 시간만 후보자에게 열려요.`
      : "포지션을 고르거나 새로 만들어 주세요.";

    renderPeople($("#iv-list"), state.interviewers, "interviewer");
    renderPeople($("#cand-list"), state.candidates, "candidate");
    renderSlots();
    if (state.positions.length === 0) $("#pos-form").hidden = false;
  }

  function renderPeople(listEl, rows, kind) {
    if (!rows.length) {
      listEl.innerHTML = `<li><span class="muted">아직 없어요. 이름을 추가하면 링크가 생겨요.</span></li>`;
      return;
    }
    listEl.innerHTML = rows
      .map(
        (row) => `
        <li>
          <span class="name">${esc(row.name)}</span>
          <span class="link-row">
            <button class="btn btn-small btn-ghost" type="button"
              data-copy="${kind}" data-token="${esc(row.token)}"
              data-name="${esc(row.name)}">링크 복사</button>
          </span>
        </li>`
      )
      .join("");
  }

  function renderSlots() {
    const list = $("#slot-list");
    if (!state.position) {
      list.innerHTML = "";
      return;
    }
    if (!state.slots.length) {
      list.innerHTML = `<div class="empty">아직 시간 후보가 없어요. 위에서 시작 시각과 길이를 골라 추가해 주세요.</div>`;
      return;
    }
    const required = state.position.required_interviewers;
    list.innerHTML = state.slots
      .map((slot) => {
        const names = state.availability
          .filter((a) => a.slot_id === slot.id)
          .map((a) => nameOf(a, "interviewers"))
          .filter(Boolean);
        const booking = state.bookings.find((b) => b.slot_id === slot.id);
        const candidateName = booking ? nameOf(booking, "candidates") : "";
        const past = new Date(slot.starts_at).getTime() <= Date.now();
        const enough = names.length >= required;
        const badge = past
          ? `<span class="badge">지난 시간</span>`
          : enough
            ? `<span class="badge badge-ok">열림 ${names.length}/${required}</span>`
            : `<span class="badge badge-warn">닫힘 ${names.length}/${required}</span>`;
        const cancel = booking
          ? `<button class="btn btn-small btn-ghost" type="button" data-cancel="${esc(slot.id)}"
               data-label="${esc(APP.fmtRange(slot.starts_at, slot.duration_min))}">예약 취소</button>`
          : "";
        return `
          <article class="slot ${booking ? "is-booked" : ""}">
            <div class="slot-row">
              <span class="slot-time">${esc(APP.fmtRange(slot.starts_at, slot.duration_min))}</span>
              ${badge}
            </div>
            <p class="slot-meta">가능 면접관 ${names.length}명${names.length ? `: <strong>${names.map(esc).join(", ")}</strong>` : ""}</p>
            <p class="slot-meta">${
              booking
                ? `예약자: <strong>${esc(candidateName)}</strong> ${cancel}`
                : `<span>예약자 없음</span>`
            }</p>
          </article>`;
      })
      .join("");
  }

  // ---------- 추가 ----------
  async function addPerson(kind) {
    const isIv = kind === "interviewer";
    const input = isIv ? $("#iv-name") : $("#cand-name");
    const name = input.value.trim();
    if (!name) return;
    const { error } = await db.from(isIv ? "interviewers" : "candidates").insert({
      position_id: state.position.id,
      name,
    });
    if (error) {
      APP.toast(APP.errorText(error, "추가하지 못했어요."), true);
      return;
    }
    input.value = "";
    await loadPositionData();
    APP.toast(
      isIv
        ? "면접관을 추가했어요. 링크를 복사해 전달해 주세요."
        : "후보자를 추가했어요. 링크를 복사해 전달해 주세요."
    );
  }

  $("#iv-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.position) return APP.toast("먼저 포지션을 만들어 주세요.", true);
    await addPerson("interviewer");
  });

  $("#cand-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.position) return APP.toast("먼저 포지션을 만들어 주세요.", true);
    await addPerson("candidate");
  });

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // 브라우저가 어느 시간대에 있든 입력은 한국 시간(KST)으로 해석해요.
  function kstToIso(value) {
    return new Date(value.length === 16 ? `${value}:00+09:00` : `${value}+09:00`).toISOString();
  }

  // 기기 시간대와 상관없이 '한국 기준 내일 10:00'을 기본값으로 보여 줘요.
  function defaultSlotStart() {
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 10, 0)
    );
    return `${tomorrow.getUTCFullYear()}-${pad(tomorrow.getUTCMonth() + 1)}-${pad(tomorrow.getUTCDate())}T10:00`;
  }

  $("#slot-start").value = defaultSlotStart();

  $("#slot-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.position) return APP.toast("먼저 포지션을 만들어 주세요.", true);
    const value = $("#slot-start").value;
    const duration = Number($("#slot-duration").value);
    if (!value) return APP.toast("시작 시각을 골라 주세요.", true);
    const iso = kstToIso(value);
    if (Number.isNaN(new Date(iso).getTime())) return APP.toast("시작 시각을 다시 확인해 주세요.", true);
    if (new Date(iso).getTime() <= Date.now()) return APP.toast("지난 시간은 추가할 수 없어요.", true);

    const btn = event.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const { error } = await db.from("slots").insert({
      position_id: state.position.id,
      starts_at: iso,
      duration_min: duration,
    });
    btn.disabled = false;
    if (error) {
      let message = APP.errorText(error, "시간을 추가하지 못했어요.");
      if (error.code === "23P01") message = "이미 겹치는 시간 후보가 있어요. 다른 시간을 골라 주세요.";
      else if (error.code === "23514") message = "길이는 15~120분, 15분 단위여야 해요.";
      APP.toast(message, true);
      return;
    }
    await loadPositionData();
    APP.toast("시간 후보를 추가했어요.");
    $("#slot-start").value = defaultSlotStart();
  });

  // ---------- 목록 버튼(링크 복사·예약 취소) ----------
  document.addEventListener("click", async (event) => {
    const copyBtn = event.target.closest("[data-copy]");
    if (copyBtn) {
      const kind = copyBtn.dataset.copy;
      const page = kind === "interviewer" ? "interviewer.html" : "candidate.html";
      const link = APP.pageLink(page, copyBtn.dataset.token);
      const copied = await APP.copy(link);
      APP.toast(
        copied
          ? `${copyBtn.dataset.name}님 ${kind === "interviewer" ? "면접관" : "후보자"} 링크를 복사했어요.`
          : "주소를 복사해 전달해 주세요."
      );
      return;
    }

    const cancelBtn = event.target.closest("[data-cancel]");
    if (cancelBtn) {
      const ok = window.confirm(`${cancelBtn.dataset.label} 예약을 취소할까요?\n취소하면 그 시간이 다시 열리고, 후보자는 다른 시간을 고를 수 있어요.`);
      if (!ok) return;
      cancelBtn.disabled = true;
      const { error } = await db.from("bookings").delete().eq("slot_id", cancelBtn.dataset.cancel);
      if (error) {
        cancelBtn.disabled = false;
        APP.toast(APP.errorText(error, "예약을 취소하지 못했어요."), true);
        return;
      }
      await loadPositionData();
      APP.toast("예약을 취소했어요.");
    }
  });

  // ---------- 시작 ----------
  (async () => {
    const { data } = await db.auth.getSession();
    if (data.session) showApp(data.session);
    else showLogin();
    db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) showLogin();
    });
  })();
})();
