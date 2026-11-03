// 후보자 화면 — 링크 토큰으로 열린 시간만 보고, 하나를 예약하거나 변경
(function () {
  "use strict";

  if (!APP.checkReady()) return;

  const { $, esc } = APP;
  const db = APP.db;
  const token = APP.token();

  const state = { data: null, busy: false };

  function fail(message) {
    APP.ready();
    $("#main-view").hidden = true;
    $("#error-view").hidden = false;
    $("#error-text").textContent = message;
  }

  function render() {
    const data = state.data;
    if (!data) return;
    document.title = `${data.position} — 후보자`;
    $("#pos-title").textContent = data.position;
    $("#greeting").textContent = `${data.name}님, 가능한 시간을 골라 주세요.`;

    const list = $("#slot-list");
    if (!data.slots.length) {
      list.innerHTML = `<div class="empty">아직 예약할 수 있는 시간이 없어요. 담당자가 면접관 일정을 모으는 중이에요.</div>`;
      return;
    }

    list.innerHTML = data.slots
      .map((slot) => {
        const time = esc(APP.fmtRange(slot.starts_at, slot.duration_min));
        if (slot.status === "mine") {
          return `
            <div class="choice is-mine">
              <span class="choice-main">
                <span>
                  <span class="slot-time">${time}</span>
                  <span class="state">예약한 시간이에요</span>
                </span>
              </span>
              <span class="badge badge-brand">내 예약</span>
            </div>`;
        }
        if (slot.status === "open") {
          return `
            <div class="choice">
              <span class="choice-main">
                <span>
                  <span class="slot-time">${time}</span>
                  <span class="state">예약 가능</span>
                </span>
              </span>
              <button class="btn btn-primary btn-small" type="button"
                data-book="${esc(slot.id)}">${data.my_slot ? "이 시간으로 변경" : "예약하기"}</button>
            </div>`;
        }
        const label =
          slot.status === "booked"
            ? "마감"
            : slot.status === "past"
              ? "지난 시간"
              : "면접관 일정 부족";
        return `
          <div class="choice is-locked">
            <span class="choice-main">
              <span>
                <span class="slot-time">${time}</span>
                <span class="state">${esc(label)}</span>
              </span>
            </span>
            <span class="badge">${esc(label)}</span>
          </div>`;
      })
      .join("");
  }

  async function load() {
    const { data, error } = await db.rpc("candidate_view", { p_token: token });
    if (error) {
      fail(APP.errorText(error, "링크를 열 수 없어요. 담당자에게 다시 받아 주세요."));
      return;
    }
    state.data = data;
    APP.ready();
    $("#main-view").hidden = false;
    render();
  }

  $("#slot-list").addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-book]");
    if (!btn || state.busy) return;
    const changing = Boolean(state.data.my_slot);
    state.busy = true;
    btn.disabled = true;
    const { error } = await db.rpc("book_slot", { p_token: token, p_slot: btn.dataset.book });
    state.busy = false;
    if (error) {
      // 함수가 준 한국어 안내를 그대로 보여 주고, 최신 상태로 다시 그려요.
      APP.toast(APP.errorText(error, "예약하지 못했어요."), true);
      await load();
      return;
    }
    await load();
    APP.toast(changing ? "예약 시간을 바꿨어요." : "예약했어요. 담당자에게 전달됩니다.");
  });

  (async () => {
    if (!token) {
      fail("주소에 링크 토큰이 없어요. 담당자가 보낸 링크를 그대로 열어 주세요.");
      return;
    }
    await load();
  })();
})();
