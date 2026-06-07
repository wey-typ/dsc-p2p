/**
 * WebRTC P2P sub-project — entry stub.
 *
 * This is the starting point for the server-less host mode. The plan (see ../README.md):
 *  1. Run the SHARED engine in the host browser as the authority.
 *  2. Connect guests via WebRTC DataChannels using a QR-based SDP handshake (2-player first).
 *  3. Reuse the existing protocol/payload shapes from @dsc/shared over the channel.
 *
 * For now this just demonstrates that the pure engine runs in a browser context with no
 * server — the foundation the P2P transport will sit on top of.
 *
 * NOTE: imports below are illustrative; wiring (Vite config, @dsc/shared resolution) is the
 * first TODO. Kept minimal so the parent project's build is untouched.
 */

// import { createGame, buildSolvableGame, chooseBotPlay, playCard, mulberry32 } from "@dsc/shared";

export function placeholder(): string {
  return "Deep Sea Crew P2P — scaffold. See README.md for the build plan.";
}

// Next step: a tiny RTCPeerConnection + DataChannel signaling demo (offer/answer via QR),
// then mount the shared React board and route plays over the channel.
