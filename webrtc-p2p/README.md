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
- [x] Sub-project scaffolded (this folder, plan, stub entry).
- [ ] Vite app that imports `@dsc/shared` and runs a full game **locally** (no network) —
      proves engine reuse in the browser.
- [ ] WebRTC DataChannel transport + QR offer/answer handshake (2-player).
- [ ] Host authority loop + per-seat projection over the channel.
- [ ] Reuse the existing React UI components for the board.
- [ ] Browser-local persistence; reconnect within a session.

## Running (once built)
Planned: `npm install && npm run dev` inside this folder. Not wired up yet — see TODO.
