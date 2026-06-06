# Deep Sea Crew — Development Log

A cooperative trick-taking card game for mobile (LAN multiplayer), rules-inspired by
*The Crew: Mission Deep Sea*. Built in progressive **Plan → Develop → Check** cycles.

Format per cycle: **Planned / Developed / Issues found / Next steps**.

---

## Cycle 1 — Engine core + scaffolding
**Date:** 2026-06-06

### Planned (≤5 goals)
1. Install Node.js + npm; set up TypeScript + Vitest tooling.
2. Initialize the monorepo (`shared` / `server` / `client` workspaces) + git.
3. Define the engine state model & types.
4. Implement deck creation, dealing, and Commander selection.
5. Implement trick resolution + follow-suit legality, proven by unit tests.

### Developed
- Installed **Node v24.16.0 LTS / npm 11.13.0** to a local prefix
  (`~/.local/node/current`) — no Homebrew, no sudo. PATH is set inline per command
  (shell profile left untouched per environment policy).
- Monorepo root `package.json` with npm workspaces (`shared` active; `server`/`client`
  to be added in later cycles), root `tsconfig.json` (strict), Vitest.
- **`shared/` engine** (pure TS, no I/O):
  - `types.ts` — `Suit`/`ColorSuit`, `Card`, `Player`, `Play`, `Trick`, constants.
  - `rng.ts` — `mulberry32` seedable PRNG + Fisher–Yates `shuffle` (deterministic tests).
  - `cards.ts` — `createDeck()` (40 cards), `deal()` (round-robin, uneven for 3p,
    Commander = holder of sub-4), `sortHand`, `cardId`, helpers.
  - `trick.ts` — `ledSuit`, `legalMoves` (follow-suit), `isLegalPlay`, `trickWinner`
    (trump-aware), `isTrickComplete`.
  - `engine.test.ts` — **15 tests** covering deck integrity, deterministic shuffle,
    dealing/splits/validation, follow-suit legality, and trick resolution (incl. trump).

### Issues found
- **Node not installed & no Homebrew (arm64).** Resolved by downloading the official
  Node LTS tarball to a local prefix.
- **Shell-profile write denied** (can't persist PATH to `~/.zshrc`). Worked around by
  exporting PATH inline in every Node command. *Next step:* add an `npm`-script-friendly
  wrapper / document this in README so handover is smooth.

### Verification
- `npm test` → **15/15 passing**. `npm run typecheck` → clean (strict mode).

### Next steps (Cycle 2)
- Tasks model (target card per task, difficulty totals, ordering constraints).
- Full game state machine: play a card → resolve trick → evaluate task success/fail.
- Win condition (all tasks done, ordering respected) + instant-fail lose condition.
- Headless scripted-mission tests: one to success, one to failure.

---

## Cycle 2 — Tasks + win/lose state machine
**Date:** 2026-06-06

### Planned (≤5 goals)
1. Task model with the four ordering constraints (none / relative / absolute / last).
2. Mission model (objective set for one game).
3. Full game reducer: `createGame`, `legalMovesFor`, `playCard` (immutable).
4. Win (all tasks done, ordering respected) + instant-fail lose detection.
5. Headless scripted-mission tests covering success and each failure mode.

### Developed
- `tasks.ts` — `TaskConstraint` union, `MissionTask`, runtime `TaskState`,
  `completionSortKey` (resolves multiple same-trick completions in constraint order).
- `game.ts` — `Mission`, `GameState`, `createGame()` (deals + instantiates tasks),
  `legalMovesFor()`, `playCard()` (validates turn + legality, immutable via
  `structuredClone`), `resolveCompletedTrick()` with: wrong-capture fail, ordered
  completion + `checkOrdering` (absolute slot, relative sequence, last-only), stranded
  absolute-slot detection, win-on-all-done, out-of-cards fail.
- `game.test.ts` — **14 tests**: win/lose basics, trump capture, all four constraint
  kinds (pass + violation), turn enforcement, illegal/out-of-turn throws, immutability.

### Issues found
- None blocking. Note: within-trick multi-completion ordering uses a heuristic sort —
  adequate for current missions; revisit if a mission needs two ordered tasks to resolve
  in the *same* trick with conflicting requirements (rare). Logged for later.

### Verification
- `npm test` → **29/29 passing** (15 engine + 14 game). `npm run typecheck` → clean.

### Next steps (Cycle 3)
- `server/` workspace: Express static host + Socket.IO.
- Rooms with short join codes; join-with-name; lobby; start game.
- Per-seat private state projection (never leak other players' hands).

---

## Cycle 3 — Server, rooms & Socket.IO
**Date:** 2026-06-06

### Planned (≤5 goals)
1. `server/` workspace (Express + Socket.IO + tsx) wired to `@dsc/shared`.
2. Room manager: create/join with 4-char codes, names, seats, lobby.
3. Per-seat private state projection (hide other hands) — in `shared` for reuse.
4. Socket.IO event wiring: create/join/start/play/restart/leave + state broadcast.
5. Tests for room manager + projection; smoke-boot the server.

### Developed
- `shared/view.ts` — `PlayerView` + `projectForSeat()`: own hand + legal moves full,
  others reduced to `handCounts`; tasks/trick public. `shared/protocol.ts` — event
  names (`EV`), payloads, `RoomView`, MIN/MAX players. `shared/missions.ts` —
  `buildSimpleMission()` + `defaultTaskCount()` to drive early games.
- `server/rooms.ts` — `RoomManager` (in-memory): `createRoom`, `joinRoom`,
  `startGame` (deals via engine, picks commander), `play` (turn/legality via engine),
  `restart`, `disconnect` cleanup, `toRoomView`; ambiguity-free code alphabet;
  `sanitizeName`.
- `server/index.ts` — Express static host (serves `client/dist` when built) + `/health`,
  Socket.IO handlers, per-seat `GameView` push, `membership` map for routing/cleanup,
  LAN-IP banner printing the URL to open on phones.
- Tests: `server/rooms.test.ts` — **8 tests** (create/join/seats, full/unknown room,
  min-players, start+commander+private projection, out-of-turn rejection, empty-room
  cleanup, name sanitize).

### Issues found
- **npm audit: 1 critical + 4 moderate**, ALL in the dev toolchain (vitest/vite/esbuild —
  Vitest UI + Vite dev server, never exposed by us). Production runtime (express,
  socket.io) is clean. Fix = breaking vitest v4 bump. **Deferred to Cycle 10 (QA)** to
  avoid destabilizing tests mid-build.

### Verification
- `npm test` → **37/37 passing** (15 + 14 + 8). `npm run typecheck` → clean.
- Smoke boot: `/health` → `{"ok":true}`; LAN URL auto-printed (192.168.1.16).

### Next steps (Cycle 4)
- `client/` workspace (Vite + React): name/join + lobby screens.
- Responsive game board: your hand, current trick, tasks, turn indicator.
- Tap a legal card to play; win/lose screens; socket client wiring.

---

## Cycle 4 — Client UI (first playable build)
**Date:** 2026-06-06

### Planned (≤5 goals)
1. `client/` workspace (Vite + React + TS + socket.io-client); shared engine via alias.
2. Screens: Home (name + create/join code), Lobby, Game, end overlay.
3. Socket state hook (`state.tsx`) bridging server events to React.
4. Responsive ocean-themed board: player strip, tasks, trick, hand, turn banner.
5. Build the client; verify the whole pipeline end-to-end.

### Developed
- `client/` — Vite config aliasing `@dsc/shared` → TS source (Vite transpiles it),
  dev proxy for `/socket.io`. `state.tsx` (GameProvider/useGame), `App.tsx` (screen
  routing), `screens/Home|Lobby|Game`, `components/CardView|Toast`, `styles.css`
  (mobile-first ocean theme: animated background, suit-coloured cards, sticky hand,
  win/lose overlay, safe-area insets, ≥48px tap targets, ≥600px breakpoint).
- Refactored server into `gameServer.ts` (`createGameServer()` factory) + thin
  `index.ts` bootstrap — makes the socket layer testable.
- `scripts/run-server.sh` + `.claude/launch.json` to launch with local Node on PATH.

### Issues found
1. **Browser preview MCP is sandboxed away from this project path** ("Operation not
   permitted" on the dir; npm's `env node` also unavailable). Tried absolute-npm and a
   bash-wrapper launch — both blocked by the sandbox. **Pivoted** to a headless
   Socket.IO integration test for end-to-end verification (stronger + CI-friendly);
   visual check deferred to on-device / static preview panel.
2. **Integration test race (FIXED):** initial driver read whose-turn from one client's
   possibly-stale view and broke early. Fixed by selecting the actor by who actually
   holds `legalMoves`, with a tiny settle delay.
3. Vite resolving the shared engine's `.js` imports to `.ts` — **worked out of the box**
   (esbuild rewrite); no fallback needed.

### Verification
- `npm run build:client` → built (76 modules, ~61 kB gz JS). `npm run typecheck` +
  `typecheck:client` → clean. Server boots and serves `dist` + `/health`.
- `npm test` → **38/38 passing**, incl. a full 3-client game over the wire that also
  asserts per-seat hand privacy and the 40-card invariant.

### Next steps (Cycle 5)
- Game controls: restart (done minimally) + pause + end; host-only guards.
- Persist campaign progress (JSON) on game end; resume.
- Surface controls in the UI (lobby + in-game menu).

---

## Cycle 5 — Controls + saved progression
**Date:** 2026-06-06

### Planned (≤5 goals)
1. `CampaignStore` — JSON persistence of crew progress (level/attempts/cleared).
2. Wire progression into rooms: win → level++/save, loss → attempts++/save; resume on
   recreate by crew name; scale task count with level.
3. Pause / resume / end-game in RoomManager + protocol events (host-only).
4. Server handlers (`hostAction` guard) + crew name on create + injectable store.
5. Client UI: crew-name field, lobby campaign banner, in-game control bar, paused
   overlay, end-overlay Next-mission/Retry. Tests.

### Developed
- `server/campaign.ts` — `CampaignStore` (load/save/list, corrupt-file safe, injectable
  baseDir), `slugify`. `taskCountForLevel` (2→8 cap).
- `server/rooms.ts` — campaign fields on `Room`, store injection, `createRoom(name,
  crewName)` loads saved progress, `startGame` scales by level + rejects mid-game,
  `play` persists on terminal transition, `pause/resume/endGame`, `toRoomView` extended.
- `shared/protocol.ts` — `GamePause/Resume/End` events; `RoomView` gains
  `paused/campaignName/level/attempts/cleared`; `CreatePayload.crewName`.
- `server/gameServer.ts` — `hostAction` host-only guard, pause/resume/end handlers,
  host-guarded start, store passthrough.
- `client` — Home crew-name field; Lobby campaign banner + "Begin Mission N"; Game
  control bar (Pause/Resume/End), paused overlay, end overlay with Next-mission (won) /
  Retry (lost) / Back-to-lobby. New CSS. `state.tsx` gains pause/resume/endGame.
- Tests: `server/campaign.test.ts` — **9 tests** (store fresh/persist/list/slug;
  level scaling; win-advances-&-persists + resume; pause blocks play; no double-start;
  endGame→lobby). Integration test now uses a null store (no disk writes).

### Issues found
- None blocking. Minor: campaign keyed by crew-name slug → two crews choosing the same
  name share a save. Acceptable for LAN/friends; note for later (could salt with code).

### Verification
- `npm test` → **47/47 passing**. `npm run typecheck` + `typecheck:client` → clean.
  `npm run build:client` → ok.

### Next steps (Cycle 6)
- Leaderboard: REST endpoint listing campaigns (missions cleared, attempts) + a client
  Leaderboard view reachable from Home/Lobby.

---

## Cycle 6 — Leaderboard / high scores
**Date:** 2026-06-06

### Planned (≤5 goals)
1. `LeaderboardEntry` + `rankLeaderboard()` in shared (pure, testable).
2. `GET /api/leaderboard` REST endpoint.
3. Client Leaderboard view from Home.
4. Vite `/api` dev proxy.
5. Tests (ranking unit + endpoint).

### Developed
- `shared/leaderboard.ts` — `CrewRecord`/`LeaderboardEntry`, `rankLeaderboard()` (cleared
  desc → fewer attempts → name; computes successRate).
- `server/gameServer.ts` — store created explicitly + returned; `GET /api/leaderboard`
  returns ranked records.
- `client` — `screens/Leaderboard.tsx` (fetches `/api/leaderboard`, table view), Home
  "View leaderboard" button + modal; vite `/api` proxy; leaderboard CSS.
- Tests: `shared/leaderboard.test.ts` (3) + `server/leaderboard.test.ts` (endpoint with
  a temp store, 1).

### Issues found
- None.

### Verification
- `npm test` → **51/51 passing**. typecheck (both) clean. client builds.

### Next steps (Cycle 7)
- Sonar communication (once-per-mission highest/only/lowest reveal) + distress signal
  (pass one card before play). Engine + protocol + UI.

---

## Cycle 7 — Sonar communication
**Date:** 2026-06-06
(Scope: sonar only; **distress signal deferred to backlog** to keep the cycle focused.)

### Planned (≤5 goals)
1. Engine: communication state + `communicate()` with truthful-position validation +
   `sonarPosition` helper.
2. View projection includes communications + `youCanCommunicate`.
3. Protocol event + server handler.
4. Client sonar UI + crew-signal display.
5. Tests (engine + helper).

### Developed
- `shared/cards.ts` — `sonarPosition(hand, card)` → highest/only/lowest/null (rejects
  submarines, middles, not-held).
- `shared/game.ts` — `Communication` type, `communications`/`sonarUsed` on `GameState`,
  `canCommunicate()` (token unspent + between tricks), `communicate()` (derives truthful
  position, immutable, throws on misuse).
- `shared/view.ts` — view carries `communications`, `sonarUsed`, `youCanCommunicate`.
- `shared/protocol.ts` — `GameCommunicate` event + `CommunicatePayload`.
- `server` — `RoomManager.communicate()` + handler (rebroadcasts so all see the signal).
- `client` — Game sonar mode (📡 button; tap a highest/only/lowest card to signal,
  middles disabled), per-seat signal shown on player chips, "used" indicator. New CSS.
- Tests: `shared/comm.test.ts` — **5 tests** (position classification; record+spend;
  no second signal; reject middle/submarine; not mid-trick).

### Issues found
- Strict typecheck flagged the older `game.test.ts` helper missing the two new state
  fields (tests still ran since esbuild skips types). **Fixed** the helper.

### Verification
- `npm test` → **56/56 passing**. typecheck (both) clean. client builds.

### Next steps (Cycle 8)
- Curated mission set: a sequence with rising task counts AND ordering constraints
  (relative/absolute/last) so difficulty actually escalates; level setup/reset uses it.
- (Backlog) distress signal; per-player task selection in lobby.
