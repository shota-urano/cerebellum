#!/usr/bin/env python3
"""brain-dash v0 — 今日の人間タスクをローカルWebで消し込む。

- タスクの正本: second-brain/80_運用ガイド/人間のルーティン.md（読み取りのみ・編集しない）
- 消し込み状態: state/YYYY-MM-DD.json（Vaultの外。Slack✅運用とは独立の並行運用）
- 表パース・曜日判定は daily-tasks/scripts/post.py と同一仕様
- 起動: python3 server.py  →  http://localhost:3210 （Tailscale経由でスマホからも可）
"""
import hashlib
import json
import pathlib
import re
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VAULT = pathlib.Path(
    "/Users/orion/Library/CloudStorage/GoogleDrive-urano.shota@uslab.jp"
    "/マイドライブ/second-brain")
ROUTINE_MD = VAULT / "80_運用ガイド" / "人間のルーティン.md"
STATE_DIR = pathlib.Path(__file__).resolve().parent / "state"
INDEX_HTML = pathlib.Path(__file__).resolve().parent / "index.html"

PORT = 3210
WEEKDAYS = "月火水木金土日"


def parse_rows(text):
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip().replace("\\|", "|")
                 for c in re.split(r"(?<!\\)\|", line.strip("|"))]
        if len(cells) < 5 or set(cells[0]) <= set("- :") or cells[0] == "間隔":
            continue
        interval, time, effort, tool, content = cells[0], cells[1], cells[2], cells[3], cells[4]
        content = re.sub(r"<br\s*/?>", " / ", content)
        rows.append({"interval": interval, "time": time, "effort": effort,
                     "tool": tool, "content": content})
    return rows


def due_today(interval, wd):
    if "毎日" in interval:
        return True
    if "平日" in interval:
        return wd < 5
    if "週末" in interval:
        return wd >= 5
    return WEEKDAYS[wd] in interval


def task_id(row):
    key = f"{row['interval']}|{row['time']}|{row['content']}"
    return hashlib.sha1(key.encode()).hexdigest()[:12]


def state_file(date_str):
    return STATE_DIR / f"{date_str}.json"


def load_state(date_str):
    f = state_file(date_str)
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return {}


def save_state(date_str, state):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state_file(date_str).write_text(
        json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")


def today_tasks():
    now = datetime.now()
    wd = now.weekday()
    date_str = now.strftime("%Y-%m-%d")
    rows = [r for r in parse_rows(ROUTINE_MD.read_text(encoding="utf-8"))
            if due_today(r["interval"], wd)]

    def time_key(r):
        m = re.match(r"^(\d{1,2}):(\d{2})", r["time"])
        return (m is None, int(m.group(1)) * 60 + int(m.group(2)) if m else 0)

    rows.sort(key=time_key)
    state = load_state(date_str)
    tasks = []
    for r in rows:
        tid = task_id(r)
        tasks.append({**r, "id": tid, "done": bool(state.get(tid))})
    return {"date": date_str, "weekday": WEEKDAYS[wd], "tasks": tasks}


class Handler(BaseHTTPRequestHandler):

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else json.dumps(
            body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/index"):
            self._send(200, INDEX_HTML.read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/api/tasks":
            self._send(200, today_tasks())
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/toggle":
            self._send(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            req = json.loads(self.rfile.read(length))
            tid = req["id"]
        except (ValueError, KeyError):
            self._send(400, {"error": "bad request"})
            return
        date_str = datetime.now().strftime("%Y-%m-%d")
        state = load_state(date_str)
        state[tid] = not state.get(tid)
        save_state(date_str, state)
        self._send(200, today_tasks())

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    if not ROUTINE_MD.exists():
        raise SystemExit(f"NG: ルーティン表が見つからない: {ROUTINE_MD}")
    print(f"brain-dash v0: http://localhost:{PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
