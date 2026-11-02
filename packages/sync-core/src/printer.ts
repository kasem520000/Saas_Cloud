/**
 * PHASE-021 T10 — receipt printer integration points (80/58 mm): raw ESC/POS
 * command building for the bilingual receipt templates (PHASE-013/016).
 * Reprint rule (matrix row 32): reprinting a POSTED document from the local
 * cache NEVER re-creates or re-numbers anything — the builder only renders
 * stored bytes.
 */

export type ReceiptWidth = 80 | 58;

const ESC = 0x1b;
const GS = 0x1d;

export interface ReceiptLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  doubleHeight?: boolean;
}

/** Build the ESC/POS byte stream for a receipt. Text is UTF-8 (Arabic RTL
 *  handled by the printer's bidi; we emit logical order). */
export function buildEscPos(lines: readonly ReceiptLine[], _width: ReceiptWidth): Buffer {
  const bytes: number[] = [];
  // init + UTF-8 code page (PC866-style Arabic pages vary; use 1252 default + UTF-8 flag where supported)
  bytes.push(ESC, 0x40); // ESC @ init
  bytes.push(ESC, 0x74, 0x11); // ESC t 17 — UTF-8 where supported
  for (const line of lines) {
    bytes.push(ESC, 0x61, line.align === "center" ? 1 : line.align === "right" ? 2 : 0); // align
    if (line.bold) bytes.push(ESC, 0x45, 1); // bold on
    if (line.doubleHeight) bytes.push(GS, 0x21, 0x10); // double height
    const textBytes = Buffer.from(line.text, "utf8");
    bytes.push(...textBytes);
    bytes.push(0x0a); // LF
    if (line.bold) bytes.push(ESC, 0x45, 0);
    if (line.doubleHeight) bytes.push(GS, 0x21, 0x00);
  }
  bytes.push(GS, 0x56, 0x41, 0x03); // cut with feed
  return Buffer.from(bytes);
}

/** Characters per line for the two receipt widths (approx, monospace). */
export function charsPerLine(width: ReceiptWidth): number {
  return width === 80 ? 48 : 32;
}

/** Wrap text to the receipt width without breaking words. */
export function wrapReceiptText(text: string, width: ReceiptWidth): string[] {
  const cpl = charsPerLine(width);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (candidate.length <= cpl) {
      current = candidate;
    } else {
      if (current !== "") lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}
