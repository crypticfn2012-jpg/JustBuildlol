#!/bin/sh
# Starts a local web server for the game and opens it in your browser (needs Python 3, built into macOS/Linux).
cd "$(dirname "$0")/../web" || exit 1
PORT=8080
( sleep 1; (open "http://localhost:$PORT/" || xdg-open "http://localhost:$PORT/") >/dev/null 2>&1 ) &
echo "Driftwood Royale is running at http://localhost:$PORT/  (Ctrl+C to stop)"
python3 -m http.server "$PORT"
