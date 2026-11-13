import type { GameState } from './types';

const MIX_A = 2654435761;
const MIX_B = 1597334677;
const MIX_C = 2246822507;
const MIX_D = 3266489909;
const SHIFT_A = 16;
const SHIFT_B = 13;
const SEED_A = 0xdeadbeef;
const SEED_B = 0x41c6ce57;
const HI_MASK = 2097151;
const LO_RANGE = 2 ** 32;
const HEX_RADIX = 16;
const HEX_WIDTH = 14;

/** cyrb53: 53-Bit-Hash eines Strings. */
function cyrb53(text: string): number {
  let h1 = SEED_A;
  let h2 = SEED_B;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, MIX_A);
    h2 = Math.imul(h2 ^ ch, MIX_B);
  }
  h1 = Math.imul(h1 ^ (h1 >>> SHIFT_A), MIX_C) ^ Math.imul(h2 ^ (h2 >>> SHIFT_B), MIX_D);
  h2 = Math.imul(h2 ^ (h2 >>> SHIFT_A), MIX_C) ^ Math.imul(h1 ^ (h1 >>> SHIFT_B), MIX_D);
  return (HI_MASK & h2) * LO_RANGE + (h1 >>> 0);
}

/**
 * Kanonischer Hash ohne history, powerUps, rng und hidden. `hidden` (Mystery-Fahrzeuge) ist reine
 * Darstellung: Es aendert keine Mechanik, und der Solver soll Zustaende, die sich nur darin
 * unterscheiden, nicht getrennt durchsuchen.
 */
export function hashState(state: GameState): string {
  const canonical = JSON.stringify([
    state.levelId,
    state.status,
    state.loseReason,
    state.moves,
    state.passengerIndex,
    state.passengers.slice(state.passengerIndex),
    state.vehicles.map((v) => [v.id, v.x, v.y, v.status, v.locked]),
    state.slots.map((s) => (s.kind === 'vehicle' ? [s.kind, s.vehicleId, s.filled] : [s.kind])),
  ]);
  return cyrb53(canonical).toString(HEX_RADIX).padStart(HEX_WIDTH, '0');
}
