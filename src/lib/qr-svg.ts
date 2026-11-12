/**
 * Zero-dependency ISO/IEC 18004 QR Code matrix generator (Byte mode, ECC-L, Versions 1-6).
 * Capacity up to 134 UTF-8 bytes, sufficient for classroom `/play?roomId=...` join URLs.
 */

interface QrVersionSpec {
  version: number;
  size: number;
  totalCodewords: number;
  dataCodewords: number;
  eccPerBlock: number;
  blocks: number;
  alignmentCenters: number[];
}

const QR_VERSIONS_L: QrVersionSpec[] = [
  {
    version: 1,
    size: 21,
    totalCodewords: 26,
    dataCodewords: 19,
    eccPerBlock: 7,
    blocks: 1,
    alignmentCenters: [],
  },
  {
    version: 2,
    size: 25,
    totalCodewords: 44,
    dataCodewords: 34,
    eccPerBlock: 10,
    blocks: 1,
    alignmentCenters: [6, 18],
  },
  {
    version: 3,
    size: 29,
    totalCodewords: 70,
    dataCodewords: 55,
    eccPerBlock: 15,
    blocks: 1,
    alignmentCenters: [6, 22],
  },
  {
    version: 4,
    size: 33,
    totalCodewords: 100,
    dataCodewords: 80,
    eccPerBlock: 20,
    blocks: 1,
    alignmentCenters: [6, 26],
  },
  {
    version: 5,
    size: 37,
    totalCodewords: 134,
    dataCodewords: 108,
    eccPerBlock: 26,
    blocks: 1,
    alignmentCenters: [6, 30],
  },
  {
    version: 6,
    size: 41,
    totalCodewords: 172,
    dataCodewords: 136,
    eccPerBlock: 18,
    blocks: 2,
    alignmentCenters: [6, 34],
  },
];

// GF(256) tables with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function getRsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function computeRsEcc(data: Uint8Array, eccLen: number): Uint8Array {
  const gen = getRsGenerator(eccLen);
  const res = new Uint8Array(eccLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[eccLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < eccLen; j++) {
        res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return res;
}

function encodeDataCodewords(bytes: Uint8Array, dataCodewords: number): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Mode 0100 (Byte), 8-bit character count (valid for V1..V9)
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) {
    pushBits(b, 8);
  }

  const totalBits = dataCodewords * 8;
  const terminatorLen = Math.min(4, totalBits - bits.length);
  pushBits(0, terminatorLen);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const out = new Uint8Array(dataCodewords);
  const byteCount = bits.length / 8;
  for (let i = 0; i < byteCount; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) {
      v = (v << 1) | bits[i * 8 + b];
    }
    out[i] = v;
  }

  const padBytes = [0xec, 0x11];
  for (let i = byteCount, p = 0; i < dataCodewords; i++, p++) {
    out[i] = padBytes[p % 2];
  }
  return out;
}

function interleaveCodewords(data: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const blockDataLen = Math.floor(spec.dataCodewords / spec.blocks);
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];

  for (let b = 0; b < spec.blocks; b++) {
    const slice = data.subarray(b * blockDataLen, (b + 1) * blockDataLen);
    dataBlocks.push(slice);
    eccBlocks.push(computeRsEcc(slice, spec.eccPerBlock));
  }

  const final = new Uint8Array(spec.totalCodewords);
  let idx = 0;
  for (let i = 0; i < blockDataLen; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      final[idx++] = dataBlocks[b][i];
    }
  }
  for (let i = 0; i < spec.eccPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      final[idx++] = eccBlocks[b][i];
    }
  }
  return final;
}

function drawFinderAndSeparator(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  top: number,
  left: number
) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const r = top + dr;
      const c = left + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const isSeparator = dr === -1 || dr === 7 || dc === -1 || dc === 7;
      const isOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
      const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      modules[r][c] = !isSeparator && (isOuter || isInner);
      isFunction[r][c] = true;
    }
  }
}

function drawAlignment(
  modules: boolean[][],
  isFunction: boolean[][],
  centerR: number,
  centerC: number
) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      modules[centerR + dr][centerC + dc] = dist === 2 || dist === 0;
      isFunction[centerR + dr][centerC + dc] = true;
    }
  }
}

function computeFormatBits(eccLevelBits: number, maskPattern: number): number {
  const data = (eccLevelBits << 3) | maskPattern;
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if (rem & (1 << (i + 10))) {
      rem ^= 0x537 << i;
    }
  }
  const combined = ((data << 10) | rem) ^ 0x5412;
  return combined;
}

function drawFormatBits(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  maskPattern: number
) {
  // ECC level L = 01
  const bits = computeFormatBits(0b01, maskPattern);

  for (let i = 0; i <= 5; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    modules[8][i] = bit;
    isFunction[8][i] = true;
  }
  modules[8][7] = ((bits >>> 6) & 1) === 1;
  isFunction[8][7] = true;
  modules[8][8] = ((bits >>> 7) & 1) === 1;
  isFunction[8][8] = true;
  modules[7][8] = ((bits >>> 8) & 1) === 1;
  isFunction[7][8] = true;
  for (let i = 9; i < 15; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    modules[14 - i][8] = bit;
    isFunction[14 - i][8] = true;
  }

  for (let i = 0; i <= 7; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    modules[size - 1 - i][8] = bit;
    isFunction[size - 1 - i][8] = true;
  }
  for (let i = 8; i < 15; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    modules[8][size - 15 + i] = bit;
    isFunction[8][size - 15 + i] = true;
  }
  // Dark module
  modules[size - 8][8] = true;
  isFunction[size - 8][8] = true;
}

function applyMaskCondition(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function scorePenalty(modules: boolean[][]): number {
  const n = modules.length;
  let penalty = 0;

  // Rule 1: 5+ same-color in row/col
  for (let r = 0; r < n; r++) {
    let run = 1;
    for (let c = 1; c < n; c++) {
      if (modules[r][c] === modules[r][c - 1]) {
        run++;
      } else {
        if (run >= 5) penalty += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  for (let c = 0; c < n; c++) {
    let run = 1;
    for (let r = 1; r < n; r++) {
      if (modules[r][c] === modules[r - 1][c]) {
        run++;
      } else {
        if (run >= 5) penalty += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = modules[r][c];
      if (
        modules[r][c + 1] === v &&
        modules[r + 1][c] === v &&
        modules[r + 1][c + 1] === v
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 4: dark ratio
  let dark = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r][c]) dark++;
    }
  }
  const pct = (dark * 100) / (n * n);
  const k = Math.floor(Math.abs(pct - 50) / 5);
  penalty += k * 10;

  return penalty;
}

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

export function generateQrMatrix(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const spec =
    QR_VERSIONS_L.find((v) => bytes.length <= v.dataCodewords - 2) ??
    QR_VERSIONS_L[QR_VERSIONS_L.length - 1];

  const clampedBytes =
    bytes.length > spec.dataCodewords - 2
      ? bytes.subarray(0, spec.dataCodewords - 2)
      : bytes;

  const dataCw = encodeDataCodewords(clampedBytes, spec.dataCodewords);
  const codewords = interleaveCodewords(dataCw, spec);

  const size = spec.size;
  const baseModules = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );
  const isFunction = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );

  // Finder patterns
  drawFinderAndSeparator(baseModules, isFunction, size, 0, 0);
  drawFinderAndSeparator(baseModules, isFunction, size, 0, size - 7);
  drawFinderAndSeparator(baseModules, isFunction, size, size - 7, 0);

  // Alignment patterns
  for (const r of spec.alignmentCenters) {
    for (const c of spec.alignmentCenters) {
      if (isFunction[r][c]) continue;
      drawAlignment(baseModules, isFunction, r, c);
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0;
    if (!isFunction[6][i]) {
      baseModules[6][i] = bit;
      isFunction[6][i] = true;
    }
    if (!isFunction[i][6]) {
      baseModules[i][6] = bit;
      isFunction[i][6] = true;
    }
  }

  // Reserve format info cells before placing data bits
  drawFormatBits(baseModules, isFunction, size, 0);

  // Place data bits in zig-zag order
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (isFunction[row][col]) continue;
        let bit = false;
        if (bitIdx < totalBits) {
          bit = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        baseModules[row][col] = bit;
      }
    }
  }

  // Choose best mask (0..7)
  let bestPenalty = Infinity;
  let bestModules = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunction[r][c] && applyMaskCondition(mask, r, c)) {
          candidate[r][c] = !candidate[r][c];
        }
      }
    }
    drawFormatBits(candidate, isFunction, size, mask);
    const penalty = scorePenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestModules = candidate;
    }
  }

  return { size, modules: bestModules };
}

export function qrMatrixToSvgPath(modules: boolean[][]): string {
  const parts: string[] = [];
  for (let r = 0; r < modules.length; r++) {
    for (let c = 0; c < modules[r].length; c++) {
      if (modules[r][c]) {
        parts.push(`M${c},${r}h1v1h-1z`);
      }
    }
  }
  return parts.join("");
}
