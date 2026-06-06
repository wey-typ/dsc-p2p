#!/bin/bash
# Launch the Deep Sea Crew server with the locally-installed Node on PATH.
# Used by .claude/launch.json (preview) and handy for manual runs.
export PATH="/Users/harry/.local/node/current/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
exec npm start -w @dsc/server
