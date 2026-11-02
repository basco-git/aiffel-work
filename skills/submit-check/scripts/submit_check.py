"""과제 제출 전 점검 스크립트 (표준 라이브러리만 사용).

사용법:
    python -I submit_check.py [과제 폴더] [--base origin/main]

점검 항목:
  1. 링크: 과제 폴더의 .md 문서에 걸린 상대 경로 링크·이미지가 실제로 있고 git에 올라가 있는가,
     링크의 #앵커가 대상 문서의 제목에 있는가
  2. 비밀값: 이번에 올라갈 파일에 키·토큰·비밀번호 형태의 문자열이 있는가 (값은 출력하지 않음)
  3. 이미지: 올라갈 이미지에 EXIF·위치 정보·텍스트 메타데이터가 있는가
  4. 목록: 저장소 맨 위 README.md에 과제 폴더가 링크되어 있는가
  5. 상태: 커밋하지 않은 변경, 기준 브랜치에 아직 없는 커밋이 있는가

결과는 항목마다 통과 / 확인 필요 / 문제 로 출력하고, 문제가 하나라도 있으면 종료 코드 1.
"""
import argparse
import re
import struct
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

IMAGE_EXT = {".png", ".jpg", ".jpeg"}
TEXT_EXT = {".md", ".txt", ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".html", ".css",
            ".yml", ".yaml", ".toml", ".ini", ".cfg", ".sql", ".bat", ".ps1", ".sh", ".env"}
SKIP_DIRS = {"node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next"}

# 이름만 보고 판단한다. 찾은 값은 절대 출력하지 않는다.
SECRET_PATTERNS = [
    ("Supabase secret 키", re.compile(r"sb_secret_[A-Za-z0-9_\-]{10,}")),
    ("JWT 토큰(service_role 등)", re.compile(r"eyJ[A-Za-z0-9_\-]{15,}\.eyJ[A-Za-z0-9_\-]{15,}\.[A-Za-z0-9_\-]{10,}")),
    ("Anthropic API 키", re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("OpenAI API 키", re.compile(r"sk-(?:proj-)?[A-Za-z0-9]{32,}")),
    ("GitHub 토큰", re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}")),
    ("AWS 액세스 키", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("개인 키 블록", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("비밀번호 값 대입", re.compile(r"(?i)\b(password|passwd|secret|api_key|apikey)\s*[:=]\s*['\"][^'\"\s]{6,}['\"]")),
]

LINK_RE = re.compile(r"!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+\"[^\"]*\")?\s*\)")
HTML_SRC_RE = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""")


def git(*args, cwd):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    return r.stdout.strip() if r.returncode == 0 else None


def rel(p, root):
    try:
        return p.resolve().relative_to(root).as_posix()
    except ValueError:
        return str(p)


def md_files(target):
    for p in target.rglob("*.md"):
        if not any(part in SKIP_DIRS for part in p.parts):
            yield p


def github_slug(heading):
    """GitHub이 제목에 붙이는 앵커 이름을 흉내 낸다 (예: '8. 스킬 만들기' → '8-스킬-만들기')."""
    h = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", heading)       # 링크는 글자만 남김
    h = re.sub(r"<[^>]+>", "", h).strip().lower()                # HTML 태그 제거
    h = "".join(c for c in h if c.isalnum() or c in "-_ ")       # 문장부호·기호 제거 (한글은 남음)
    return h.replace(" ", "-")


def md_anchors(md, cache={}):
    """문서의 제목 앵커 목록. 같은 제목이 또 나오면 GitHub처럼 -1, -2를 붙인다."""
    if md not in cache:
        text = re.sub(r"```.*?```", "", md.read_text(encoding="utf-8", errors="replace"), flags=re.S)
        seen, found = {}, set(re.findall(r"""(?:id|name)\s*=\s*["']([^"']+)["']""", text))
        for m in re.finditer(r"^#{1,6}\s+(.+?)\s*#*\s*$", text, flags=re.M):
            s = github_slug(m.group(1))
            found.add(f"{s}-{seen[s]}" if s in seen else s)
            seen[s] = seen.get(s, 0) + 1
        cache[md] = found
    return cache[md]


def links_in(md):
    text = md.read_text(encoding="utf-8", errors="replace")
    text = re.sub(r"```.*?```", "", text, flags=re.S)            # 코드 블록 안 예시는 빼고 본다
    text = re.sub(r"`[^`\n]*`", "", text)                        # `인라인 코드` 안 예시도 뺀다
    return [m.group(1).strip("<>") for m in LINK_RE.finditer(text)] + HTML_SRC_RE.findall(text)


def anchor_problem(md, link, root):
    """링크의 #앵커가 대상 .md 문서의 제목에 없으면 문제 문장을 돌려준다."""
    if "#" not in link:
        return None
    path, frag = link.split("#", 1)
    dest = (md.parent / unquote(path.split("?")[0])).resolve() if path else md.resolve()
    if dest.is_dir():
        dest = dest / "README.md"
    frag = unquote(frag).lower()
    if not frag or dest.suffix.lower() != ".md" or not dest.is_file():
        return None                                              # 코드 파일 줄 번호(#L10) 등은 보지 않음
    if frag in md_anchors(dest):
        return None
    return f"없는 제목 앵커: {rel(md, root)} → {link}"


def check_links(target, root, tracked):
    problems, n = [], 0
    for md in md_files(target):
        for link in links_in(md):
            if re.match(r"^[a-z][a-z0-9+.\-]*:", link, re.I):
                continue                                         # http, mailto
            bad = anchor_problem(md, link, root)
            if bad:
                problems.append(("문제", bad))
            path = unquote(link.split("#")[0].split("?")[0])
            if not path:
                continue
            n += 1
            dest = (md.parent / path).resolve()
            where = f"{rel(md, root)} → {link}"
            if not dest.exists():
                problems.append(("문제", f"없는 파일: {where}"))
            elif rel(dest, root) in tracked or (
                    dest.is_dir() and any(t.startswith(rel(dest, root) + "/") for t in tracked)):
                continue
            elif git("check-ignore", "-q", rel(dest, root), cwd=root) is not None:
                problems.append(("문제", f".gitignore에 걸려 올라가지 않음: {where}"))
            else:
                problems.append(("확인 필요", f"아직 git add 안 함(커밋하면 해결): {where}"))
    return n, problems


def files_to_publish(root, base):
    names = set()
    for args in (["diff", "--name-only", f"{base}...HEAD"], ["diff", "--name-only", "HEAD"],
                 ["ls-files", "--others", "--exclude-standard"]):
        out = git(*args, cwd=root)
        if out:
            names.update(out.splitlines())
    return sorted(n for n in names if (root / n).is_file())


def check_secrets(files, root):
    problems = []
    for name in files:
        p = root / name
        if p.name == ".env" or (p.name.startswith(".env.") and p.name != ".env.example"):
            problems.append(("문제", f"비밀값 파일이 올라갈 목록에 있음: {name}"))
            continue
        if p.suffix.lower() not in TEXT_EXT or p.stat().st_size > 2_000_000:
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        for label, pat in SECRET_PATTERNS:
            for m in pat.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                problems.append(("문제", f"{label} 형태의 값: {name}:{line} (값은 출력하지 않음)"))
    return problems


def png_meta(data):
    found, i = [], 8
    while i + 8 <= len(data):
        n = struct.unpack(">I", data[i:i + 4])[0]
        kind = data[i + 4:i + 8].decode("latin1")
        if kind == "eXIf":
            found.append("EXIF")
        elif kind in ("tEXt", "iTXt", "zTXt"):
            key = data[i + 8:i + 8 + min(n, 80)].split(b"\0")[0].decode("latin1", "replace")
            found.append(f"텍스트({key})")
        i += 12 + n
    return found


def jpeg_meta(data):
    found, i = [], 2
    while i + 4 <= len(data) and data[i] == 0xFF:
        marker = data[i + 1]
        if marker in (0xDA, 0xD9):
            break
        n = struct.unpack(">H", data[i + 2:i + 4])[0]
        seg = data[i + 4:i + 2 + n]
        if marker == 0xE1 and seg.startswith(b"Exif"):
            gps = b"\x88\x25" in seg or b"\x25\x88" in seg
            found.append("EXIF(위치 정보 있음)" if gps else "EXIF")
        i += 2 + n
    return found


def check_images(files, root):
    problems = []
    for name in files:
        p = root / name
        ext = p.suffix.lower()
        if ext not in IMAGE_EXT:
            continue
        data = p.read_bytes()
        meta = png_meta(data) if ext == ".png" else jpeg_meta(data)
        if any("위치" in m for m in meta):
            problems.append(("문제", f"{name}: {', '.join(meta)}"))
        elif meta:
            problems.append(("확인 필요", f"{name}: {', '.join(meta)} — 개인정보가 없는지 확인"))
    return problems


def check_root_readme(target, root):
    if target == root:
        return []
    readme = root / "README.md"
    if not readme.exists():
        return [("문제", "저장소 맨 위에 README.md가 없음")]
    text = unquote(readme.read_text(encoding="utf-8", errors="replace"))
    name = rel(target, root)
    if not (f"({name}" in text or f"({name}/" in text or f"/{name}" in text):
        return [("문제", f"맨 위 README.md 목록에 {name} 링크가 없음")]
    # 맨 위 README에서 이 과제 폴더로 들어가는 링크의 #앵커도 확인
    out = []
    for link in links_in(readme):
        if unquote(link).startswith(name + "/") or unquote(link).startswith(name + "#"):
            bad = anchor_problem(readme, link, root)
            if bad:
                out.append(("문제", bad))
    return out


def check_state(target, root, base):
    out = []
    dirty = git("status", "--porcelain", "--", rel(target, root) if target != root else ".", cwd=root)
    if dirty:
        out.append(("확인 필요", f"커밋하지 않은 변경 {len(dirty.splitlines())}개"))
    ahead = git("rev-list", "--count", f"{base}..HEAD", cwd=root)
    if ahead and ahead != "0":
        out.append(("확인 필요", f"{base}에 아직 없는 커밋 {ahead}개 (푸시·PR 병합 필요)"))
    return out


def main():
    ap = argparse.ArgumentParser(description="과제 제출 전 점검")
    ap.add_argument("target", nargs="?", default=".", help="과제 폴더 (기본: 현재 폴더)")
    ap.add_argument("--base", default="origin/main", help="비교할 기준 브랜치 (기본: origin/main)")
    a = ap.parse_args()

    target = Path(a.target).resolve()
    top = git("rev-parse", "--show-toplevel", cwd=target)
    if not top:
        print("오류: git 저장소 안에서 실행해 주세요.", file=sys.stderr)
        return 1
    root = Path(top).resolve()
    if git("rev-parse", "--verify", "--quiet", a.base, cwd=root) is None:
        print(f"오류: 기준 브랜치 {a.base}를 찾을 수 없습니다. --base로 지정해 주세요.", file=sys.stderr)
        return 1
    tracked = set((git("ls-files", cwd=root) or "").splitlines())
    publish = [f for f in files_to_publish(root, a.base)
               if target == root or (root / f).resolve().is_relative_to(target)
               or "/" not in f]                                 # 맨 위 파일(README, .gitignore)도 포함

    n_links, link_p = check_links(target, root, tracked)
    sections = [
        ("1. 링크·이미지가 git에 있음", f"링크 {n_links}개 확인", link_p),
        ("2. 비밀값 없음", f"올라갈 파일 {len(publish)}개 검사", check_secrets(publish, root)),
        ("3. 이미지 메타데이터", "올라갈 이미지 검사", check_images(publish, root)),
        ("4. 맨 위 README 목록", "과제 폴더 링크 확인", check_root_readme(target, root)),
        ("5. 커밋·푸시 상태", f"기준: {a.base}", check_state(target, root, a.base)),
    ]

    print(f"제출 전 점검: {rel(target, root) if target != root else '(저장소 전체)'}\n")
    worst = 0
    for title, scope, items in sections:
        if not items:
            print(f"[통과] {title} — {scope}")
            continue
        level = "문제" if any(k == "문제" for k, _ in items) else "확인 필요"
        worst = max(worst, 2 if level == "문제" else 1)
        print(f"[{level}] {title} — {scope}")
        for kind, msg in items:
            print(f"    - ({kind}) {msg}")
    print("\n결과:", {0: "모두 통과", 1: "확인 필요 항목 있음", 2: "문제 있음"}[worst])
    return 1 if worst == 2 else 0


if __name__ == "__main__":
    sys.exit(main())
