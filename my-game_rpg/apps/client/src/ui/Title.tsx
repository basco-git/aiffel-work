import { useState } from 'preact/hooks';
import type { Faction } from '@tb/shared';
import { CFG } from '../core/data';
import { store } from '../core/store';

const LORE = [
  '어느 날 거대한 탑이 나타났고, 탑 브레이크로 지구 생명의 50%가 소멸했다.',
  '탑 주변은 오염되어 변이 몬스터가 상주한다. 생존자는 두 세력으로 나뉘어 몸을 강화해 싸운다.',
  '탑 안에는 지능이 높은 외계 관리자들이 층마다 몬스터를 부린다.',
];

const FACTION_INFO: Record<Faction, string[]> = {
  mechanic: ['원거리 투사체 공격', '부품으로 부위 교체·업그레이드', '무기·방어구 장착 가능'],
  genetic: ['근접 손 무기화 공격', '몬스터 세포를 모아 부위 이식', '장비 없이 강화만으로 성장'],
};

export function Title() {
  const [confirm, setConfirm] = useState<Faction | null>(null);

  const choose = (f: Faction) => {
    if (store.hasSave && confirm !== f) {
      setConfirm(f);
      return;
    }
    store.newGame(f);
  };

  return (
    <div class="title">
      <h1>
        타워 브레이크 <small>0단계 테스트</small>
      </h1>
      <div class="lore">
        {LORE.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      {store.hasSave && (
        <button class="btn primary big" onClick={() => store.continueGame()}>
          이어하기
        </button>
      )}
      <p class="hint">{store.hasSave ? '새로 시작하기: 세력을 고르면 기존 진행이 삭제됩니다.' : '세력을 선택하세요. 선택 후에는 바꿀 수 없습니다.'}</p>
      <div class="factions">
        {(['mechanic', 'genetic'] as const).map((f) => (
          <button key={f} class={`faction ${f}`} onClick={() => choose(f)} data-testid={`faction-${f}`}>
            <div class="fname">{CFG.factions[f].name}</div>
            <div class="ftag">{CFG.factions[f].tagline}</div>
            <ul>
              {FACTION_INFO[f].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {confirm === f && <div class="warn">한 번 더 누르면 기존 진행을 지우고 새로 시작합니다</div>}
          </button>
        ))}
      </div>
      <p class="controls">
        PC: WASD/방향키 이동 · 클릭 또는 스페이스 공격 · E 상호작용 · I 인벤토리 · J 퀘스트 · U 장비
        <br />
        모바일: 왼쪽 조이스틱 이동 · 오른쪽 버튼 공격 (가로 화면 권장)
      </p>
    </div>
  );
}
