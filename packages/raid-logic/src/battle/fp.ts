import { fp } from "@shaisrc/fixed-point";

// ──────────────────────────────────────────────
// Fixed-point constants (Q16.16, number-backed)
// All game-logic arithmetic uses these via fp.*
// ──────────────────────────────────────────────

export const FP_0 = fp.fromInt(0);
export const FP_1 = fp.fromInt(1);
export const FP_2 = fp.fromInt(2);
export const FP_PI = fp.fromFloat(Math.PI);
export const FP_PI_2 = fp.mul(FP_PI, fp.fromFloat(0.5));

// ──────────────────────────────────────────────
// atan2 – deterministic via LUT + linear
// interpolation on [0,1] + quadrant adjustment.
// ──────────────────────────────────────────────

const ATAN_STEPS = 16;
const ATAN_TABLE: number[] = [];

// Precompute once at module init.  Since Math.atan(x) for a given x is
// identical across every IEEE-754 engine, these constants are portable.
(function buildAtanLUT() {
  for (let i = 0; i <= ATAN_STEPS; i++) {
    ATAN_TABLE.push(fp.fromFloat(Math.atan(i / ATAN_STEPS)));
  }
})();

/**
 * Core atan for |z| ≤ 1, using a hardcoded LUT with linear interpolation.
 * Returns a fixed-point value in radians.
 */
function atanLUT(z: number): number {
  const neg = fp.lt(z, FP_0);
  const absZ = neg ? fp.negate(z) : z;

  if (fp.gte(absZ, FP_1)) {
    return (neg ? fp.negate(ATAN_TABLE[ATAN_STEPS]) : ATAN_TABLE[ATAN_STEPS]) as number;
  }

  const idxFP = fp.mul(absZ, fp.fromInt(ATAN_STEPS));
  const idx = fp.toInt(idxFP) as number;
  const fract = fp.sub(idxFP, fp.fromInt(idx));
  const lo = ATAN_TABLE[idx];
  const hi = ATAN_TABLE[Math.min(idx + 1, ATAN_STEPS)];

  const val = fp.add(lo, fp.mul(fract, fp.sub(hi, lo)));
  return (neg ? fp.negate(val) : val) as number;
}

/**
 * Deterministic atan for any input (full real line).
 *
 * Range reduction:  atan(z) = sign(z)·π/2 – atan(1/z)   for |z| > 1
 */
function fpAtan(z: number): number {
  if (fp.gt(fp.abs(z), FP_1)) {
    const sign = fp.lt(z, FP_0) ? fp.negate(FP_1) : FP_1;
    const recip = fp.div(FP_1, z);
    return fp.sub(fp.mul(sign, FP_PI_2), atanLUT(recip)) as number;
  }
  return atanLUT(z);
}

/**
 * Deterministic atan2(y, x).
 * Both arguments are fixed-point values; returns a regular number.
 */
export function fpAtan2(y: number, x: number): number {
  if (fp.eq(x, FP_0)) {
    if (fp.eq(y, FP_0)) return 0;
    return fp.toFloat(fp.gt(y, FP_0) ? FP_PI_2 : fp.negate(FP_PI_2));
  }

  if (fp.gt(x, FP_0)) {
    return fp.toFloat(fpAtan(fp.div(y, x)));
  }

  const a = fpAtan(fp.div(y, x));
  return fp.toFloat(fp.gte(y, FP_0) ? fp.add(a, FP_PI) : fp.sub(a, FP_PI));
}

// ──────────────────────────────────────────────
// hypot – sqrt(a² + b²)
// ──────────────────────────────────────────────

export function fpHypot(a: number, b: number): number {
  // Use BigInt directly to avoid 32-bit overflow when squaring large
  // fp-scaled values (e.g., distance across the 1200px arena).
  const shift = BigInt(fp.SHIFT);
  const sumSq = Number((BigInt(a) * BigInt(a) + BigInt(b) * BigInt(b)) >> shift);
  return fp.toFloat(fp.sqrt(sumSq));
}

/** Like fpHypot but returns an fp-scaled (Q16.16) value for use in fp chains. */
export function fpHypotFp(a: number, b: number): number {
  const shift = BigInt(fp.SHIFT);
  const sumSq = Number((BigInt(a) * BigInt(a) + BigInt(b) * BigInt(b)) >> shift);
  return fp.sqrt(sumSq);
}

// ──────────────────────────────────────────────
// Clamp / min / max
// ──────────────────────────────────────────────

export function fpClamp(v: number, lo: number, hi: number): number {
  if (fp.lt(v, lo)) return lo;
  if (fp.gt(v, hi)) return hi;
  return v;
}

export function fpMin(a: number, b: number): number {
  return fp.lt(a, b) ? a : b;
}

export function fpMax(a: number, b: number): number {
  return fp.gt(a, b) ? a : b;
}
