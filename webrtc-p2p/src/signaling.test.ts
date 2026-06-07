import { describe, it, expect } from "vitest";
import { encodeSignal, decodeSignal } from "./signaling.js";

describe("signaling codes", () => {
  it("round-trips an offer/answer through a paste-friendly code", () => {
    const desc = { type: "offer" as RTCSdpType, sdp: "v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\n..." };
    const code = encodeSignal(desc);
    expect(code).not.toContain(" ");
    expect(decodeSignal(code)).toEqual(desc);
  });

  it("tolerates surrounding whitespace when decoding", () => {
    const code = encodeSignal({ type: "answer" as RTCSdpType, sdp: "x" });
    expect(decodeSignal(`\n  ${code}  \n`)).toEqual({ type: "answer", sdp: "x" });
  });
});
