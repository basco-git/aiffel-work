// 화면 3개가 함께 쓰는 준비물: Supabase 연결, 날짜 표시, 알림, 링크 복사
(function () {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || "").trim();
  const key = String(cfg.SUPABASE_ANON_KEY || "").trim();

  // config.js의 예시 값이 그대로면 아직 설정하지 않은 것으로 봅니다.
  const configured =
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) && key.length > 20 && !key.startsWith("YOUR-");

  const APP = {};
  APP.configured = configured;
  APP.db = null;

  // 화면 준비가 끝나면 '불러오는 중…'을 감춰요. 스크립트가 멈추면 이 글이 남아 문제를 알려 줘요.
  APP.ready = () => {
    const booting = document.getElementById("booting");
    if (booting) booting.hidden = true;
  };

  if (configured) {
    if (typeof window.supabase === "undefined") {
      APP.cdnFailed = true;
    } else {
      APP.db = window.supabase.createClient(url.replace(/\/+$/, ""), key, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
  }

  APP.$ = (sel, root) => (root || document).querySelector(sel);
  APP.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  APP.esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  // 시간은 화면마다 같게 보이도록 한국 시간(KST)으로 표시해요.
  const dayFmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const timeFmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  APP.fmtDay = (iso) => dayFmt.format(new Date(iso));
  APP.fmtTime = (iso) => timeFmt.format(new Date(iso));
  APP.fmtRange = (startIso, durationMin) => {
    const start = new Date(startIso);
    const end = new Date(start.getTime() + Number(durationMin) * 60000);
    return `${dayFmt.format(start)} ${timeFmt.format(start)}–${timeFmt.format(end)}`;
  };

  // 함수가 준 한국어 오류는 그대로 보여 주고, 연결 문제만 알아보기 쉽게 바꿔요.
  APP.errorText = (err, fallback) => {
    const raw = (err && (err.message || err.error_description || err.details)) || "";
    const text = String(raw).trim();
    if (!text) return fallback || "알 수 없는 문제가 생겼어요.";
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) {
      return "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
    }
    if (/invalid api key|invalid jwt|jwt expired/i.test(text)) {
      return "공개 키가 올바르지 않아요. assets/config.js 값을 확인해 주세요.";
    }
    return text;
  };

  let toastTimer = null;
  APP.toast = (message, isError) => {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = isError ? "is-error" : "";
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, isError ? 5000 : 2800);
  };

  APP.copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // 클립보드 권한이 없는 브라우저(예: http 주소)에서는 직접 복사하게 안내해요.
      window.prompt("아래 주소를 복사해 주세요.", text);
      return false;
    }
  };

  APP.pageLink = (page, token) =>
    new URL(`${page}?t=${encodeURIComponent(token)}`, window.location.href).href;

  // 링크 화면에서 token을 읽어요.
  APP.token = () => new URLSearchParams(window.location.search).get("t") || "";

  // 설정이 안 된 상태를 화면 맨 위에 알려 줘요.
  APP.checkReady = () => {
    APP.ready();
    if (APP.configured && !APP.cdnFailed) return true;
    const box = APP.$("#setup");
    if (box) {
      box.hidden = false;
      const reason = APP.$("#setup-reason");
      if (reason && APP.cdnFailed) {
        reason.textContent =
          "Supabase 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.";
      }
    }
    APP.$("#login-view") && (APP.$("#login-view").hidden = true);
    APP.$("#app-view") && (APP.$("#app-view").hidden = true);
    APP.$("#main-view") && (APP.$("#main-view").hidden = true);
    return false;
  };

  window.APP = APP;
})();
