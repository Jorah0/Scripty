#!/usr/bin/env bash
# Rebuilds dist/*.exe when app sources are newer than the last portable build.
# Called by the Claude Code Stop hook (.claude/settings.local.json); safe to run by hand.
cd "$(dirname "$0")/.." || exit 0
exe=$(ls -t dist/Scripty-Portable-*.exe 2>/dev/null | head -1)
lock=dist/.autobuild.lock
mkdir -p dist

# Nothing changed since the last build -> skip.
if [ -n "$exe" ] && [ -z "$(find main.js preload.js package.json src assets -newer "$exe" -type f 2>/dev/null | head -1)" ]; then
  exit 0
fi
# ponytail: mkdir lock, a stale lock (killed build) is cleared after 15 min
find "$lock" -maxdepth 0 -mmin +15 -exec rmdir {} \; 2>/dev/null
mkdir "$lock" 2>/dev/null || exit 0
trap 'rmdir "$lock"' EXIT

echo "=== $(date) autobuild start" >> dist/autobuild.log
if npm run dist >> dist/autobuild.log 2>&1; then
  echo '{"systemMessage":"Scripty .exe rebuilt (dist/)."}'
else
  echo '{"systemMessage":"Scripty .exe rebuild FAILED - see dist/autobuild.log (is Scripty running and locking the exe?)"}'
fi
