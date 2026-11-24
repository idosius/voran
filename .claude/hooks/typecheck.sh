#!/bin/sh
# Stop hook: block finishing while the project has type errors.
cd "$CLAUDE_PROJECT_DIR" || exit 0

active=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).stop_hook_active===true))}catch{process.stdout.write("false")}})')
[ "$active" = "true" ] && exit 0

if ! out=$(npm run --silent typecheck 2>&1); then
  printf '%s\n' "$out" >&2
  exit 2
fi
exit 0
