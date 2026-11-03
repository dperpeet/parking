// Poller und Schluessel fuer den Generator (Welt 2). Zieht nur dann Zufall, wenn etwas gesetzt ist,
// damit Level ohne Poller/Schluessel byte-gleich zu frueher bleiben.
import { nextRandom } from '../engine';
import type { Dir } from '../schema';

export interface Rng {
  state: number;
}

export type Pos = [number, number];
export type Count = number | [number, number];

export function rand(r: Rng): number {
  const [v, next] = nextRandom(r.state);
  r.state = next;
  return v;
}

export function randInt(r: Rng, n: number): number {
  return Math.floor(rand(r) * n);
}

export function pick<T>(r: Rng, items: T[]): T {
  return items[randInt(r, items.length)]!;
}

export const DEFAULT_KEY_CHAIN_DEPTH = 1;
/** Zellen-Schluessel fuer Mengen; Raster sind hoechstens 12 breit. */
const CELL_KEY_STRIDE = 64;

/** Das, was Poller- und Schluessel-Logik von einem platzierten Fahrzeug braucht. */
export interface SpecialVehicle {
  dir: Dir;
  cells: Pos[];
  path: Pos[];
}

/** Loest Zahl oder Bereich [min, max] auf; zieht nur bei echtem Bereich Zufall. */
export function resolveCount(r: Rng, c: Count | undefined): number {
  if (c === undefined) return 0;
  if (typeof c === 'number') return Math.max(0, Math.floor(c));
  const lo = Math.max(0, Math.floor(Math.min(c[0], c[1])));
  const hi = Math.max(0, Math.floor(Math.max(c[0], c[1])));
  return hi > lo ? lo + randInt(r, hi - lo + 1) : lo;
}

/** `count` verschiedene zufaellige Zellen. */
export function chooseBollards(r: Rng, width: number, height: number, count: number): Pos[] {
  const free: Pos[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) free.push([x, y]);
  const out: Pos[] = [];
  for (let i = 0; i < count && free.length > 0; i++) {
    out.push(free.splice(randInt(r, free.length), 1)[0]!);
  }
  return out;
}

/** Mindestens ein Poller steht in der Zeile/Spalte (Achse) eines Fahrzeugs. */
export function bollardHasRole(bollards: Pos[], vehicles: SpecialVehicle[]): boolean {
  if (bollards.length === 0) return true;
  return bollards.some(([bx, by]) =>
    vehicles.some((v) => {
      const [hx, hy] = v.cells[0]!;
      return v.dir === 'E' || v.dir === 'W' ? hy === by : hx === bx;
    }),
  );
}

/**
 * Waehlt `count` Sperren: Index = Ausfahr-Reihenfolge. Das Schloss L bekommt einen Schluessel K mit
 * maxBlocker(L) < K < L: der Weg von L waere vor K frei (Sperre relevant), K faehrt vor L aus
 * (azyklisch). Kettenlaenge (Schloss -> Schluessel -> ...) hoechstens `maxDepth`.
 * Liefert je Schloss-Index den Schluessel-Index oder null, wenn nicht genug Paare existieren.
 */
export function assignKeys(
  r: Rng,
  vehicles: SpecialVehicle[],
  count: number,
  maxDepth: number,
): Map<number, number> | null {
  const maxBlocker = vehicles.map((v, i) => {
    const path = new Set(v.path.map(([x, y]) => y * CELL_KEY_STRIDE + x));
    let m = -1;
    vehicles.forEach((o, j) => {
      if (j !== i && o.cells.some(([x, y]) => path.has(y * CELL_KEY_STRIDE + x))) {
        m = Math.max(m, j);
      }
    });
    return m;
  });
  const keyOf = new Map<number, number>();
  const depth = (i: number): number => (keyOf.has(i) ? 1 + depth(keyOf.get(i)!) : 0);
  /** Laengste Kette oberhalb von i (Schloesser, deren Schluessel-Kette bei i ankommt). */
  const above = (i: number): number => {
    let m = 0;
    keyOf.forEach((k, lock) => {
      if (k === i) m = Math.max(m, 1 + above(lock));
    });
    return m;
  };
  for (let n = 0; n < count; n++) {
    const pairs: Array<[number, number]> = [];
    for (let l = 0; l < vehicles.length; l++) {
      if (keyOf.has(l)) continue;
      const up = above(l);
      for (let k = maxBlocker[l]! + 1; k < l; k++) {
        if (up + 1 + depth(k) <= maxDepth) pairs.push([l, k]);
      }
    }
    if (pairs.length === 0) return null;
    const [l, k] = pick(r, pairs);
    keyOf.set(l, k);
  }
  return keyOf;
}
