# Deep Sea Crew 🌊🤿

A **cooperative, hidden-hand, trick-taking** card game for mobile — play locally with
friends over the same Wi-Fi, each on your own phone. Rules-inspired by *The Crew: Mission
Deep Sea* (original implementation, art, and missions).

## Status
Early development, built in progressive cycles — see [DEVLOG.md](./DEVLOG.md).
Currently: the shared game **engine** (deck, dealing, trick resolution) with tests.

## Tech stack
- **`shared/`** — pure-TypeScript game engine + types (the rules), fully unit-tested.
- **`server/`** — Node + Express + Socket.IO LAN host *(coming Cycle 3)*.
- **`client/`** — Vite + React mobile-first UI *(coming Cycle 4)*.

## Prerequisites
Node.js 24 LTS. This repo was developed with Node installed to a local prefix at
`~/.local/node/current`. If `node` isn't on your PATH, prefix commands with:

```sh
export PATH="$HOME/.local/node/current/bin:$PATH"
```

## Develop
```sh
npm install        # install workspace dependencies
npm test           # run the engine test suite (Vitest)
npm run typecheck  # strict TypeScript check
```

## How to play (planned)
1. One device runs the server (`npm run dev` — Cycle 3+).
2. Each player opens `http://<host-lan-ip>:<port>` in their phone browser on the same Wi-Fi.
3. Enter a name, join with the room code, and dive.
