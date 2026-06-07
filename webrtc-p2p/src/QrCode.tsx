import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** Render a string as a scannable QR (SVG). Falls back to a hint if the data is too large. */
export function QrCode({ data }: { data: string }) {
  const svg = useMemo(() => {
    try {
      const qr = qrcode(0, "L"); // type 0 = auto-size; "L" = max data capacity
      qr.addData(data);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch {
      return null;
    }
  }, [data]);

  if (!svg) return <p className="hint">This code is too large to show as a QR — use Copy / Share.</p>;
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
