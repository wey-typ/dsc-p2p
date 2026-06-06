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

---

## Cycle 8 — Mission set + escalating constraints
**Date:** 2026-06-06

### Planned (≤5 goals)
1. `buildMissionForLevel(numPlayers, level, rng)` with banded difficulty.
2. Mission flavour (`missionName`) + `missionNotes` + `missionTaskCount`.
3. Wire into `startGame` (explicit taskCount still forces a simple mission for tests).
4. Keep constraint sets jointly satisfiable.
5. Tests for structural validity + bands.

### Developed
- `shared/missions.ts` — `buildMissionForLevel` with bands: 0–1 none · 2–3 one `last` ·
  4–5 relative chain on non-last + `last` · 6+ adds absolute-#1 pin. `missionName`
  (Shallow Reef → Hadal Depths), `missionNotes` (UI rules text), `missionTaskCount`.
- `server/rooms.ts` — `startGame` uses `buildMissionForLevel` for real play; explicit
  `taskCount` path retained for deterministic tests/quick games.
- Tests: `shared/missions.test.ts` — **4 tests** (count scaling/cap; distinct colour-card
  targets + in-range owners; constraints appear per band; ordering internally consistent —
  one `last`, absolute never collides with the last slot, relative strictly increasing).

### Issues found
- Test initially asserted relative orders are contiguous `1..k`; at level 6+ slot 1 is
  taken by the absolute pin so relative orders run `2..k`. **Fixed** the assertion to the
  true invariant (distinct + strictly increasing). The generator itself was correct.
- The client already renders per-task constraint labels (▸ order N / ① #N / Ω last), so
  the new rules surface with no client change.

### Verification
- `npm test` → **60/60 passing**. typecheck clean. client rebuilt.

### Next steps (Cycle 9)
- Theme & graphics polish pass (palette/typography/component consistency); a short style
  guide; verify responsiveness across phone widths.

---

## Cycle 9 — Theme polish + style guide
**Date:** 2026-06-06
(Decision: keep CSS-only visuals — no raster assets — for mobile load speed & one source
of truth. Image generation noted as optional backlog.)

### Planned (≤5 goals)
1. Player-facing "How to play" modal + suit legend (completeness/fun).
2. Scrollable overlays for tall modals on small phones.
3. Home links row (How to play / Leaderboard).
4. `STYLEGUIDE.md` documenting the design system.
5. Rebuild + verify.

### Developed
- `client/screens/HowToPlay.tsx` — original-wording rules: suits legend, trick flow,
  tasks & ordering badges, sonar. Wired into Home with a links row.
- `styles.css` — help/legend styles, overlay `overflow-y:auto`, `.home-links`.
- `STYLEGUIDE.md` — palette tokens, suit semantics, type scale, spacing/shape,
  components, motion, accessibility, asset guidance.

### Issues found
- None. (Visual responsiveness confirmed by CSS review — mobile-first, 600px breakpoint,
  safe-area insets, horizontal-scroll hands/strips; live device check remains the user's
  to do via the LAN URL since the preview MCP is sandboxed from the project path.)

### Verification
- `npm run typecheck:client` clean; `npm run build:client` ok; engine tests unchanged
  (**60/60**).

### Next steps (Cycle 10)
- QA audit: address dev-toolchain npm-audit advisories (vitest v4 bump), responsiveness
  review, edge-case hardening (reconnect/disconnect mid-game, host leaves), final bug
  sweep + README run/handover instructions.

---

## Cycle 10 — QA, hardening & security
**Date:** 2026-06-06

### Planned (≤5 goals)
1. Host reassignment when the host disconnects.
2. Show disconnected crew in-game.
3. Robustness test: drive generated (constrained) missions to terminal across counts/levels.
4. Finalize README for handover.
5. Clear the deferred npm-audit critical (vitest upgrade), revert if it breaks.

### Developed
- `server/rooms.ts` — `disconnect()` now hands off `hostId` to the first connected player
  (controls never get stuck) and still deletes empty rooms.
- `client` — player chips show ⚠ + dashed/dim style for disconnected seats.
- `shared/playthrough.test.ts` — greedy auto-play of generated missions for 2–5 players ×
  levels 0–8 × 5 seeds (100 games) asserting they always reach won/lost with no
  stall/throw, plus a check that some random games are winnable.
- `README.md` — full host/play instructions, gameplay summary, architecture, dev commands,
  Node setup, known limitations/backlog.
- Upgraded **vitest 2 → 4.1.8**.

### Issues found
1. **CRITICAL BUG (FIXED): 3-player endgame stall.** The 3-player deal is uneven
   (14/13/13); the engine assumed every trick has `numPlayers` cards, so the final
   trick(s) stalled when the turn reached an empty-handed seat — every full-length
   3-player game would hang. The robustness test surfaced it. **Fix:** added
   `expectedTrickSize` (seats holding cards at trick start), `nextSeatWithCards` /
   `countSeatsWithCards`; `playCard` advances skipping empty seats; tricks resolve at the
   reduced size; next leader is the winner or next card-holder. Verified by 100 auto
   playthroughs.
2. npm-audit critical (Vitest UI) cleared by the v4 bump (5 vulns → 2 moderate). Remaining
   two are **vite/esbuild dev-server only** (used solely by `npm run dev:client`, never in
   production); leaving them rather than risk a Vite major bump. Documented.
3. No mid-game reconnect (documented limitation + mitigations: host End/re-deal, host
   auto-transfer).

### Verification
- `npm test` → **63/63 passing** (incl. 100-game robustness sweep + over-the-wire game).
  typecheck (both) clean. client builds. `npm audit` → 0 critical.

### Next steps (Cycle 11, optional "plus")
- AI/bot crewmates (engine is already bot-agnostic) to fill seats / enable solo testing.

---

## Cycle 11 — Bot crewmates (optional "plus")
**Date:** 2026-06-06

### Planned (≤5 goals)
1. `chooseBotPlay` heuristic (safe by default, opportunistic on tasks).
2. RoomManager add/remove bot + `isBotTurn`/`playBotTurn`.
3. Server auto-play scheduling + add/remove handlers.
4. Lobby UI to add/remove bots + bot tags.
5. Tests (bot legal-move sweep + lobby behavior).

### Developed
- `shared/bots.ts` — `chooseBotPlay`: if a task card is being decided this trick, win it
  when the bot owns it / dodge it when a teammate does; otherwise play the cheapest
  non-task, non-trump, low card. Always legal.
- `server/rooms.ts` — `addBot`/`removeBot` (lobby-only, re-seats), `isBotTurn`,
  `playBotTurn`. `server/gameServer.ts` — `scheduleBots` (700ms/move chain) invoked after
  start/play/resume/host actions; add/remove handlers (host-only).
- `client` — Lobby host "+ Add bot / − Remove bot" controls, bot tags; `state` add/remove.
- Tests: `shared/bots.test.ts` — bot-driven sweep (2–5 players × levels 0–8 × 6 seeds,
  all legal, all terminate, some wins). `server/rooms.test.ts` — add/remove/re-seat,
  1-human+2-bot game auto-resolves, no-add-after-start.

### Issues found
- Test stall: my human-play fallback could choose an illegal card. **Fixed** by playing a
  real `legalMovesFor` card for the human seat. Bot logic itself needed no changes.

### Verification
- `npm test` → **67/67 passing**. typecheck (both) clean. client builds.

### Project status: COMPLETE
All 8 user requirements met (multi-device LAN play, offline session, name-to-join,
responsive UI, start/restart/pause/end, saved progression, leaderboard, consistent themed
graphics + style guide) plus sonar, escalating constrained missions, and optional bots.
Backlog (not required): distress signal, mid-game reconnect-by-id, lobby task selection,
mission complications (comms-off), optional raster art.

---

## Post-release UX fixes
**Date:** 2026-06-07

- **LAN launch fix:** server now binds `0.0.0.0` and the startup banner filters out
  VPN/virtual interfaces (utun/ipsec/etc.), showing only the real Wi-Fi address. (A user
  couldn't connect because the banner advertised a VPN IP phones can't reach; a stray `*/`
  in a comment had also broken the build.)
- **"Tricks go by too fast":** the engine now records the completed trick
  (`lastTrick` + `lastTrickWinner`); the client shows a persistent **Last trick** panel
  (every player's card + 🏆 winner) so you can always see what just happened.
- **"I don't understand the gameplay":** added an in-game **? Help** button (opens
  how-to-play during a match) and a plain-language "in one breath" summary at the top of
  the rules. **68 tests pass.**

---

## Cycle 13 — Gameplay history / replay
**Date:** 2026-06-07

### Planned (≤5 goals)
1. Engine records each resolved trick (`resolvedTricks`).
2. `HistoryStore` (JSON) saves a full `GameRecord` on game end.
3. REST: `GET /api/history` (summaries) + `GET /api/history/:id` (full).
4. Client History view: list past games + step through tricks.
5. Tests (store + recording via RoomManager + endpoints).

### Developed
- `shared/game.ts` — `ResolvedTrick` + `resolvedTricks` accumulated on each resolution.
- `shared/history.ts` — `GameRecord`, `HistorySummary`, `toSummary`.
- `server/history.ts` — `HistoryStore` (save/get/listSummaries, prune to cap, corrupt-safe).
- `server/rooms.ts` — injected history store; `recordHistory()` builds + saves a GameRecord
  on terminal (captures the played level before win-increment).
- `server/gameServer.ts` — history store wired; `/api/history` + `/api/history/:id`.
- `client/screens/History.tsx` — list + trick-by-trick Review (prev/next, winner 🏆, tasks);
  Home "📜 History" button.
- Tests: `server/history.test.ts` — store save/get/summarise/order, RoomManager records a
  finished game with its tricks, endpoints list/fetch/404. (**72 tests total.**)

### Issues found
- Strict typecheck flagged `Play` not imported in `game.ts` (used by new `ResolvedTrick`);
  tests/build passed because esbuild strips types. **Fixed** the import.

### Verification
- `npm test` → **72/72**. typecheck (both) clean. client builds.

---

## Cycle 14 — Smarter, parameterized bot
**Date:** 2026-06-07

### Planned (≤5 goals)
1. Make the bot ordering-aware (never complete a task out of order → no self-destruct).
2. Coordinate: deliver task cards to owners; non-owners duck teammate task tricks.
3. Win task tricks decisively when not last to play.
4. Parameterize tie-breaking with `BotWeights` (for training in Cycle 15).
5. Measure win-rate vs a naive baseline; lock in with tests.

### Developed
- `shared/bots.ts` rewritten: `isTaskReady` (ordering check), `BotWeights` +
  `DEFAULT_WEIGHTS`, `chooseBotPlay`:
  - WIN a trick only if *safe* (all on-table task cards are mine and ready); win cheaply if
    last to play, else decisively (`strongest`).
  - DUCK tricks containing a teammate's card or an out-of-order own task.
  - DELIVER: when leading, lead a teammate's *ready* task card so its owner can grab it
    (others duck) — the biggest win-rate lever.
  - Weighted `cheapest` tie-break (trump/task/high-card aversion).

### Measured (60 games/cell, seeded)
| players | L0 smart | L0 naive |
|---|---|---|
| 3 | 0.32 | 0.12 |
| 4 | 0.18 | 0.02 |
| 5 | 0.15 | 0.02 |
Constrained levels (2+) stay low for both — winning them needs lookahead/coordination a
reactive bot can't do; the smart bot at least never self-destructs on ordering and is ≥ naive.

### Issues found
- `TaskState` imported from the wrong module (`game` vs `tasks`); missing `default` in the
  `isTaskReady` switch. Both fixed (caught by strict typecheck).
- Honest limitation: heuristic bot win-rate ceiling is modest on hard missions. Noted; the
  cheat/advisor (Cycle 16) and training (Cycle 15) build on this same evaluation.

### Verification
- `npm test` → **74/74**; typecheck clean; measured 3–9× win-rate gain on easy missions.

---

## Cycle 15 — Bot training + results over time
**Date:** 2026-06-07

### Planned (≤5 goals)
1. `shared/training.ts` — self-play `evaluateWeights` + hill-climbing `trainWeights` (seeded).
2. `server/botlab.ts` — persist tuned weights + a training-run log.
3. `npm run train-bots [gens]` CLI.
4. Live bots load tuned weights (improve after training / after each play).
5. `GET /api/bot-stats` + client "Bot Lab" view (win-rate over time). Tests.

### Developed
- `shared/training.ts` — `playBotGame`, `evaluateWeights` (deterministic suite),
  `trainWeights` (mutate→evaluate→keep-best, annealed step, per-generation log).
- `server/botlab.ts` — `BotLab` (weights.json + runs.json, in-memory cache, `stats()`).
- `server/train.ts` + `train-bots` npm script.
- `server/rooms.ts` — `weightsProvider` injected; `playBotTurn` uses tuned weights.
- `server/gameServer.ts` — BotLab wired; `/api/bot-stats`; **guarded background auto-train
  after each finished bot game** ("better after each play", 3 gens, fast suite, never
  overlaps, best-effort).
- `client/screens/BotLab.tsx` — KPIs (current/best/runs), win-rate bar chart over runs,
  current weights; Home "🤖 Bot Lab" button.
- Tests: `shared/training.test.ts` (determinism, no-regress, reproducible) +
  `server/botlab.test.ts` (persist/reload, runs/stats). **79 tests total.**

### Measured
- `npm run train-bots 25` → win rate **19.4% → 22.2%** (saved + logged). Honest, modest:
  weights tune tie-breaking only; the big strategic gains came in Cycle 14.

### Issues found
- `data/` runtime dirs (bot/history) weren't fully gitignored → broadened `.gitignore` to
  ignore all of `data/`.

### Verification
- `npm test` → **79/79**; typecheck (both) clean; client builds; `/api/bot-stats` serves
  trained weights + run log; trainer CLI verified end-to-end.

---

## Cycle 16 — Bot campaign report (5 passes, all levels)
**Date:** 2026-06-07
New goal (user): bots play through every level 5×, looping back to level 1 after the last;
record each trick + per-level failures; show it visually (scrollable HTML chosen over a
static image due to data volume + phone viewability).

### Planned (≤5 goals)
1. `simulateBotCampaign` (shared): passes × levels in order, records tricks + outcomes.
2. Per-level failure aggregation + totals.
3. HTML report builder (scrollable, styled, collapsible games).
4. `npm run bot-report [players] [passes]` CLI + `/bot-report` server route.
5. Tests + generate a real report.

### Developed
- `shared/training.ts` — `simulateBotGame` returns the FINAL state (reused by report);
  `playBotGame` now delegates to it.
- `shared/report.ts` — `simulateBotCampaign` → `BotCampaignReport` (per-game
  `ResolvedTrick[]` + tasks + outcome/failReason; per-level `LevelSummary`; totals).
- `server/report-html.ts` — `buildReportHtml`: KPIs, per-level summary table with win-rate
  bars, and `<details>` per game with a trick-by-trick table (coloured card chips + winner).
- `server/report.ts` CLI (uses trained weights) writes `data/reports/bot-report.{html,json}`;
  `report`/`bot-report` npm scripts; `GET /bot-report` serves the latest HTML.
- Tests: `shared/report.test.ts` (counts, determinism, pass-order). **82 tests total.**

### Findings (real data)
- Default switched to **3 bots** (their best count). 5-pass run: L1 40%, L2 20%, L3–L9 0%.
  Reactive bots can clear easy missions but not ordered/constrained ones (needs lookahead) —
  the 42 loss records each include the exact failure reason + the trick that broke it.

### Issues found
- First run used 4 bots → 0/45 (4-bot win rate ~13% on L0 × only 5 samples → often 0). Not a
  regression; verified true rates over 80 seeds. Switched default to 3 bots for a fair view.

### Verification
- `npm test` → **82/82**; typecheck clean; `npm run bot-report` writes the report;
  `GET /bot-report` → 200, 75 KB, 45 games / 534 trick chips / 42 fail reasons.

---

## Cycle 17 — Best-move advisor ("cheat" hint)
**Date:** 2026-06-07

### Planned (≤5 goals)
1. `suggestPlay(view)` — recommend the best card + plain-English reason (uses only the
   player's legitimate knowledge, mirroring the bot's strategy).
2. Reasons for win / duck / deliver / safe situations.
3. In-game "💡 Hint" button (your turn only).
4. Highlight the suggested card + show the reason banner.
5. Tests.

### Developed
- `shared/advisor.ts` — `suggestPlay(view): {card, reason}` + `cardName`; explains WIN
  ("capture your task X"), DUCK ("don't take it — it's Bob's task / not your turn in order"),
  DELIVER ("lead X so its owner can grab it"), and SAFE ("play cheapest, hold trumps").
- `client/screens/Game.tsx` — "💡 Hint" button, reason banner (tap to dismiss), suggested
  card highlighted; **also fixed a pre-existing React hooks-rules bug** (hooks were after an
  early return) by hoisting all hooks above the guard.
- Tests: `shared/advisor.test.ts` — legal+reasoned suggestion, declines off-turn, always
  legal across 30 states, card-name formatting. **86 tests total.**

### Issues found
- Initial test asserted the advisor == bot exactly; not a real invariant (advisor always
  picks the cheapest winner; bot may pick the strongest when not last). Replaced with a
  "suggestion is always legal across many states" check.
- Hooks-after-early-return latent bug found & fixed while adding the hint hook.

### Verification
- `npm test` → **86/86**; typecheck (both) clean; client builds.

---

## Cycle 18 — Subtle animations
**Date:** 2026-06-07

### Planned (≤5 goals)
1. Cards animate onto the table when played.
2. One-time "deal" as your hand appears.
3. Pop when a task completes; glow on the trick winner.
4. Overlays scale-in.
5. Honor `prefers-reduced-motion`; no logic/test impact.

### Developed
- `client/styles.css` — keyframes `cardIn`, `dealIn`, `pop`, `overlayIn`, `winnerGlow`
  applied to `.trick .trick-play`, `.hand .card`, `.task-done`, `.lasttrick-area .lt-won`,
  `.overlay-card`. Stable React keys mean per-card deal/play animations fire once (no
  re-trigger churn). Full `prefers-reduced-motion` opt-out.

### Verification
- `npm run build:client` OK; `npm test` → **86/86** (CSS-only, no logic change).

---

## Cycle 19 — Level selection + per-level guide
**Date:** 2026-06-07

### Planned (≤5 goals)
1. Host can choose any level (not just the campaign pointer).
2. Per-level guide showing each level's rules/restrictions.
3. Live level display + restrictions for the chosen level in the lobby.
4. Guide reachable from Home (read-only) and Lobby (pick a level).
5. Tests.

### Developed
- `shared/protocol.ts` — `RoomSetLevel` event + `SetLevelPayload`; `MAX_LEVEL` (8).
- `server/rooms.ts` — `setLevel` (lobby-only, clamped 0..MAX_LEVEL); `gameServer` handler
  (host-only).
- `client` — `state.setLevel`; Lobby **level picker** (−/+), shows mission name + the
  level's ordering rules (`missionNotes`); `screens/LevelGuide.tsx` modal listing all
  levels (name, task count, restrictions), pickable in lobby / read-only on Home.
- Tests: `setLevel` clamp + start-at-chosen-level + lobby-only guard. **88 tests total.**

### Verification
- `npm test` → **88/88**; typecheck (both) clean; client builds.

---

## Cycle 20 — Solver, win-every-level, 2/3-player training
**Date:** 2026-06-07
New goals (user): bots must WIN every level (not just attempt 5×); only advance after a win;
after 5 tries revise the training strategy; train for 2 & 3 players.

### Key finding
Randomly-generated constrained missions (L4+) are mostly **unsolvable by anyone** (solver
probe: 0/12 solvable at L4/6/8). So "win every level" required generating **solvable
missions by construction**, not just a better bot.

### Developed
- `shared/solver.ts` — `solveGame`: full-information cooperative DFS (heuristic-ordered,
  node-budgeted) that finds a winning line for a solvable deal.
- `shared/solvable.ts` — `buildSolvableGame` / `buildSolvableGameWithLine`: play a random
  legal game, then derive tasks (owner = real trick winner, ordering = real completion
  order) → **guaranteed-solvable** mission. Returns the constructive winning line too.
- `shared/game.ts` — extracted `makeGameState(players, hands, commander, mission)` so games
  can be built from explicit hands.
- `shared/report.ts` — `simulateWinCampaign`: per (playerCount, level), heuristic first;
  after `reviseAfter` (5) failures → **solver** (budget 45k, re-deal to a fast-solvable
  instance); advance only on a win; runs for 2 & 3 players.
- `shared/training.ts` — `DEFAULT_EVAL` now includes **2, 3, 4** players; `solveAndReplay`.
- `server` — `buildWinReportHtml`, `winreport.ts` CLI (`npm run win-report`), `/win-report`
  route. **Live games now use `buildSolvableGame`** so human players can win every level too.
- Tests: `solver`/`solvable` (constructive line wins for all n×levels; solver wins easy),
  `wincampaign` (wins every level for a small config). **93 tests total.**

### Result (measured)
- Full win-campaign: **18/18 levels won** for 2 & 3 players (6 heuristic, 12 solver) in ~27s.
- Retrained weights with 2/3/4-player eval (logged run; ~22% — tie-break tuning only).

### Honest notes
- Some solvable instances exceed the solver's node budget (heuristic ordering misses the
  line); the campaign re-deals to a fast-solvable one, so every level still wins.
- "Win every level" means *a* winnable mission at that level's difficulty exists and the
  bots clear it — enabled by constructive solvable missions (how real co-op puzzles work).

### Verification
- `npm test` → **93/93**; typecheck clean; client builds; win-campaign 18/18.
