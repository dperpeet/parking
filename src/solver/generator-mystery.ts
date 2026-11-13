// Mystery-Fahrzeuge fuer den Generator: Auswahl verdeckt startender Fahrzeuge (spaet aufgedeckte bevorzugt)
// und Fairness-Filter per blinder Playouts. Siehe docs/DESIGN.md (Generator, Mystery-Fahrzeuge).
import { createGame, step } from '../engine';
import type { Action } from '../engine';
import type { Level, ResolvedRules } from '../schema';
import { blindWinRate } from './blind';
import type { BlindResult } from './blind';
import { rand, randInt } from './generator-special';
import type { Rng } from './generator-special';

/** Zahl verschiedener Mystery-Auswahlen, die pro Kandidat geprueft werden. */
export const MYSTERY_SUBSET_TRIES = 4;
/** Default fuer `mysteryMinBlindWin`. */
export const DEFAULT_MYSTERY_MIN_BLIND_WIN = 0.25;

const HONK_PREFIX = 'honk:';

/**
 * Verdeckt startende Fahrzeuge (Weg anfangs blockiert) mit dem Schritt der Loesung, nach dem sie
 * aufgedeckt werden (1 = nach der ersten Aktion). Reihenfolge wie `level.vehicles`.
 * Erfordert `special.mysteryVehicles` in `rules`.
 */
export function revealSchedule(
  level: Level,
  rules: ResolvedRules,
  solution: string[],
): Array<{ id: string; step: number }> {
  const all: Level = { ...level, vehicles: level.vehicles.map((v) => ({ ...v, mystery: true })) };
  let s = createGame(all, rules);
  const when = new Map<string, number>();
  const hidden = s.vehicles.filter((v) => v.hidden).map((v) => v.id);
  solution.forEach((move, i) => {
    const action: Action = move.startsWith(HONK_PREFIX)
      ? { type: 'usePowerUp', powerUp: 'honk', vehicleId: move.slice(HONK_PREFIX.length) }
      : { type: 'tapVehicle', vehicleId: move };
    const res = step(s, action, rules);
    for (const e of res.events) if (e.type === 'vehicleRevealed') when.set(e.vehicleId, i + 1);
    s = res.state;
  });
  // In einer Gewinnfolge faehrt jedes Fahrzeug aus und wird vorher aufgedeckt.
  return hidden.map((id) => ({ id, step: when.get(id) ?? solution.length }));
}

/**
 * Bis zu MYSTERY_SUBSET_TRIES verschiedene Auswahlen aus `count` Fahrzeugen: zuerst die am spaetesten
 * aufgedeckten (Gleichstand per Seed), danach gewichtete Ziehungen (Gewicht = Aufdeck-Schritt).
 * Leer, wenn weniger als `count` Kandidaten existieren.
 */
export function mysterySubsets(
  r: Rng,
  schedule: Array<{ id: string; step: number }>,
  count: number,
): string[][] {
  if (count <= 0 || schedule.length < count) return [];
  const tie = schedule.map(() => rand(r));
  const order = schedule
    .map((c, i) => ({ ...c, tie: tie[i]! }))
    .sort((a, b) => b.step - a.step || a.tie - b.tie);
  const out: string[][] = [];
  const seen = new Set<string>();
  const add = (ids: string[]): void => {
    const sorted = [...ids].sort();
    const k = sorted.join(',');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(sorted);
    }
  };
  add(order.slice(0, count).map((c) => c.id));
  for (let t = 1; t < MYSTERY_SUBSET_TRIES; t++) {
    const pool = [...order];
    const chosen: string[] = [];
    while (chosen.length < count) {
      const total = pool.reduce((a, c) => a + c.step, 0);
      let x = rand(r) * total;
      let idx = pool.findIndex((c) => (x -= c.step) < 0);
      if (idx < 0) idx = randInt(r, pool.length);
      chosen.push(pool.splice(idx, 1)[0]!.id);
    }
    add(chosen);
  }
  return out;
}

export function withMystery(level: Level, ids: readonly string[]): Level {
  const set = new Set(ids);
  return {
    ...level,
    vehicles: level.vehicles.map((v) => (set.has(v.id) ? { ...v, mystery: true } : v)),
  };
}

export interface MysteryPick {
  level: Level;
  ids: string[];
  blind: BlindResult;
  /** blindWin >= minBlindWin. */
  fair: boolean;
}

/**
 * Markiert `count` Mystery-Fahrzeuge: erste Auswahl, die den Fairness-Filter besteht, sonst die mit der
 * hoechsten blinden Siegquote (fair = false). null ohne genug verdeckt startende Fahrzeuge.
 */
export function applyMystery(
  r: Rng,
  level: Level,
  rules: ResolvedRules,
  solution: string[],
  count: number,
  minBlindWin: number,
  playouts?: number,
): MysteryPick | null {
  const subsets = mysterySubsets(r, revealSchedule(level, rules, solution), count);
  if (subsets.length === 0) return null;
  const opts = playouts === undefined ? {} : { playouts };
  // Die informierte Quote haengt nicht von der Auswahl ab (alle Farben bekannt).
  const informedWin = blindWinRate(level, rules, { ...opts, informed: true });
  let best: MysteryPick | null = null;
  for (const ids of subsets) {
    const marked = withMystery(level, ids);
    const blindWin = blindWinRate(marked, rules, opts);
    const fair = blindWin >= minBlindWin;
    if (!best || blindWin > best.blind.blindWin) {
      best = { level: marked, ids, blind: { blindWin, informedWin }, fair };
    }
    if (fair) break;
  }
  return best;
}
