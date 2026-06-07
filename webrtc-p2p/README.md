# Deep Sea Crew — WebRTC P2P (sub-project, experimental)

> **This is a separate, in-progress sub-project. It does NOT replace the working
> LAN-server version in the parent folder.** The shipped game still runs via the Node
> server (`npm run play` / the one-click launcher). This folder explores a server-less,
> browser-to-browser mode so a phone (including iPhone) can host with no computer.

## Goal
Let one player's **browser tab be the host** (authoritative game) and others connect
directly over **WebRTC DataChannels** — no Node server, works on the local network.

## Why it's a separate build
- It changes the **transport** (Socket.IO → WebRTC data channels) and moves the
  **authoritative game loop + persistence** into the host browser (localStorage/IndexedDB
  instead of server files).
- The bot **training/report CLIs** stay server-side and are not part of this mode.
- Keeping it separate means the proven LAN version keeps working while this matures.

## What is reused (the good news)
- **`@dsc/shared`** — the entire game engine (deck, deal, tricks, tasks, solver, bots,
  advisor, solvable-mission generator) is pure TypeScript with no I/O, so it runs
  unchanged inside the host browser. Only the networking/persistence layer is new.

## Architecture (planned)
```
Host browser (tab)                     Guest browser(s)
  ├─ @dsc/shared engine (authority)      ├─ @dsc/shared (view/render only)
  ├─ RoomManager-equivalent (in-memory)  ├─ WebRTC DataChannel ── offers/answers ──┐
  ├─ per-seat projection                 └─ renders PlayerView, sends plays        │
  └─ WebRTC DataChannels  ◀──────────────────────────────────────────────────────┘
```
- **Signaling (the hard part):** no server, so peers exchange SDP offer/answer + ICE via a
  **QR handshake** — host shows an offer QR, guest scans and shows an answer QR, host scans.
  Smooth for **2 players**; 3–5 would need repeated handshakes (or a tiny signaling helper).
- **Message protocol:** mirror the existing `EV`/payloads from `@dsc/shared/protocol` over
  the data channel so the client UI can be largely shared with the LAN client.
- **Persistence:** campaign/leaderboard/history in the host's `localStorage`.

## Status / TODO
- [x] Sub-project scaffolded.
- [x] **Transport abstraction** (`transport.ts`) + in-memory pair for tests.
- [x] **Host/guest session logic** (`session.ts`) reusing the `@dsc/shared` engine — host is
      authoritative, sends each side its private view. Tested via a full 2-player game over
      the in-memory transport (`session.test.ts`).
- [x] **WebRTC DataChannel transport** (`rtc.ts`, browser) — non-trickle ICE, LAN-first.
- [x] **Manual signaling** (`signaling.ts`) — offer/answer ↔ paste-friendly codes (tested).
- [ ] **React UI**: Host/Join connect screens (code exchange) + game board (NEXT).
- [ ] Browser-local persistence; in-session reconnect.
- [ ] (Later) QR scan instead of copy/paste; 3–5 players.

## How the 2-player connection will work (copy/paste codes, no server)
1. Host taps **Host** → app shows an **offer code**. Host shares it (Messages/AirDrop).
2. Guest taps **Join**, pastes the offer code → app shows an **answer code** → sends it back.
3. Host pastes the answer code → connected. Play begins.

## Running (once the UI lands)
`cd webrtc-p2p && npm install && npm run dev` (it's a standalone Vite app; aliases
`@dsc/shared` to the engine source). The networking core already typechecks
(`npm run typecheck`) and its logic is covered by the root test suite.
