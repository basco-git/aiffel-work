// 면접관 화면 — 링크 토큰으로 자기 일정만 보고, 가능한 시간을 체크
(function () {
  "use strict";

  if (!APP.checkReady()) return;

  const { $, esc } = APP;
  const db = APP.db;
  const token = APP.token();

  const state = { data: null, saving: new Set() };

  function fail(message) {
    APP.ready();
    $("#main-view").hidden = true;
    $("#error-view").hidden = false;
    $("#error-text").textContent = message;
  }

  function render() {
    const data = state.data;
    if (!data) return;
    document.title = `${data.position} — 면접관`;
    $("#pos-title").textContent = data.position;
    // 채용 완료된 포지션은 서버가 체크를 막아요(R10). 화면에서도 미리 알려 줘요.
    $("#greeting").textContent = data.completed
      ? `${data.name}님, 채용이 끝난 포지션이라 더 체크할 필요가 없어요. 감사합니다.`
      : `${data.name}님, 가능한 시간을 체크해 주세요.`;

    const list = $("#slot-list");
    if (!data.slots.length) {
      list.innerHTML = `<div class="empty">담당자가 아직 시간 후보를 만들지 않았어요. 잠시 뒤 새로고침해 주세요.</div>`;
      return;
    }

    list.innerHTML = data.slots
      .map((slot) => {
        const locked = data.completed || slot.booked || slot.past;
        const note = slot.booked
          ? "예약된 시간이라 바꿀 수 없어요"
          : data.completed
            ? "채용이 끝났어요"
            : slot.past
            ? "지난 시간"
            : slot.mine
              ? "가능으로 표시했어요"
              : "가능하면 체크해 주세요";
        const badge = slot.booked
          ? `<span class="badge badge-ok">예약됨</span>`
          : slot.past
            ? `<span class="badge">지난 시간</span>`
            : "";
        return `
          <div class="choice ${slot.past ? "is-locked" : ""}"
               data-slot="${esc(slot.id)}">
            <label class="choice-main" style="flex:1;cursor:${locked ? "not-allowed" : "pointer"}">
              <input type="checkbox" ${slot.mine ? "checked" : ""} ${locked ? "disabled" : ""}
                     aria-label="${esc(APP.fmtRange(slot.starts_at, slot.duration_min))} 가능">
              <span>
                <span class="slot-time">${esc(APP.fmtRange(slot.starts_at, slot.duration_min))}</span>
                <span class="state">${esc(note)}</span>
              </span>
            </label>
            ${badge}
          </div>`;
      })
      .join("");
  }

  async function load() {
    const { data, error } = await db.rpc("interviewer_view", { p_token: token });
    if (error) {
      fail(APP.errorText(error, "링크를 열 수 없어요. 담당자에게 다시 받아 주세요."));
      return;
    }
    state.data = data;
    APP.ready();
    $("#main-view").hidden = false;
    render();
  }

  $("#slot-list").addEventListener("change", async (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    const row = input.closest("[data-slot]");
    const slotId = row.dataset.slot;
    const available = input.checked;
    input.disabled = true;
    const { error } = await db.rpc("set_availability", {
      p_token: token,
      p_slot: slotId,
      p_available: available,
    });
    if (error) {
      // 함수가 거부한 이유를 그대로 보여 주고, 화면은 최신 상태로 다시 그려요.
      input.checked = !available;
      APP.toast(APP.errorText(error, "저장하지 못했어요."), true);
      await load();
      return;
    }
    // 저장한 값을 화면 상태와 안내 문구에도 반영해요.
    const slot = state.data.slots.find((s) => s.id === slotId);
    if (slot) slot.mine = available;
    const note = row.querySelector(".state");
    if (note) note.textContent = available ? "가능으로 표시했어요" : "가능하면 체크해 주세요";
    input.disabled = false;
    APP.toast(available ? "가능으로 저장했어요." : "가능을 해제했어요.");
  });

  (async () => {
    if (!token) {
      fail("주소에 링크 토큰이 없어요. 담당자가 보낸 링크를 그대로 열어 주세요.");
      return;
    }
    await load();
  })();
})();
