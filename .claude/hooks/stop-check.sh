#!/bin/sh
# Stop hook: block finishing while typecheck or tests fail. Reports all failures in one block.
cd "$CLAUDE_PROJECT_DIR" || exit 0

active=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).stop_hook_active===true))}catch{process.stdout.write("false")}})')
[ "$active" = "true" ] && exit 0

# Nothing changed outside .claude and docs: skip.
[ -z "$(git status --porcelain -- . ':!.claude' ':!*.md')" ] && exit 0

failed=0
if ! out=$(npm run --silent typecheck 2>&1); then
  printf '== typecheck failed ==\n%s\n' "$out" >&2
  failed=1
fi
if ! out=$(npm test --silent -- --coverage.reporter=text-summary 2>&1); then
  printf '== tests failed ==\n%s\n' "$out" | tail -n 120 >&2
  failed=1
fi
[ "$failed" = "1" ] && exit 2
exit 0
