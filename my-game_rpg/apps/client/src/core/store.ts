import { del, get, set } from 'idb-keyval';
import {
  GRADES,
  PART_IDS,
  applyDeathPenalty,
  applyQuestEvent,
  attemptEnhance,
  canEnhance,
  computeStats,
  migrateSave,
  newSave,
  questProgress,
  type EnhanceResult,
  type EquipmentDef,
  type Faction,
  type Grade,
  type MaterialDrop,
  type PartId,
  type PlayerStats,
  type QuestDef,
  type QuestEvent,
  type SaveData,
} from '@tb/shared';
import { CFG, DATA } from './data';

const SAVE_KEY = 'tower-break-save';

export type Screen = 'loading' | 'title' | 'play';
export type Panel = null | 'npc' | 'enhance' | 'equip' | 'inventory' | 'quest' | 'tower' | 'debug';

export interface Toast {
  id: number;
  text: string;
  color?: string;
}

export interface Runtime {
  hp: number;
  regionId: string;
  regionName: string;
  safe: boolean;
  location: 'world' | 'tower';
  floor: number;
  mission: { title: string; detail: string; timer?: number } | null;
  interact: { kind: 'npc' | 'tower' | 'exit'; label: string } | null;
}

export interface EnhanceLogEntry extends EnhanceResult {
  part: PartId;
  grade: Grade;
  id: number;
}

export type Command =
  | { type: 'enterFloor'; floor: number }
  | { type: 'leaveTower' }
  | { type: 'teleport'; x: number; y: number }
  | { type: 'heal' }
  | { type: 'killAll' };

export class Store {
  screen: Screen = 'loading';
  save: SaveData | null = null;
  hasSave = false;
  panel: Panel = null;
  toasts: Toast[] = [];
  enhanceLog: EnhanceLogEntry[] = [];
  dialog: string | null = null;
  touch = false;
  rt: Runtime = {
    hp: 1,
    regionId: '',
    regionName: '',
    safe: true,
    location: 'world',
    floor: 0,
    mission: null,
    interact: null,
  };
  version = 0;

  private listeners = new Set<() => void>();
  private cmdListeners = new Set<(c: Command) => void>();
  private pending: SaveData | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 1;
  private cachedStats: PlayerStats | null = null;

  // ---------- 구독 ----------
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onCommand(fn: (c: Command) => void): () => void {
    this.cmdListeners.add(fn);
    return () => this.cmdListeners.delete(fn);
  }
  command(c: Command) {
    for (const fn of this.cmdListeners) fn(c);
  }
  changed(persist = false) {
    this.version++;
    this.cachedStats = null;
    for (const fn of this.listeners) fn();
    if (persist) this.schedulePersist();
  }

  // ---------- 저장 ----------
  async init() {
    try {
      this.pending = migrateSave(await get(SAVE_KEY));
    } catch (e) {
      console.warn('세이브를 읽지 못했습니다', e);
      this.pending = null;
    }
    this.hasSave = !!this.pending;
    this.screen = 'title';
    this.changed();
  }

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 400);
  }

  async persistNow() {
    if (!this.save) return;
    try {
      await set(SAVE_KEY, JSON.parse(JSON.stringify(this.save)));
    } catch (e) {
      console.warn('저장 실패', e);
    }
  }

  newGame(faction: Faction) {
    this.save = newSave(faction, DATA.world.respawn[faction]);
    this.enhanceLog = [];
    this.rt.hp = this.stats.maxHp;
    this.screen = 'play';
    this.panel = null;
    void this.persistNow();
    this.changed();
  }

  continueGame() {
    if (!this.pending) return;
    this.save = this.pending;
    this.rt.hp = this.stats.maxHp;
    this.screen = 'play';
    this.changed();
  }

  async resetAll() {
    await del(SAVE_KEY);
    this.save = null;
    this.pending = null;
    this.hasSave = false;
    this.panel = null;
    this.screen = 'title';
    this.changed();
  }

  // ---------- 파생 값 ----------
  get faction(): Faction {
    return this.save!.faction;
  }

  get equippedItems(): EquipmentDef[] {
    const s = this.save!;
    const out: EquipmentDef[] = [];
    for (const uid of [s.equipped.weapon, s.equipped.armor]) {
      const inst = s.items.find((i) => i.uid === uid);
      const def = inst && DATA.equipment.get(inst.id);
      if (def) out.push(def);
    }
    return out;
  }

  get stats(): PlayerStats {
    if (!this.cachedStats) this.cachedStats = computeStats(this.faction, this.save!.enhance, this.equippedItems, CFG, DATA.parts);
    return this.cachedStats;
  }

  partName(part: PartId): string {
    return DATA.parts.names[this.faction][part];
  }

  materialName(part: PartId, grade: Grade): string {
    return `${this.partName(part)} ${CFG.factions[this.faction].material}(${DATA.materials.gradeNames[grade]})`;
  }

  // ---------- UI ----------
  openPanel(p: Panel) {
    this.panel = p;
    this.changed();
  }

  /** E 키 / 상호작용 버튼 */
  interact() {
    const it = this.rt.interact;
    if (!it || !this.save) return;
    if (it.kind === 'npc') {
      this.dialog = this.currentQuest && !this.save.quest.accepted ? null : DATA.quests[this.faction].npc.greeting;
      this.openPanel('npc');
    } else if (it.kind === 'tower') this.openPanel('tower');
    else if (it.kind === 'exit') this.command({ type: 'leaveTower' });
  }

  toast(text: string, color?: string) {
    const t = { id: this.seq++, text, color };
    this.toasts = [...this.toasts.slice(-5), t];
    this.changed();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x !== t);
      this.changed();
    }, 3200);
  }

  setHp(hp: number) {
    const v = Math.max(0, Math.round(hp));
    if (v !== this.rt.hp) {
      this.rt.hp = v;
      this.changed();
    }
  }

  setRuntime(patch: Partial<Runtime>) {
    let diff = false;
    for (const k of Object.keys(patch) as (keyof Runtime)[]) {
      if (JSON.stringify(this.rt[k]) !== JSON.stringify(patch[k])) diff = true;
    }
    if (!diff) return;
    Object.assign(this.rt, patch);
    this.changed();
  }

  // ---------- 인벤토리 ----------
  addMaterials(list: MaterialDrop[], source: 'drop' | 'reward' | 'debug') {
    const s = this.save!;
    for (const m of list) {
      s.materials[m.part][m.grade] += m.count;
      if (source === 'drop') this.questEvent({ type: 'collect', part: m.part, count: m.count }, false);
    }
    this.changed(true);
  }

  addItems(ids: string[]) {
    const s = this.save!;
    for (const id of ids) s.items.push({ uid: `i${s.nextUid++}`, id });
    this.changed(true);
  }

  equip(uid: string) {
    const s = this.save!;
    if (!CFG.factions[s.faction].canEquip) return;
    const inst = s.items.find((i) => i.uid === uid);
    const def = inst && DATA.equipment.get(inst.id);
    if (!def) return;
    this.keepHpRatio(() => (s.equipped[def.slot] = uid));
  }

  unequip(slot: 'weapon' | 'armor') {
    this.keepHpRatio(() => delete this.save!.equipped[slot]);
  }

  private keepHpRatio(fn: () => void) {
    const before = this.stats.maxHp;
    fn();
    this.cachedStats = null;
    const after = this.stats.maxHp;
    if (after > before) this.rt.hp += after - before;
    this.rt.hp = Math.min(this.rt.hp, after);
    this.changed(true);
  }

  // ---------- 강화 ----------
  enhance(part: PartId, grade: Grade): EnhanceLogEntry | null {
    const s = this.save!;
    if (s.materials[part][grade] <= 0 || !canEnhance(s.enhance[part], CFG.enhance)) return null;
    s.materials[part][grade]--;
    s.stats.enhanceTries++;
    const r = attemptEnhance(s.enhance[part], grade, Math.random(), CFG.enhance);
    const entry = { ...r, part, grade, id: this.seq++ };
    this.keepHpRatio(() => (s.enhance[part] = r.to));
    this.enhanceLog = [entry, ...this.enhanceLog].slice(0, 8);
    this.changed(true);
    return entry;
  }

  // ---------- 사망 ----------
  /** 오염 지역 사망이면 페널티를 적용하고 결과 문구를 돌려준다. */
  onDeath(contamination: number | null): string {
    const s = this.save!;
    s.stats.deaths++;
    let msg = '쓰러졌습니다. 거점에서 부활합니다.';
    if (contamination !== null) {
      const r = applyDeathPenalty(s.enhance, contamination, Math.random(), CFG.deathPenalty);
      this.keepHpRatio(() => (s.enhance[r.part] = r.to));
      msg =
        r.from === r.to
          ? `쓰러졌습니다. (${this.partName(r.part)} 강화 수치가 0이라 손실 없음)`
          : `쓰러졌습니다. 오염으로 ${this.partName(r.part)} 강화 수치 ${r.from} → ${r.to} (−${(r.pct * 100).toFixed(1)}%)`;
    } else if (this.rt.location === 'tower') {
      msg = '탑에서 쓰러졌습니다. 강화 수치 손실 없이 거점에서 부활합니다.';
    }
    this.rt.hp = this.stats.maxHp;
    this.changed(true);
    return msg;
  }

  // ---------- 퀘스트 ----------
  get questList(): QuestDef[] {
    return DATA.quests[this.faction].quests;
  }

  get currentQuest(): QuestDef | undefined {
    return this.questList[this.save!.quest.index];
  }

  questStatus() {
    const q = this.currentQuest;
    const s = this.save!;
    if (!q) return null;
    const p = questProgress(q, s.quest.progress, { enhance: s.enhance, highestCleared: s.tower.highestCleared });
    return { quest: q, accepted: s.quest.accepted, ...p, complete: s.quest.accepted && p.current >= p.goal };
  }

  questEvent(ev: QuestEvent, emit = true) {
    const s = this.save!;
    const q = this.currentQuest;
    if (!q || !s.quest.accepted) return;
    const next = applyQuestEvent(q, s.quest.progress, ev);
    if (next !== s.quest.progress) {
      s.quest.progress = next;
      const st = this.questStatus();
      if (st?.complete) this.toast(`퀘스트 목표 달성: ${q.title} — 거점 NPC에게 보고하세요`, '#ffd166');
      if (emit) this.changed(true);
    }
  }

  questAccept() {
    const s = this.save!;
    if (!this.currentQuest || s.quest.accepted) return;
    s.quest.accepted = true;
    s.quest.progress = 0;
    this.dialog = this.currentQuest.start;
    this.changed(true);
  }

  /** 보상을 주고 다음 퀘스트를 자동으로 수락한다. */
  questTurnIn(force = false) {
    const s = this.save!;
    const st = this.questStatus();
    if (!st || (!st.complete && !force)) return;
    const q = st.quest;
    this.addMaterials(q.rewards.materials, 'reward');
    if (CFG.factions[s.faction].canEquip) this.addItems(q.rewards.items);
    s.quest.index++;
    s.quest.progress = 0;
    s.quest.accepted = false;
    const rewardText = [
      ...q.rewards.materials.map((m) => `${this.materialName(m.part, m.grade)} ×${m.count}`),
      ...(CFG.factions[s.faction].canEquip ? q.rewards.items.map((id) => DATA.equipment.get(id)!.name) : []),
    ].join(', ');
    this.toast(`퀘스트 완료: ${q.title}`, '#ffd166');
    if (rewardText) this.toast(`보상: ${rewardText}`, '#9be38f');
    const next = this.currentQuest;
    this.dialog = force ? null : next ? `${q.end}\n\n${next.start}` : `${q.end}\n\n지금은 더 맡길 일이 없어.`;
    if (next) {
      s.quest.accepted = true;
      s.quest.progress = 0;
    }
    this.changed(true);
  }

  // ---------- 탑 ----------
  towerCleared(floor: number) {
    const s = this.save!;
    if (floor > s.tower.highestCleared) s.tower.highestCleared = floor;
    this.changed(true);
  }

  // ---------- 디버그 ----------
  debugGrantMaterials() {
    const g = CFG.debug.grantMaterials;
    const parts = g.parts === 'all' ? PART_IDS : g.parts;
    const list: MaterialDrop[] = [];
    for (const part of parts) for (const grade of g.grades) list.push({ part, grade, count: g.amount });
    this.addMaterials(list, 'debug');
    this.toast(`[디버그] 재료 지급: ${parts.length}개 부위 × ${g.grades.length}개 등급 × ${g.amount}개`, '#7fd3ff');
  }

  debugGrantEquipment() {
    this.addItems([...DATA.equipment.keys()]);
    this.toast('[디버그] 장비 전 종류 지급', '#7fd3ff');
  }

  debugSetEnhance(part: PartId | 'all', value: number) {
    const v = Math.max(0, Math.min(CFG.enhance.maxValue, Math.round(value)));
    const s = this.save!;
    this.keepHpRatio(() => {
      for (const p of part === 'all' ? PART_IDS : [part]) s.enhance[p] = v;
    });
    this.toast(`[디버그] ${part === 'all' ? '전 부위' : this.partName(part)} 강화 수치 = ${v}`, '#7fd3ff');
  }

  debugUnlockFloor(floor: number) {
    this.save!.tower.highestCleared = Math.max(0, Math.min(DATA.tower.floors.length, floor));
    this.changed(true);
    this.toast(`[디버그] 탑 ${this.save!.tower.highestCleared}층까지 클리어 처리`, '#7fd3ff');
  }

  debugSkipQuest() {
    const s = this.save!;
    if (!this.currentQuest) return;
    s.quest.accepted = true;
    this.questTurnIn(true);
  }

  /** 테스트용: 재료 총 개수 */
  materialCount(part?: PartId): number {
    const s = this.save!;
    let n = 0;
    for (const p of part ? [part] : PART_IDS) for (const g of GRADES) n += s.materials[p][g];
    return n;
  }
}

export const store = new Store();
