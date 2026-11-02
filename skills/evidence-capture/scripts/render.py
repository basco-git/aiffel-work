"""HTML 확인 장면을 PNG로 만든다 (헤드리스 Chrome·Edge, 표준 라이브러리만 사용).

사용법:
    python -I render.py <장면.html> <저장할.png> [--width 960]

- 높이는 자동으로 잰다: 먼저 페이지를 열어 내용 높이를 읽고, 그 높이로 찍는다.
  (한 번에 고정 높이로 찍으면 아래가 잘리거나 빈 공간이 남는다.)
- HTML 옆의 base.css 같은 상대 경로 파일을 그대로 쓴다.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

CANDIDATES = [
    os.environ.get("CHROME_PATH", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]
MEASURE = ("<script>document.documentElement.setAttribute('data-capture-h',"
           "Math.ceil(document.documentElement.scrollHeight))</script>")


def find_browser():
    for c in CANDIDATES:
        if c and Path(c).exists():
            return c
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    return None


def run(browser, args):
    return subprocess.run([browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                           "--no-first-run", *args], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=60)


def measure_height(browser, html, width):
    text = html.read_text(encoding="utf-8")
    marked = text.replace("</body>", MEASURE + "</body>") if "</body>" in text else text + MEASURE
    # base.css 같은 상대 경로가 그대로 풀리도록 같은 폴더에 임시 파일을 만든다
    fd, tmp = tempfile.mkstemp(suffix=".html", prefix=".measure-", dir=html.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(marked)
        out = run(browser, [f"--window-size={width},200", "--dump-dom", Path(tmp).as_uri()]).stdout
    finally:
        os.remove(tmp)
    m = re.search(r'data-capture-h="(\d+)"', out)
    return int(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser(description="HTML 확인 장면을 PNG로")
    ap.add_argument("html")
    ap.add_argument("png")
    ap.add_argument("--width", type=int, default=960)
    ap.add_argument("--height", type=int, help="자동 측정 대신 쓸 높이")
    a = ap.parse_args()

    html, png = Path(a.html).resolve(), Path(a.png).resolve()
    if not html.exists():
        print(f"오류: HTML 파일이 없습니다: {html}", file=sys.stderr)
        return 1
    browser = find_browser()
    if not browser:
        print("오류: Chrome이나 Edge를 찾지 못했습니다. CHROME_PATH 환경 변수로 경로를 알려 주세요.",
              file=sys.stderr)
        return 1

    height = a.height or measure_height(browser, html, a.width)
    if not height:
        print("오류: 페이지 높이를 재지 못했습니다. --height로 직접 지정해 주세요.", file=sys.stderr)
        return 1
    png.parent.mkdir(parents=True, exist_ok=True)
    run(browser, [f"--window-size={a.width},{height}", f"--screenshot={png}", html.as_uri()])
    if not png.exists() or png.stat().st_size == 0:
        print("오류: 이미지가 만들어지지 않았습니다.", file=sys.stderr)
        return 1
    print(f"저장: {png} ({a.width}x{height}, {png.stat().st_size:,}바이트)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
