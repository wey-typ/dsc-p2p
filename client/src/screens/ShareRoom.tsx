import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";

/** Modal showing a scannable QR code + the shareable join link for a room. */
export function ShareRoom({
  code,
  joinUrl,
  onClose,
}: {
  code: string;
  joinUrl: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === "function";

  const svg = useMemo(() => {
    try {
      const qr = qrcode(0, "M");
      qr.addData(joinUrl);
      qr.make();
      return qr.createSvgTag(6, 2);
    } catch {
      return "";
    }
  }, [joinUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (canShare) {
      try {
        await navigator.share({ title: "Deep Sea Crew", text: `Join my crew (${code})`, url: joinUrl });
        return;
      } catch {
        /* user cancelled */
      }
    }
    copy();
  }

  return (
    <div className="overlay">
      <div className="overlay-card share-card">
        <h2>Invite divers</h2>
        <p className="hint">Room code <strong className="share-code">{code}</strong></p>

        <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="hint center">Scan to join instantly (same Wi-Fi)</p>

        <div className="share-url">{joinUrl}</div>
        <div className="stack">
          <button className="btn primary" onClick={share}>
            {canShare ? "Send link…" : copied ? "✓ Copied!" : "Copy link"}
          </button>
          {canShare && (
            <button className="btn ghost" onClick={copy}>
              {copied ? "✓ Copied!" : "Copy link"}
            </button>
          )}
          <button className="btn link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
