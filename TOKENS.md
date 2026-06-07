# Token Usage Tracking

> **Important honesty note.** The build harness does **not** expose exact token counts to
> the assistant during a session, so these figures are **estimates**, not measured values.
> They are derived from the volume of work per cycle (files written/edited, tool calls,
> test runs, and response length). Treat them as rough orders of magnitude (±30–40%).
> If you need exact numbers, they're available in your Claude usage dashboard / billing,
> not from inside the build.

Methodology: per cycle ≈ (input context re-read each turn) + (output: code + prose + tool
calls). Later cycles cost more input because the conversation/context grows. Estimates
below are **output-weighted** rough totals per cycle.

| Cycle | Focus | Est. tokens | Notes |
|---|---:|---:|---|
| Research + Plan | Game research, plan, Q&A | ~25k | web research + plan file |
| 1 | Engine core + scaffolding | ~30k | Node install, 6 files + tests |
| 2 | Tasks + win/lose state machine | ~25k | game.ts + 14 tests |
| 3 | Server, rooms & Socket.IO | ~30k | projection/protocol/server + tests |
| 4 | Client UI (first playable) | ~40k | many React files + CSS + integ test |
| 5 | Controls + saved progression | ~30k | campaign store + UI controls |
| 6 | Leaderboard | ~18k | endpoint + ranking + view |
| 7 | Sonar communication | ~25k | engine + UI + tests |
| 8 | Mission set + constraints | ~20k | generator + tests |
| 9 | Theme polish + style guide | ~20k | how-to-play + STYLEGUIDE |
| 10 | QA, hardening & security | ~30k | 3-player bug fix + robustness tests |
| 11 | Bot crewmates | ~25k | bot heuristic + lobby + tests |
| UX fixes | LAN fix, last-trick, help | ~22k | post-release fixes |
| **Subtotal (1–11 + UX)** | | **~390k** | rough |

## Going forward
Each new cycle appends a row with an estimate + a one-line basis. (Cycles 12+ below.)

| Cycle | Focus | Est. tokens | Basis |
|---|---:|---:|---|
| 12 | Token tracking doc | ~4k | one doc |
| 13 | Gameplay history / replay | ~32k | engine + store + API + History UI + tests |
| 14 | Smarter parameterized bot | ~28k | bot rewrite + measurement iterations + tests |
| 15 | Bot training + Bot Lab | ~34k | trainer + store + CLI + API + UI + tests |
| 16 | Bot campaign report (5-pass, all levels, HTML) | ~30k | sim + HTML gen + CLI + route + tests + measurement |
| 17 | Best-move advisor (hint/cheat) | ~22k | advisor + reasons + Hint UI + hooks fix + tests |
| 18 | Subtle animations (CSS) | ~10k | keyframes + reduced-motion |
| 19 | Level selection + level guide | ~20k | setLevel + lobby picker + guide modal + tests |
| 20 | Solver + win-every-level + 2/3p training | ~46k | solver + solvable gen + win-campaign + HTML/CLI + tests + measurement |
| 21 | QR/link join + animation toggle | ~26k | /api/lan + ShareRoom(QR) + deep-link + Settings + tests |
| 22 | Reconnect + one-click launcher | ~24k | rejoin + grace sweep + session persist + .command/.app + tests |
| 23 | Icon, autoscroll, sound, mobile UI fixes, P2P scaffold | ~30k | icns + Web Audio SFX + task autoscroll + hand wrap + overlap fix + p2p subfolder |
| 24 | Kick + host handover + ocean BGM + tasks-always-visible | ~24k | kick/removePlayer + procedural BGM + Settings + task wrap + tests |
| 25 | WebRTC P2P foundation (transport/session/rtc/signaling) | ~30k | P2P core + tests + RTC + signaling + config |
| 26 | P2P UI + installable PWA | ~34k | connect screens + board + lobby + PWA + build verify |
| 27 | P2P QR scanning + compressed signaling | ~26k | gzip codes + QR display + camera scanner (jsQR) + build |
| 28 | P2P reconnect + N-player core + persistence | ~34k | guestId reconnect + serialize/restore + N guests + unified invite UI + tests |
