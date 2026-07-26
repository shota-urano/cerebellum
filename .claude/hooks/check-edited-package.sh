#!/bin/bash
# PostToolUse(Edit|Write) hook — 編集ファイルの属するパッケージだけを検査する
# （モノレポで全パッケージ検査は重いため。project-bootstrap 3-monorepo §4 の読み替え）
# stdin: Claude Code の hook JSON（tool_input.file_path を見る）
set -u
input=$(cat)
path=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("file_path", ""))
except Exception:
    pass' 2>/dev/null)
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$path" in
  "$root"/web/*)    exec make -C "$root/web" typecheck ;;
  "$root"/server/*) cd "$root/server" && exec cargo check --quiet ;;
esac
exit 0
