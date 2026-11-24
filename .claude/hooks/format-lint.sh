#!/bin/sh
# PostToolUse hook (Edit|Write): prettier + eslint --fix on the edited file.
# Exit 2 with eslint output on stderr when unfixable problems remain.
cd "$CLAUDE_PROJECT_DIR" || exit 0

file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input.file_path??"")}catch{}})')

[ -n "$file" ] && [ -f "$file" ] || exit 0

case "$file" in
  "$CLAUDE_PROJECT_DIR"/dist/* | "$CLAUDE_PROJECT_DIR"/coverage/* | "$CLAUDE_PROJECT_DIR"/node_modules/* | "$CLAUDE_PROJECT_DIR"/.claude/*) exit 0 ;;
  "$CLAUDE_PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

case "$file" in
  *.ts | *.js | *.mjs)
    npx --no-install prettier --write "$file" >/dev/null 2>&1
    if ! out=$(npx --no-install eslint --fix --max-warnings 0 "$file" 2>&1); then
      printf '%s\n' "$out" >&2
      exit 2
    fi
    ;;
  *.json | *.html | *.md)
    npx --no-install prettier --write "$file" >/dev/null 2>&1
    ;;
esac
exit 0
