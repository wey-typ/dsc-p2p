declare module "qrcode-generator" {
  interface QRCode {
    addData(data: string): void;
    make(): void;
    createSvgTag(opts?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
    createSvgTag(cellSize?: number, margin?: number): string;
    getModuleCount(): number;
  }
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";
  function qrcode(typeNumber: number, errorCorrectionLevel: ErrorCorrectionLevel): QRCode;
  export default qrcode;
}
