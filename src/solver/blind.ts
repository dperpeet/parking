// "Blinde" Spieler-Playouts fuer Mystery-Level: Ein einfacher, gieriger Spieler, der nur sieht, was die
// Oberflaeche zeigt (aufgedeckte Farben, sichtbare Fahrgaeste, Warteschlange). Deterministisch per Seed.
// Siehe docs/DESIGN.md (Generator, Mystery-Fahrzeuge).
import { createGame, createRng, legalMoves, nextRandom, step } from '../engine';
import type { GameState, VehicleState } from '../engine';
import { cellKey, exitPath, fixedCells, parkedOccupancy } from '../engine/geometry';
import type { Level, ResolvedRules } from '../schema';

/** Playouts pro Bewertung (Default). */
export const DEFAULT_BLIND_PLAYOUTS = 64;
/** Fester Default-Seed, damit Generator und Werkzeuge dieselben Zahlen liefern. */
export const DEFAULT_BLIND_SEED = 1;
/** Anteil zufaelliger Zuege (menschliche Fehler, Ausprobieren). */
export const BLIND_EPSILON = 0.2;

/** Gewichte der Zugbewertung. */
const W_FRONT = 4;
const W_WINDOW = 2;
const W_UNBLOCK = 1;
/** Wert einer unbekannten (verdeckten) Farbe beim Freiraeumen: Muenzwurf. */
const UNKNOWN_MATCH = 0.5;
/** Abzug fuer ein unpassendes Fahrzeug, das die vorletzte freie Halteposition belegt. */
const W_WASTE = 3;
const WASTE_FREE_SLOTS = 1;
/** Obergrenze fuer Aktionen pro Playout (Schutz, jeder Zug entfernt ein Fahrzeug). */
const MAX_STEPS_PER_VEHICLE = 2;

export interface BlindOptions {
  playouts?: number;
  seed?: number;
  /** true: alle Farben bekannt (Vergleichswert ohne Mystery-Verdeckung). */
  informed?: boolean;
}

export interface BlindResult {
  /** Siegquote des Spielers, der nur aufgedeckte Farben kennt. */
  blindWin: number;
  /** Siegquote desselben Spielers mit voller Information (gleiche Seeds). */
  informedWin: number;
}

interface Rng {
  state: number;
}

function rand(r: Rng): number {
  const [v, next] = nextRandom(r.state);
  r.state = next;
  return v;
}

/** Fahrzeuge, die nur noch von `blocker` aufgehalten werden (kein anderes Hindernis auf dem Weg). */
function freedBy(s: GameState, blocker: VehicleState): VehicleState[] {
  const occupancy = parkedOccupancy(s);
  const fixed = fixedCells(s.grid);
  return s.vehicles.filter((u) => {
    if (u.status !== 'parked' || u.id === blocker.id) return false;
    const exit = exitPath(u, s.grid);
    if (exit.wrongWay !== null || exit.loop) return false;
    let hit = false;
    for (const [x, y] of exit.path) {
      const k = cellKey(x, y);
      if (fixed.has(k)) return false;
      const owner = occupancy.get(k);
      if (owner === undefined) continue;
      if (owner !== blocker.id) return false;
      hit = true;
    }
    return hit;
  });
}

/** Bewertung eines Tipps aus Spielersicht (nur sichtbare Information, ausser `informed`). */
function score(s: GameState, v: VehicleState, rules: ResolvedRules, informed: boolean): number {
  const window = s.passengers.slice(s.passengerIndex, s.passengerIndex + rules.passengers.visible);
  const waitingSeats = (color: string): number =>
    s.slots.reduce(
      (a, sl) => a + (sl.kind === 'vehicle' && sl.color === color ? sl.capacity - sl.filled : 0),
      0,
    );
  const demand = (color: string): number =>
    Math.max(0, window.filter((c) => c === color).length - waitingSeats(color));
  let total = 0;
  const own = demand(v.color);
  if (window[0] === v.color && waitingSeats(v.color) === 0) total += W_FRONT;
  total += (W_WINDOW * Math.min(own, v.capacity)) / v.capacity;
  for (const u of freedBy(s, v)) {
    const known = informed || !u.hidden;
    total += W_UNBLOCK * (known ? (demand(u.color) > 0 ? 1 : 0) : UNKNOWN_MATCH);
  }
  const free = s.slots.filter((sl) => sl.kind === 'empty').length;
  if (own === 0 && free - 1 <= WASTE_FREE_SLOTS) total -= W_WASTE;
  return total;
}

/** Waehlt einen Zug: mit BLIND_EPSILON zufaellig, sonst bestbewertet (Gleichstand zufaellig). */
function choose(
  s: GameState,
  moves: string[],
  rules: ResolvedRules,
  informed: boolean,
  r: Rng,
): string {
  if (rand(r) < BLIND_EPSILON) return moves[Math.floor(rand(r) * moves.length)]!;
  let best: string[] = [];
  let bestScore = -Infinity;
  for (const id of moves) {
    const v = s.vehicles.find((o) => o.id === id)!;
    const sc = score(s, v, rules, informed);
    if (sc > bestScore) {
      bestScore = sc;
      best = [id];
    } else if (sc === bestScore) best.push(id);
  }
  return best[Math.floor(rand(r) * best.length)]!;
}

/** Ohne antippbares Fahrzeug: Hupe mit dem ersten (zufaellig gemischten) Fahrzeug, bei dem sie wirkt. */
function tryHonk(s: GameState, rules: ResolvedRules, r: Rng): GameState | null {
  if (s.powerUps.honk <= 0 || s.loseReason !== 'noMoves') return null;
  const ids = s.vehicles.filter((v) => v.status === 'parked').map((v) => v.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand(r) * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  for (const vehicleId of ids) {
    const res = step(s, { type: 'usePowerUp', powerUp: 'honk', vehicleId }, rules);
    if (!res.events.some((e) => e.type === 'invalidAction')) return res.state;
  }
  return null;
}

function playout(level: Level, rules: ResolvedRules, informed: boolean, r: Rng): boolean {
  let s = createGame(level, rules);
  const limit = level.vehicles.length * MAX_STEPS_PER_VEHICLE + rules.powerups.honk.uses;
  for (let n = 0; n < limit; n++) {
    if (s.status === 'won') return true;
    if (s.status === 'lost') {
      const honked = tryHonk(s, rules, r);
      if (!honked) return false;
      s = honked;
      continue;
    }
    const moves = legalMoves(s, rules);
    if (moves.length === 0) return false;
    s = step(
      s,
      { type: 'tapVehicle', vehicleId: choose(s, moves, rules, informed, r) },
      rules,
    ).state;
  }
  return s.status === 'won';
}

/** Siegquote des gierigen Spielers ueber `playouts` Durchgaenge (Default: nur sichtbare Information). */
export function blindWinRate(level: Level, rules: ResolvedRules, opts: BlindOptions = {}): number {
  const playouts = opts.playouts ?? DEFAULT_BLIND_PLAYOUTS;
  const r: Rng = { state: createRng(opts.seed ?? DEFAULT_BLIND_SEED) };
  let wins = 0;
  for (let i = 0; i < playouts; i++) if (playout(level, rules, opts.informed === true, r)) wins++;
  return playouts > 0 ? wins / playouts : 0;
}

/** Blinde und informierte Siegquote mit denselben Seeds. */
export function blindAnalysis(
  level: Level,
  rules: ResolvedRules,
  opts: Omit<BlindOptions, 'informed'> = {},
): BlindResult {
  return {
    blindWin: blindWinRate(level, rules, opts),
    informedWin: blindWinRate(level, rules, { ...opts, informed: true }),
  };
}
