// mulberry32: kleiner, seedbarer PRNG. Der Zustand ist eine uint32-Zahl (JSON-serialisierbar).
const INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 0x100000000;
const MIX_SHIFT_A = 15;
const MIX_SHIFT_B = 7;
const MIX_SHIFT_C = 14;
const MIX_OR_A = 1;
const MIX_OR_B = 61;

export function createRng(seed: number): number {
  return seed >>> 0;
}

/** Liefert einen Wert in [0, 1) und den Folgezustand. */
export function nextRandom(rng: number): [value: number, next: number] {
  const next = (rng + INCREMENT) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> MIX_SHIFT_A), t | MIX_OR_A);
  t ^= t + Math.imul(t ^ (t >>> MIX_SHIFT_B), t | MIX_OR_B);
  const value = ((t ^ (t >>> MIX_SHIFT_C)) >>> 0) / UINT32_RANGE;
  return [value, next];
}
