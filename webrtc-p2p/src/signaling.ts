/**
 * Manual signaling helpers. With no server, the two peers exchange their WebRTC
 * offer/answer "by hand" as compact codes (copy/paste via Messages/AirDrop, or shown as a
 * QR). These helpers just encode/decode the session description to a paste-friendly string.
 */

export function encodeSignal(desc: RTCSessionDescriptionInit): string {
  const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
  // base64 so it survives copy/paste without newline/whitespace issues.
  return typeof btoa === "function" ? btoa(json) : Buffer.from(json, "utf8").toString("base64");
}

export function decodeSignal(code: string): RTCSessionDescriptionInit {
  const clean = code.trim();
  const json =
    typeof atob === "function" ? atob(clean) : Buffer.from(clean, "base64").toString("utf8");
  const obj = JSON.parse(json) as { type: RTCSdpType; sdp: string };
  return { type: obj.type, sdp: obj.sdp };
}
