import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * Camera QR scanner that works on iOS Safari (uses getUserMedia + a JS decoder, since iOS
 * lacks BarcodeDetector). Tuned for the dense connection QR: captures at high resolution,
 * requests continuous autofocus, and scans the center region each frame.
 * Requires a secure context (HTTPS / localhost) for camera access.
 */
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const scan = () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && ctx && v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth) {
        // Crop a centered square (where the aiming box is) and scan it at full resolution —
        // this maximises pixels-per-module for the dense handshake QR.
        const side = Math.floor(Math.min(v.videoWidth, v.videoHeight) * 0.92);
        const sx = Math.floor((v.videoWidth - side) / 2);
        const sy = Math.floor((v.videoHeight - side) / 2);
        canvas.width = side;
        canvas.height = side;
        ctx.drawImage(v, sx, sy, side, side, 0, 0, side, side);
        const img = ctx.getImageData(0, 0, side, side);
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
        if (found?.data) {
          stopped = true;
          resultRef.current(found.data);
          return;
        }
      }
      raf = requestAnimationFrame(scan);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        // Best-effort: ask for continuous autofocus (ignored where unsupported).
        try {
          const track = stream.getVideoTracks()[0];
          await track?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
        } catch {
          /* not supported — fine */
        }
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        raf = requestAnimationFrame(scan);
      } catch {
        setError("Camera unavailable. Make sure you opened the app over HTTPS and allowed camera access — or use Copy/Paste.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="overlay">
      <div className="ocard scanner">
        <h2>📷 Scan code</h2>
        {error ? (
          <p className="hint">{error}</p>
        ) : (
          <>
            <div className="scan-wrap">
              <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
              <div className="scan-guide" />
            </div>
            <p className="hint center">Fill the gold box with the QR and hold steady.</p>
          </>
        )}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
