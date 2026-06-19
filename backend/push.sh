#!/bin/bash
TOKEN=*** ~/tmp/gh_token.txt)
echo "Token: ${TOKEN:0:10}..."

# Clean up old .git-credentials (was directory, remove it)
rm -rf ~/.git-credentials 2>/dev/null

# Write credentials file
echo "https://${TOKEN}:x-oauth-basic@github.com" > ~/.git-credentials
chmod 600 ~/.git-credentials
echo "Credentials written"

git config --global credential.helper store
git config --global user.email "zcusgt@gmail.com"
git config --global user.name "Z Store Dev"

cd ~/z-store
git remote remove origin 2>/dev/null
git remote add origin "https://${TOKEN}@github.com/zcuss/z-store.git"
echo "=== Pushing ==="
git push -u origin main 2>&1
echo "=== Done, exit: $? ==="
