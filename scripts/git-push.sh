#!/bin/bash
# Load GitHub token from Hermes env, set remote, push.
set -e
cd "$(dirname "$0")"
if [ -z "$GITHUB_TOKEN" ]; then
  set -a
  # shellcheck disable=SC1091
  source ~/.hermes/.env 2>/dev/null || true
  set +a
fi
git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/zcuss/z-store.git"
git add -A
if git diff --cached --quiet; then
  echo "no changes"
  exit 0
fi
MSG="${1:-update}"
git commit -q -m "$MSG"
git push -f origin master:main 2>&1 | tail -5
