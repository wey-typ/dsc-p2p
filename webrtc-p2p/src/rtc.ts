/**
 * Real WebRTC transport (browser only). Non-trickle ICE: we gather all candidates, then
 * export one self-contained offer/answer code for the manual handshake. LAN-first
 * (empty iceServers) so it works offline on the same Wi-Fi; add a STUN server if you ever
 * want it to traverse different networks.
 */
import type { Transport } from "./transport.js";

const RTC_CONFIG: RTCConfiguration = { iceServers: [] };

/** Wait until ICE gathering completes so the localDescription is self-contained. */
function waitForIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}

function wrapChannel(pc: RTCPeerConnection, ch: RTCDataChannel): Transport {
  let onMsg: ((d: unknown) => void) | null = null;
  let onCls: (() => void) | null = null;
  ch.onmessage = (e) => {
    try {
      onMsg?.(JSON.parse(e.data as string));
    } catch {
      /* ignore malformed */
    }
  };
  ch.onclose = () => onCls?.();
  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") onCls?.();
  });
  return {
    send: (d) => {
      if (ch.readyState === "open") ch.send(JSON.stringify(d));
    },
    onMessage: (cb) => (onMsg = cb),
    onClose: (cb) => (onCls = cb),
    close: () => {
      ch.close();
      pc.close();
    },
  };
}

/** HOST side: create an offer, then (after the guest's answer) get a live Transport. */
export async function createHostPeer(): Promise<{
  offer: RTCSessionDescriptionInit;
  accept(answer: RTCSessionDescriptionInit): Promise<void>;
  ready: Promise<Transport>;
}> {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channel = pc.createDataChannel("dsc", { ordered: true });
  const ready = new Promise<Transport>((resolve) => {
    channel.onopen = () => resolve(wrapChannel(pc, channel));
  });
  await pc.setLocalDescription(await pc.createOffer());
  await waitForIce(pc);
  return {
    offer: pc.localDescription!,
    accept: async (answer) => {
      await pc.setRemoteDescription(answer);
    },
    ready,
  };
}

/** GUEST side: consume the host's offer, produce an answer, get a live Transport on open. */
export async function createGuestPeer(offer: RTCSessionDescriptionInit): Promise<{
  answer: RTCSessionDescriptionInit;
  ready: Promise<Transport>;
}> {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const ready = new Promise<Transport>((resolve) => {
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      ch.onopen = () => resolve(wrapChannel(pc, ch));
    };
  });
  await pc.setRemoteDescription(offer);
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForIce(pc);
  return { answer: pc.localDescription!, ready };
}
