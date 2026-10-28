/** 키보드·마우스·가상 조이스틱 입력을 한곳에 모은다. 씬은 매 프레임 이 값을 읽는다. */
export const input = {
  /** 가상 조이스틱 (화면 방향, −1~1) */
  stickX: 0,
  stickY: 0,
  /** 모바일 공격 버튼을 누르고 있는지 */
  attackHeld: false,
  /** 한 번 눌림 이벤트 (씬이 처리 후 false로 되돌림) */
  interactPressed: false,
};
