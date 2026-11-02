"""이 폴더의 스킬을 Claude Code 개인 스킬 폴더(~/.claude/skills)에 설치한다.

사용법:
    python -I skills/install.py            # 전부 설치
    python -I skills/install.py submit-check evidence-capture   # 골라서 설치
    python -I skills/install.py --check    # 설치본이 이 저장소와 같은지만 확인

- 설치하면 모든 프로젝트의 Claude Code에서 스킬이 발동한다.
- 이미 설치된 스킬은 덮어쓴다(스킬 폴더 단위로 지우고 다시 복사). 다른 스킬은 건드리지 않는다.
- 스킬을 고친 뒤에는 다시 실행해야 설치본에 반영된다. --check로 차이를 확인할 수 있다.
"""
import argparse
import filecmp
import shutil
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

SRC = Path(__file__).resolve().parent
DEST = Path.home() / ".claude" / "skills"
IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc")


def skills():
    return sorted(p.name for p in SRC.iterdir() if (p / "SKILL.md").is_file())


def same(a, b):
    cmp = filecmp.dircmp(a, b, ignore=["__pycache__"])
    if cmp.left_only or cmp.right_only or cmp.diff_files or cmp.funny_files:
        return False
    _, mismatch, errors = filecmp.cmpfiles(a, b, cmp.common_files, shallow=False)
    return not mismatch and not errors and all(
        same(a / d, b / d) for d in cmp.common_dirs)


def main():
    ap = argparse.ArgumentParser(description="스킬을 ~/.claude/skills에 설치")
    ap.add_argument("names", nargs="*", help="설치할 스킬 이름 (없으면 전부)")
    ap.add_argument("--check", action="store_true", help="설치하지 않고 차이만 확인")
    a = ap.parse_args()

    names = a.names or skills()
    unknown = [n for n in names if n not in skills()]
    if unknown:
        print(f"오류: 없는 스킬: {', '.join(unknown)} (있는 스킬: {', '.join(skills())})", file=sys.stderr)
        return 1

    differ = 0
    for name in names:
        src, dest = SRC / name, DEST / name
        if a.check:
            state = "같음" if dest.is_dir() and same(src, dest) else ("다름" if dest.is_dir() else "설치 안 됨")
            differ += state != "같음"
            print(f"[{state}] {name}")
            continue
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest, ignore=IGNORE)
        print(f"[설치] {name} → {dest}")

    if a.check:
        print("\n모두 최신입니다." if not differ else "\n다시 설치하려면: python -I skills/install.py")
        return 1 if differ else 0
    print("\n새 Claude Code 대화부터 발동합니다. 이미 열린 대화에는 바로 나타나지 않을 수 있습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
