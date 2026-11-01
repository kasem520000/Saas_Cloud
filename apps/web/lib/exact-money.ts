/**
 * T14-UI (PHASE-008) — exact decimal string math for the treasury screens
 * (ADR-0009: money values are canonical decimal STRINGS, never floats).
 * The same BigInt 4-dp minor-units approach the @erp/ui patterns use
 * (packages/ui exact-decimal) and the posting engine uses — the UI can
 * never disagree with the engine on the same fixture.
 */

/** Parses a canonical decimal string into 4-dp BigInt minor units. */
function toMinor(value: string): bigint {
  const negative = value.startsWith("-");
  const [int = "0", frac = ""] = value.replace("-", "").split(".");
  const minor =
    BigInt(int === "" ? "0" : int) * 10_000n + BigInt(frac.slice(0, 4).padEnd(4, "0"));
  return negative ? -minor : minor;
}

/** Renders 4-dp BigInt minor units back to a canonical decimal string. */
function fromMinor(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 10_000n;
  const frac = (abs % 10_000n).toString().padStart(4, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Σ over canonical strings; empty strings count as zero. */
export function sumExact(values: readonly string[]): string {
  let minor = 0n;
  for (const value of values) {
    minor += toMinor(value === "" ? "0" : value);
  }
  return fromMinor(minor);
}

/** Exact 4-dp subtraction (a − b). */
export function subtractExact(a: string, b: string): string {
  return fromMinor(toMinor(a === "" ? "0" : a) - toMinor(b === "" ? "0" : b));
}

/** Exact 4-dp addition (a + b). */
export function addExact(a: string, b: string): string {
  return fromMinor(toMinor(a === "" ? "0" : a) + toMinor(b === "" ? "0" : b));
}

/** Exact 4-dp comparison (-1 | 0 | 1). */
export function compareExact(a: string, b: string): -1 | 0 | 1 {
  const diff = toMinor(a === "" ? "0" : a) - toMinor(b === "" ? "0" : b);
  if (diff < 0n) return -1;
  if (diff > 0n) return 1;
  return 0;
}

/** True when the canonical string is zero at 4dp ("", "0", "0.00" …). */
export function isZeroExact(value: string): boolean {
  return toMinor(value === "" ? "0" : value) === 0n;
}

/** Positive-decimal shape check (mirrors the API MONEY regex, ≤8 dp). */
export function isPositiveDecimal(value: string): boolean {
  return /^\d+(\.\d{1,8})?$/.test(value.trim());
}
