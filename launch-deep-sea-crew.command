#!/bin/bash
# Deep Sea Crew — one-click host launcher (macOS).
# Double-click this file to build the latest client, start the server, and open the game.
# Close this Terminal window (or press Ctrl-C) to stop hosting.

export PATH="/Users/harry/.local/node/current/bin:$PATH"
cd "$(dirname "$0")" || exit 1

echo "🌊 Deep Sea Crew — starting up…"
echo "   Building the latest client (first run takes a moment)…"
npm install >/dev/null 2>&1
npm run build:client || { echo "Build failed. See messages above."; read -r -p "Press Enter to close."; exit 1; }

echo ""
echo "🌊 Starting the server. Phones: open the 'On Wi-Fi' URL printed below."
echo "   This window must stay open while you play. Close it to stop."
echo ""

# Open the host's own browser shortly after the server starts.
( sleep 2 && open "http://localhost:3000" ) >/dev/null 2>&1 &

npm start -w @dsc/server
