/**
 * Manual signaling helpers. With no server, the two peers exchange their WebRTC
 * offer/answer "by hand" — as a copy/paste code or a scannable QR. WebRTC SDP is large and
 * very repetitive, so we shrink it before encoding to keep the QR small enough to scan
 * reliably. Encoding is LOSSLESS (the SDP is reconstructed exactly — no connection risk).
 *
 * A 1-char tag records the encoding:
 *   "D" = dictionary-substituted + gzip + base64  (smallest; default)
 *   "C" = gzip + base64
 *   "B" = plain base64        (no tag = legacy plain base64)
 */

interface SignalDesc {
  type: RTCSdpType;
  sdp: string;
}

// Common, single-occurrence SDP tokens replaced with 1 control char each before gzip.
// gzip can't compress a substring that appears only once, but a 1-char swap can — this
// noticeably lowers the QR's data density. Reversed exactly on decode (lossless).
const DICT = [
  "UDP/DTLS/SCTP webrtc-datachannel",
  "a=max-message-size:262144",
  "a=fingerprint:sha-256 ",
  "a=ice-options:trickle",
  "a=extmap-allow-mixed",
  "a=msid-semantic: WMS",
  "a=group:BUNDLE 0",
  "a=ice-ufrag:",
  "a=ice-pwd:",
  "a=candidate:",
  "a=setup:actpass",
  "a=setup:active",
  "a=setup:passive",
  "a=sctp-port:5000",
  "a=mid:0",
  "typ host",
  "typ srflx",
  " IN IP4 ",
  "generation 0",
  "network-cost ",
  "\r\n",
];

function packDict(s: string): string {
  let out = s;
  DICT.forEach((tok, i) => (out = out.split(tok).join(String.fromCharCode(1 + i))));
  return out;
}
function unpackDict(s: string): string {
  let out = s;
  DICT.forEach((tok, i) => (out = out.split(String.fromCharCode(1 + i)).join(tok)));
  return out;
}

function b64encodeBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
}
function b64decodeBytes(str: string): Uint8Array {
  const bin = typeof atob === "function" ? atob(str) : Buffer.from(str, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeSignal(desc: RTCSessionDescriptionInit): Promise<string> {
  const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
  try {
    if (typeof CompressionStream !== "undefined") {
      const gz = await gzip(new TextEncoder().encode(packDict(json)));
      return "D" + b64encodeBytes(gz);
    }
  } catch {
    /* fall through to plain base64 */
  }
  return "B" + (typeof btoa === "function" ? btoa(json) : Buffer.from(json, "utf8").toString("base64"));
}

export async function decodeSignal(code: string): Promise<RTCSessionDescriptionInit> {
  const clean = code.trim();
  const tag = clean[0];
  const body = clean.slice(1);
  let json: string;
  if (tag === "D") {
    json = unpackDict(new TextDecoder().decode(await gunzip(b64decodeBytes(body))));
  } else if (tag === "C") {
    json = new TextDecoder().decode(await gunzip(b64decodeBytes(body)));
  } else if (tag === "B") {
    json = typeof atob === "function" ? atob(body) : Buffer.from(body, "base64").toString("utf8");
  } else {
    json = typeof atob === "function" ? atob(clean) : Buffer.from(clean, "base64").toString("utf8");
  }
  const obj = JSON.parse(json) as SignalDesc;
  return { type: obj.type, sdp: obj.sdp };
}
