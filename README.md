# Deep Sea Crew 🌊🤿

A **cooperative, hidden-hand, trick-taking** card game for mobile. Play locally with
friends over the same Wi-Fi — each diver on their own phone, no internet needed. The whole
crew wins or loses together. Rules-inspired by *The Crew: Mission Deep Sea* (this is an
original implementation with its own engine, art, missions, and naming).

## Status
Playable. Built in progressive Plan→Develop→Check cycles — see [DEVLOG.md](./DEVLOG.md).
Visual system: [STYLEGUIDE.md](./STYLEGUIDE.md). **63 automated tests** cover the engine,
rooms, persistence, leaderboard, sonar, mission generation, and a full game over Socket.IO.

## How to play (hosting a game)
1. **Start the server** on one computer (the host):
   ```sh
   export PATH="$HOME/.local/node/current/bin:$PATH"   # if node isn't on your PATH
   cd deep-sea-crew
   npm install        # first time only
   npm run play       # builds the client and starts the server on :3000
   ```
   The console prints a Wi-Fi URL, e.g. `http://192.168.1.16:3000`.
2. **On each phone** (same Wi-Fi), open that URL in a browser.
3. One player taps **Create a crew** (enter a diver name; optionally a crew name to save
   progress), shares the 4-letter **room code**; everyone else taps **Join with a code**.
4. Host taps **Begin Mission**. 2–5 players.

Tap **How to play** on the home screen for the in-app rules + suit legend.

## Gameplay summary
- 40 cards: 4 colours ×1–9 (Current/Kelp/Coral/Sand) + 4 Submarines (1–4, trump).
- Each trick: follow the led colour if you can; highest Sub wins, else highest of the led
  colour; winner leads next.
- **Tasks**: a task is done when its owner wins the trick containing that card. Wrong
  capture = instant mission fail. Ordering badges: ▸ relative order, ① absolute position,
  Ω must-be-last.
- **Sonar** (📡, once per mission, between tricks): reveal one colour card as your
  highest / only / lowest of that colour. No other talk about your hand.
- **Controls** (host): Pause / Resume / End, plus Next-mission or Retry after each game.
- **Progress** saves per crew name; missions get harder each level. **Leaderboard** ranks
  crews by missions cleared.

## Architecture
Monorepo with npm workspaces, TypeScript throughout, one shared rules engine reused by
server and client.

```
deep-sea-crew/
  shared/   # pure-TS game engine + types (the rules) — fully unit-tested
            #   cards, deal, trick, tasks, game state machine, missions,
            #   sonar, view projection, protocol, leaderboard
  server/   # Express + Socket.IO LAN host; RoomManager; CampaignStore (JSON);
            #   per-seat private state projection; /api/leaderboard
  client/   # Vite + React mobile-first UI (ocean theme)
  data/     # campaigns/*.json + leaderboard (gitignored)
  scripts/run-server.sh   # launches server with local Node on PATH
```

## Developer commands
```sh
npm test               # run all Vitest suites (engine + server + integration)
npm run test:watch     # watch mode
npm run typecheck      # strict tsc for shared + server
npm run typecheck:client
npm run build:client   # production client build into client/dist
npm run dev:server     # server with tsx watch (serves built client + sockets)
npm run dev:client     # Vite dev server (proxies /socket.io + /api to :3000)
npm run play           # build client + start server (the "just play" command)
```
For live UI development, run `npm run dev:server` and `npm run dev:client` in two
terminals and open the Vite URL; Socket.IO/REST are proxied to the server.

## Node setup
Developed with **Node 24 LTS** installed to a local prefix at `~/.local/node/current`
(no system install / sudo). If `node` isn't found, prefix commands with:
```sh
export PATH="$HOME/.local/node/current/bin:$PATH"
```

## Known limitations / backlog
- **No mid-game reconnect**: if a player drops during a game, their seat stays empty and
  it's their turn the game waits. The host can **End** (progress is saved) and re-deal the
  mission. Host role auto-transfers if the host drops. (Reconnect-by-id is a planned add.)
- Distress signal and special mission complications (comms-off, etc.) not yet implemented.
- AI/bot crewmates are a planned optional cycle (the engine is already bot-agnostic).
- Per-player task *selection* in the lobby is auto-assigned for now.
- Dev-toolchain only: see DEVLOG for npm-audit handling.
