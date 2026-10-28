# 타워 브레이크 (가제) — 0단계 1인 테스트 버전

픽셀 아트 쿼터뷰 MMORPG의 핵심 루프(사냥·퀘스트 → 재료 획득 → 부위 강화 → 더 강한 지역과 탑 도전)를 서버 없이 브라우저 혼자서 검증하는 버전이다. 기획 기준은 [PRD.md](PRD.md), 작업 지시와 확정 규칙은 [docs/stage0-spec.md](docs/stage0-spec.md)에 있다.

## 실행 방법

필요한 것: Node.js 20 이상, pnpm 9 이상.

```bash
pnpm install        # 의존성 설치
pnpm dev            # 개발 서버 → http://localhost:5173
```

- **모바일에서 접속**: 같은 와이파이에서 개발 서버 실행 시 터미널에 나오는 `Network:` 주소(예: `http://192.168.0.10:5173`)로 접속한다. 가로 화면을 권장한다.
- **배포용 빌드**: `pnpm build` 후 `pnpm preview` (결과물은 `apps/client/dist`, 정적 파일이라 아무 웹 호스팅에 올리면 된다).

### 테스트

```bash
pnpm test           # 규칙 단위 테스트 (강화·사망 페널티·스탯·드롭·퀘스트·세이브, 47개)
pnpm typecheck      # 타입 검사
pnpm dev            # (다른 터미널에서 켜 둔 상태로)
pnpm smoke          # 브라우저 자동 테스트 M1~M5 (로컬 Chrome/Edge 사용, 결과와 스크린샷은 .smoke/)
node scripts/smoke.mjs m3   # 마일스톤 하나만
```

브라우저 자동 테스트는 설치된 Chrome 또는 Edge를 찾아 쓴다. 다른 위치에 있으면 `CHROME_PATH` 환경 변수로 지정한다.

## 조작

| 동작 | PC | 모바일 웹 |
| --- | --- | --- |
| 이동 | WASD / 방향키 | 왼쪽 가상 조이스틱 |
| 공격 | 마우스 왼쪽 클릭(조준) 또는 스페이스(가까운 적 자동 조준) | 오른쪽 공격 버튼(자동 조준), 화면 터치 |
| 상호작용 (NPC 대화, 탑 입장·나가기) | E | 대화·입장 버튼 |
| 인벤토리 / 퀘스트 / 장비(메카닉) | I / J / U | 상단 버튼 |
| 디버그 메뉴 | F1 또는 ` | 상단 디버그 버튼 |
| 창 닫기 | Esc | ✕ 또는 바깥 터치 |

강화는 자기 세력 거점의 NPC에게 말을 건 뒤 "강화" 버튼으로 진행한다.

## 구조

```
packages/shared/      게임 규칙과 데이터 (화면 코드와 무관, 2단계 서버가 그대로 재사용)
  data/*.json         ★ 코드 수정 없이 조정하는 게임 데이터
  src/schema          zod 스키마 — 데이터 형식이 틀리면 실행 시 어느 파일·항목인지 오류로 알려 줌
  src/rules           강화, 사망 페널티, 스탯, 드롭, 퀘스트 규칙 (순수 함수)
  src/save            세이브 형식과 버전 마이그레이션
  test/               Vitest 단위 테스트
apps/client/          Phaser 3 + Preact 클라이언트
  src/gfx             코드로 그리는 픽셀 그래픽 (외부 이미지 없음)
  src/level           월드 맵 생성, 탑 층(경기장·미로)과 미션
  src/scenes          플레이 씬 (전투, 몬스터 AI, 투사체)
  src/ui              HUD, 강화·장비·인벤토리·퀘스트·탑·디버그 창, 모바일 조작
scripts/smoke.mjs     브라우저 자동 테스트
```

저장은 브라우저 IndexedDB(`tower-break-save` 키)에 자동으로 된다. 처음부터 하려면 타이틀에서 세력을 다시 고르거나 디버그 메뉴의 "세이브 삭제"를 쓴다.

## 조정 가능한 값 (`packages/shared/data/`)

파일을 고치고 새로고침하면 바로 반영된다. 형식이 틀리거나 없는 몬스터·장비·지점을 참조하면 시작 시 오류로 알려 준다.

### config.json — 전역 설정

| 항목 | 기본값 | 설명 |
| --- | --- | --- |
| `display.baseHeight` | 360 | 내부 해상도 세로 |
| `display.minWidth` / `maxWidth` | 480 / 800 | 화면 비율에 따라 넓어지는 가로 범위 |
| `display.tileWidth` / `tileHeight` | 32 / 16 | 아이소메트릭 타일 크기 |
| `player.baseHp` / `baseAtk` / `baseDef` | 100 / 10 / 0 | 강화 0일 때 스탯 |
| `player.baseCrit` / `critMultiplier` | 0.05 / 1.6 | 치명타 확률·배율 |
| `player.baseMoveSpeed` | 4.0 | 이동 속도 (타일/초) |
| `player.invulnAfterHit` | 0.4 | 피격 후 무적 시간(초) |
| `player.baseRegenPerSec` | 30 | 거점(안전지대) 체력 회복/초 |
| `player.outOfCombatDelay` / `outOfCombatRegenPct` | 5 / 0.02 | 필드에서 전투 이탈 후 회복 시작(초)·초당 최대 체력 비율 |
| `factions.*.attackInterval` | 메카닉 0.45 / 유전공학 0.38 | 공격 간격(초) |
| `factions.*.range` | 7 / 1.7 | 사거리(타일) |
| `factions.genetic.arcDeg` | 140 | 근접 공격 부채꼴 각도 |
| `factions.mechanic.projectileSpeed` | 14 | 투사체 속도 |
| `factions.*.damageMultiplier` | 1.0 / 1.35 | 세력별 피해 배율 (근접 위험 보상) |
| `enhance.pointsPerStage` | 20 | 레벨 구간 1단계당 강화 수치 |
| `enhance.maxValue` | 1000 | 최대 강화 수치 (50구간) |
| `enhance.breakpointEvery` | 50 | 건너뛸 수 없는 돌파 지점 간격 |
| `enhance.gain` | 일반 1 / 고급 2 / 희귀 3 / 전설 5 | 등급별 상승량 |
| `enhance.bands` | 0구간 95% −1, 10구간 80% −2, 20구간 60% −3, 30구간 40% −5, 40구간 20% −8 | 구간별 성공 확률과 돌파 실패 하락 |
| `enhance.rateBonusMultiplier` | 1.0 | 확률 보너스 배율 (탑 브레이크 보상 1.1용) |
| `enhance.rateCap` | 0.99 | 보너스 적용 후 확률 상한 |
| `deathPenalty.minPct` / `maxPct` | 0.01 / 0.05 | 오염 농도 0~1에 비례하는 사망 시 감소율 |
| `combat.defenseConstant` | 100 | 피해 = 공격력 × K / (K + 방어력) |
| `combat.knockback` | 0.35 | 소형·중형 넉백 거리 |
| `combat.monsterLeashRange` | 14 | 몬스터가 집에서 이 거리 이상 쫓아오면 복귀 |
| `save.autosaveSeconds` | 5 | 위치 자동 저장 주기 |
| `debug.enabled` | true | false면 디버그 메뉴 전체 비활성 |
| `debug.showButton` | true | 화면 상단 디버그 버튼 표시 |
| `debug.grantMaterials.amount` | 10 | 재료 지급 버튼 1회당 수량 |
| `debug.grantMaterials.parts` | `"all"` | 지급 부위 (`"all"` 또는 `["head","arm",…]`) |
| `debug.grantMaterials.grades` | 4등급 전부 | 지급 등급 목록 |
| `debug.grantEquipment` | true | 장비 전 종류 지급 버튼 표시 (메카닉) |

### parts.json — 부위

| 항목 | 설명 |
| --- | --- |
| `names.{세력}.{부위}` | 화면 표시 이름 (메카닉 무기 슬롯·방어구 슬롯 / 유전공학 손·각반·발) |
| `statsPerPoint.{세력}.{부위}` | 강화 수치 1당 스탯 증가: 머리 치명타 +0.03%p, 팔 공격력 +0.2, 몸통 최대 체력 +2, 다리 이동 속도 +0.05%, 무기 슬롯·손 공격력 +0.3 (손은 공격 속도 +0.05% 추가), 방어 부위 방어력 +0.15 |

### materials.json — 재료 등급 이름·색

### equipment.json — 메카닉 장비

`id`, `name`, `slot`(weapon/armor), `atk`, `def`, `tier`. 기본 8종(무기 4, 방어구 4). 최상위 등급은 "외계 기술" 장비.

### monsters.json — 필드 몬스터 10종

| 항목 | 설명 |
| --- | --- |
| `size` / `sizePx` | 등급(small/medium/large)과 덩치 픽셀 (PRD 크기 기준표) |
| `hp` / `atk` / `def` / `speed` | 기본 스탯 (해협은 정글의 약 1.8배) |
| `aggroRange` / `attackRange` / `attackInterval` | 인식 거리, 공격 사거리, 공격 간격 |
| `respawn` | 리스폰 시간(초). 대형 120~150초 |
| `primaryPart` | 주로 떨어뜨리는 부위 재료 (`all`은 대형: 전 부위) |
| `behavior` | `walk` 걷기, `float` 공중 부유(깊은 물 통과), `rooted` 고정(식인 거대꽃), `charge` 돌진(변이 상어) |
| `ranged` | 원거리 공격 (식인 거대꽃 독침) |

### drops.json — 드롭

| 항목 | 기본값 |
| --- | --- |
| `dropChance` | 소형 60%, 중형 80%, 대형·관리자·보스 100% |
| `dropCount` | 소형·중형 1개, 대형 4개, 관리자 3개, 보스 6개 |
| `primaryPartChance` | 70% (나머지는 무작위 부위) |
| `gradeWeights.{지역}.{등급}` | [일반, 고급, 희귀, 전설] 가중치. 정글 소형 90/10/0/0 … 탑 보스 0/0/60/40 |
| `equipmentChance` | 메카닉 장비 드롭: 중형 5%, 대형 30%, 관리자 50%, 보스 100% |
| `equipmentPool.{지역}` | 지역별 장비 후보 |

### world.json — 월드

| 항목 | 설명 |
| --- | --- |
| `regions[]` | 지역 사각형, 타일, `contamination`(정글 0.3, 해협 0.7), 거점 입구(`gate`), 장애물 밀도(`obstacle`), 장애물 없는 길(`clear`) |
| `tower` | 탑 입구 위치·상호작용 반경·탑 본체 영역 |
| `npcs` / `respawn` | 세력별 NPC 위치와 부활 위치 |
| `points[]` | 탐색 퀘스트 지점 (거대꽃 둥지, 해협 해안) |
| `spawns[]` | 몬스터 배치: 종류, 사각형 범위, 마릿수 |

### quests.json — 세력별 NPC와 퀘스트 10개

`type`별 필드: `kill`(target, count), `collect`(part, count — 처치 드롭만 집계), `explore`(point), `enhance`(part: 부위/`any`/`all`, value), `tower`(floor). 각 퀘스트에 `desc`, 수락 대사 `start`, 완료 대사 `end`, 보상 `rewards.materials`, `rewards.items`(메카닉만 받음).

### tower.json — 탑 1~10층

| 항목 | 설명 |
| --- | --- |
| `theme` | 층 테마 이름 |
| `monsterScale` | 하수인 스탯 배율 (1.1 ~ 1.9) |
| `manager` | 관리자 이름, 덩치, 스탯, `pattern`(shooter 3방향 탄, charger 돌진, summoner 하수인 소환, boss 전방위 탄막+돌진+소환, 체력 50% 이하 강화), 색 |
| `mission.type = hunt` | `waves`: 웨이브별 몬스터 → 전멸 후 관리자 등장 |
| `mission.type = maze` | `cellsW`·`cellsH` 미로 크기, `timeLimit` 제한 시간, `seed`, 배치 몬스터. 관리자의 방(남동쪽 끝)에 도달하면 시간이 멈추고 관리자전 |
| `mission.type = quest` | `objective`: `destroy`(파괴할 오브젝트 수·체력) 또는 `collect`(수집 결정 수), 주기적 하수인 `spawnInterval`·`maxAlive` → 완료 후 관리자 등장 |
| `mission.type = boss` | `summon`: 보스가 소환하는 하수인 |

## 디버그 메뉴 (테스트용)

재료 지급(config의 `debug.grantMaterials` 설정대로), 장비 전 종류 지급, 강화 수치 설정(부위별/전체), 탑 층 해금, 퀘스트 건너뛰기(보상 포함), 순간이동(거점·정글·둥지·탑 입구·해협·상어 서식지), 체력 회복, 주변 적 처치, 세이브 삭제.

## 이번 버전에서 만들지 않은 것

서버, 계정, 멀티플레이, PvP, 파티, 채팅·거래, 탑 11층 이상, 탑 브레이크, 필드 자동 전투, 화산지대·혹한지대, 수익화.

## 알려진 제약

- 몬스터에 경로 탐색이 없어 직선으로 쫓아온다. 나무·기둥 뒤에 걸릴 수 있다(미궁 관리자는 자기 방 안에서만 움직이도록 제한).
- 그래픽은 모두 코드로 그린 임시 픽셀 그래픽이며, 애니메이션은 2프레임이다. 사운드는 없다.
- 탑 미션 진행 중 새로고침하면 그 층은 처음부터 다시 도전한다(클리어한 층 기록은 유지).
