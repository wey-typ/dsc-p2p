import { describe, it, expect } from "vitest";
import { encodeSignal, decodeSignal } from "./signaling.js";

const SAMPLE = {
  type: "offer" as RTCSdpType,
  // realistic-ish repetitive SDP so the compression path is exercised
  sdp: ["v=0", "o=- 42 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0", "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "a=candidate:1 1 udp 2122 192.168.1.5 50000 typ host", "a=candidate:2 1 udp 2122 192.168.1.5 50001 typ host"].join("\r\n"),
};

describe("signaling codes", () => {
  it("round-trips an offer through a (compressed) paste-friendly code", async () => {
    const code = await encodeSignal(SAMPLE);
    expect(code).not.toContain(" ");
    expect(await decodeSignal(code)).toEqual(SAMPLE);
  });

  it("compresses large SDP to something much smaller than raw base64", async () => {
    const code = await encodeSignal(SAMPLE);
    // when CompressionStream is available the tag is "D" (dictionary + gzip)
    if (code.startsWith("D")) {
      const rawB64 = Buffer.from(JSON.stringify(SAMPLE), "utf8").toString("base64");
      expect(code.length).toBeLessThan(rawB64.length);
    }
  });

  it("tolerates whitespace and decodes legacy plain-base64 codes", async () => {
    const code = await encodeSignal({ type: "answer" as RTCSdpType, sdp: "x" });
    expect(await decodeSignal(`\n  ${code}  \n`)).toEqual({ type: "answer", sdp: "x" });
    const legacy = Buffer.from(JSON.stringify({ type: "answer", sdp: "y" }), "utf8").toString("base64");
    expect(await decodeSignal(legacy)).toEqual({ type: "answer", sdp: "y" });
  });
});
