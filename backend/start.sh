#!/bin/bash
export PATH="$HOME/.local/nodejs/bin:$PATH"
cd "$HOME/shop-app" || exit 1
pkill -9 -f "shop-app/server.js" 2>/dev/null
sleep 1
nohup "$HOME/.local/nodejs/bin/node" server.js > app.log 2>&1 &
disown
sleep 3
PID=$(pgrep -f "shop-app/server.js")
echo "PID: $PID"
[ -n "$PID" ] && echo "✓ running" || echo "✗ failed"
tail -5 app.log
