# 내가 실제로 쓰는 Claude Code 스킬

과제를 하면서 AI에게 매번 반복해서 시키던 일 세 가지를 스킬로 만들었습니다.
모두 2026-11-02 todo 과제(7-1 Subquest)를 제출하며 실제로 겪은 불편에서 나왔습니다.

| 스킬 | 이럴 때 한마디로 | 하는 일 | 왜 만들었나 |
|---|---|---|---|
| [submit-check](submit-check/) | "제출 전 점검해 줘" | 문서 링크가 git에 있는지, 비밀값·이미지 위치 정보, 맨 위 목록, 푸시 상태를 스크립트로 점검 | 스킬 파일이 `.gitignore`에 걸려 저장소에 빠진 채 제출할 뻔함 |
| [evidence-capture](evidence-capture/) | "캡처 찍어 줘" | 실제 실행 결과를 HTML로 다시 그려 PNG로 저장, 높이 자동, 제출 문서 표에 추가 | 캡처마다 스타일을 다시 찾고, 높이가 잘려 다시 찍음 |
| [assignment-wrapup](assignment-wrapup/) | "과제 정리해 줘" | 맨 위 README 표에 한 줄, 진행 과정·회고는 과제 폴더 README에 | 회고가 맨 위 README에 쌓여 목록이 안 보였음 |

세 스킬은 한 흐름으로 이어집니다: **캡처 만들기 → 과제 정리 → 제출 전 점검 → 커밋·PR**.

## 설치

Claude Code는 `.claude/skills/<스킬 이름>/SKILL.md`를 스킬로 읽습니다. 이 폴더(`skills/`)가 원본이고, 설치 스크립트가 개인 스킬 폴더 `~/.claude/skills/`로 복사합니다. 개인 스킬 폴더에 두면 **모든 프로젝트**에서 발동합니다.

```bash
python -I skills/install.py            # 전부 설치 (이미 있으면 덮어씀)
python -I skills/install.py --check    # 설치본이 이 저장소와 같은지 확인
```

- 스킬을 고친 뒤에는 다시 설치해야 반영됩니다. `--check`가 "다름"을 알려 줍니다.
- 한 프로젝트에서만 쓰려면 스킬 폴더를 그 프로젝트의 `.claude/skills/` 아래로 복사해도 됩니다.
- 스크립트는 Python 3.9 이상(표준 라이브러리만), `evidence-capture`는 Chrome이나 Edge가 필요합니다.

## 발동 시험

다른 대화(새 Claude Code 세션)에서 스킬 이름 없이 한마디로 요청해 스킬이 불리는지 확인했습니다. 결과는 [TRIGGER-TEST.md](TRIGGER-TEST.md)에 있습니다.
