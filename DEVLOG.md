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
