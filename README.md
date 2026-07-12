# Deep Sea Crew 🌊🤿

A **cooperative, hidden-hand, trick-taking** card game for mobile. Play locally with
friends over the same Wi-Fi — each diver on their own phone, no internet needed. The whole
crew wins or loses together. Rules-inspired by *The Crew: Mission Deep Sea* (this is an
original implementation with its own engine, art, missions, and naming).

## Status
Playable. Built in progressive Plan→Develop→Check cycles — see [DEVLOG.md](./DEVLOG.md).
Visual system: [STYLEGUIDE.md](./STYLEGUIDE.md). **128 automated tests** cover the engine,
rooms, persistence, leaderboard, sonar, mission generation, bots, extension objectives,
distress signal, and a full game over Socket.IO.

## Bots
Add bot divers from the lobby to fill seats. The bot has three layers:
- **Planner** (`shared/src/planner.ts`): live deals are generated solvable, and the bots
  are seeded with the constructive winning line; they follow it and, if a human deviates,
  re-solve with the cooperative full-information solver (bounded node budget).
- **Rollout heuristic** (`chooseBotPlay`): when no plan is available, each legal card is
  evaluated by rolling the trick to completion (teammates modeled by the fast bot) and
  letting the real engine score the result — so it can win a trick with its *own* task
  card, deliver a teammate's task only when they can actually take it, and avoid dumping
  a card that hands a task to the wrong seat.
- **Fast reactive bot** (`chooseBotPlayFast`): the original rule-based bot, kept as the
  teammate model and the solver's move ordering. Its soft weights are tuned by self-play
  (`npm run train-bots`).

In bot-only self-play over *random* (not guaranteed-solvable) deals, the win rate went
from ~10% to ~57% across 2–5 players and levels 0–4; on live (solvable) deals with the
seeded line, bot crews win essentially always.

## How to play (hosting a game)

**Easiest (macOS): one-click launcher.** Double-click **`Deep Sea Crew.app`** (or
`launch-deep-sea-crew.command`) in the `deep-sea-crew` folder. It builds the latest client,
starts the server, and opens the game in your browser. Keep the Terminal window open while
playing; close it to stop. (First run: if macOS blocks an "unidentified developer",
right-click the app → **Open** once.)

1. **Or start the server manually** on one computer (the host):
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

## Play online (Render — free, no same-Wi-Fi needed)
The repo ships a [`render.yaml`](./render.yaml) blueprint. In the Render dashboard:
**New + → Blueprint → connect this repo → Apply.** Render builds the client, starts the
server, and gives you a permanent free URL like `https://deep-sea-crew.onrender.com` —
share it with anyone, anywhere; no domain needed. Free-plan trade-offs: the service
sleeps after ~15 min idle (first visitor waits ~1 min while it wakes) and the filesystem
is ephemeral, so campaign/leaderboard progress resets when it sleeps or redeploys.
`/api/lan` automatically returns the public URL in the cloud (set `PUBLIC_BASE_URL` to
override on other hosts), so invite links and QR codes work unchanged.

## Gameplay summary
- 40 cards: 4 colours ×1–9 (Current/Kelp/Coral/Sand) + 4 Submarines (1–4, trump).
- Each trick: follow the led colour if you can; highest Sub wins, else highest of the led
  colour; winner leads next.
- **Tasks**: a task is done when its owner wins the trick containing that card. Wrong
  capture = instant mission fail. Ordering badges: ▸ relative order, ① absolute position,
  Ω must-be-last.
- **Extension rules toggle**: the host can switch the ⭐ extension (objectives, distress,
  comms complications) on/off in the lobby — off gives the classic capture-only game.
- **Special objectives** (from Mission 2): alongside card tasks, missions demand feats —
  🥇 *win the first trick*, 🎯 *win exactly N tricks* (over = instant fail), 🚫 *win no
  cards of a colour*. All generated jointly-solvable with the deal.
- **Sonar** (📡, once per mission, between tricks): reveal one colour card as your
  highest / only / lowest of that colour. No other talk about your hand. Deep missions
  add **comms complications**: sonar delayed until after trick 2 (L6–7) or dead (L8+).
- **Distress signal** (🆘, host, once per mission, before the first card): every diver
  passes one card (never a submarine) left or right — a rescue for hopeless deals.
- **Deep complications** (Missions 10–12): 🌀 *Undertow* — on marked tricks the LOWEST
  card of the led colour wins and submarines sink; ⚓ *Commander's burden* — the
  commander must not win any of the first 3 tricks. Mission 12 "The Void" has both.
  The campaign now spans **12 named missions**.
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

## Reconnect
If a phone locks or Wi-Fi blips, the player can rejoin seamlessly: the device remembers a
session token and re-attaches to the same seat (hand + game state intact). Empty rooms are
kept for a 2-minute grace period before cleanup. Host role auto-transfers if the host drops.

## Known limitations / backlog
- **No join into an in-progress hand**: trick-taking deals all cards to fixed seats, so new
  players join **between missions** (in the lobby), not mid-hand. (Spectator + auto-seat-next
  is a possible add.)
- iPhone can't be the *server* (browsers can't host); use a computer or an Android phone
  (Termux) as host. Bluetooth isn't viable for browsers.
- Distress signal and special mission complications (comms-off, etc.) not yet implemented.
- Per-player task *selection* in the lobby is auto-assigned for now.
- Dev-toolchain only: see DEVLOG for npm-audit handling.
