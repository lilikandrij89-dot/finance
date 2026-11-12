import QRCode from "qrcode";

export const PUBLIC_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
  "https://finance-ebon-alpha.vercel.app";

export function buildPlayJoinUrl(roomId: string, origin?: string): string {
  const base = (origin || PUBLIC_APP_URL).trim().replace(/\/+$/, "");
  const path =
    roomId && roomId !== "default-room"
      ? `/play?roomId=${encodeURIComponent(roomId)}`
      : "/play";
  return `${base}${path}`;
}

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

/**
 * ISO/IEC 18004 compliant QR matrix generator backed by `qrcode` (ECC-M).
 */
export function generateQrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text || PUBLIC_APP_URL, {
    errorCorrectionLevel: "M",
  });
  const size = qr.modules.size;
  const modules: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => Boolean(qr.modules.get(r, c)))
  );
  return { size, modules };
}

/**
 * Converts a QR matrix into an SVG `<path>` merging horizontal runs to avoid subpixel seams.
 */
export function qrMatrixToSvgPath(modules: boolean[][]): string {
  const parts: string[] = [];
  for (let r = 0; r < modules.length; r++) {
    const row = modules[r];
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) {
        c++;
      }
      parts.push(`M${start},${r}h${c - start}v1h-${c - start}z`);
    }
  }
  return parts.join("");
}
