// Vollstaendige Analyse eines Levels: memoisierte DFS ueber Engine-Zustaende (nur Tipp-Aktionen).
import { createGame, hashState, legalMoves, step } from '../engine';
import type { GameState } from '../engine';
import type { Level, ResolvedRules } from '../schema';
import type { AnalyzeOptions, FirstMoveInfo, LevelAnalysis } from './types';

export const SOLVER_VERSION = '1.0';

const DEFAULT_MAX_STATES = 2_000_000;
const DECIMALS = 1;

/** Ergebnis fuer einen Zustand. Alle Zaehlungen beziehen sich auf Tipp-Folgen ab diesem Zustand. */
export interface Node {
  wins: bigint;
  total: bigint;
  /** Siegwahrscheinlichkeit bei gleichverteilt zufaelligem legalem Tipp. */
  p: number;
  /** Minimale weitere Tipps bis zum Sieg (Infinity: keiner). */
  min: number;
  /** Erster Tipp einer kuerzesten Gewinnfolge. */
  best: string | null;
  terminal: boolean;
  /** Wegen Zustandslimit nicht vollstaendig bekannt. */
  unknown: boolean;
  /** Laengste weitere Tipp-Folge bis zur Niederlage (nur fuer tote Zustaende sinnvoll). */
  depth: number;
  kids?: Array<{ id: string; node: Node }>;
}

/** Zustand ohne Verlauf, damit step nicht mit der Tiefe teurer wird. */
function strip(state: GameState): GameState {
  return { ...state, history: [] };
}

export class Searcher {
  readonly memo = new Map<string, Node>();
  truncated = false;
  deadStates = 0;
  deadDepthSum = 0;

  constructor(
    private readonly rules: ResolvedRules,
    private readonly maxStates: number = DEFAULT_MAX_STATES,
  ) {}

  /** Wertet einen Zustand aus. `keepKids` merkt die Kinder (fuer Wurzel und Hinweis). */
  evaluate(state: GameState, keepKids = false): Node {
    const key = hashState(state);
    const cached = this.memo.get(key);
    if (cached && (!keepKids || cached.kids || cached.terminal)) return cached;

    if (state.status !== 'playing') {
      const won = state.status === 'won';
      const node: Node = {
        wins: won ? 1n : 0n,
        total: 1n,
        p: won ? 1 : 0,
        min: won ? 0 : Infinity,
        best: null,
        terminal: true,
        unknown: false,
        depth: 0,
      };
      this.memo.set(key, node);
      return node;
    }
    if (this.memo.size >= this.maxStates) {
      this.truncated = true;
      return {
        wins: 0n,
        total: 1n,
        p: 0,
        min: Infinity,
        best: null,
        terminal: false,
        unknown: true,
        depth: 0,
      };
    }

    const moves = legalMoves(state, this.rules);
    const kids: Array<{ id: string; node: Node }> = [];
    let wins = 0n;
    let total = 0n;
    let pSum = 0;
    let min = Infinity;
    let best: string | null = null;
    let unknown = false;
    let depth = 0;
    for (const id of moves) {
      const next = strip(step(state, { type: 'tapVehicle', vehicleId: id }, this.rules).state);
      const node = this.evaluate(next);
      kids.push({ id, node });
      wins += node.wins;
      total += node.total;
      pSum += node.p;
      unknown ||= node.unknown;
      if (node.min + 1 < min) {
        min = node.min + 1;
        best = id;
      }
      depth = Math.max(depth, node.depth + 1);
    }
    const result: Node = {
      wins,
      total,
      p: moves.length > 0 ? pSum / moves.length : 0,
      min,
      best,
      terminal: false,
      unknown,
      depth,
    };
    if (keepKids) result.kids = kids;
    if (wins === 0n && !unknown) {
      this.deadStates += 1;
      this.deadDepthSum += depth;
    }
    this.memo.set(key, result);
    return result;
  }
}

// ---------------------------------------------------------------------------------------------
// Schneller Pfad: kompakte Zustandsdarstellung statt Engine-step + hashState.
// Gilt nur fuer den Regelumfang, in dem die Engine gerade Fahrzeuge ohne Sonderregeln bewegt
// (straight/edges, firstFree, firstMatch, departOnFull, keine fixed/locked Elemente, kein Zuglimit).
// Die Zaehlweise (Reihenfolge, Zustandslimit, Summation) entspricht exakt der Referenz (Searcher).
// ---------------------------------------------------------------------------------------------

const MASK_BITS = 30;
const KEY_HALF = 16;
const KEY_HALF_MASK = 0xffff;
const FILL_SHIFT = 6;
const EMPTY_SLOT = -1;
const PLAYING = 0;
const WON = 1;
const LOST = 2;

const DIR_STEP: Record<string, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

interface FastState {
  /** Maske der geparkten Fahrzeuge (Index 0-29 / 30-59). */
  pl: number;
  ph: number;
  pi: number;
  /** Fahrzeugindex pro Slot oder -1. */
  sv: number[];
  sf: number[];
  status: number;
}

interface FastNode {
  wins: bigint;
  total: bigint;
  p: number;
  min: number;
  best: number;
  unknown: boolean;
  depth: number;
  kids?: Array<{ idx: number; node: FastNode }>;
}

interface FastModel {
  ids: string[];
  capacity: number[];
  color: number[];
  blockLo: number[];
  blockHi: number[];
  passengers: number[];
}

function buildFastModel(state: GameState, rules: ResolvedRules): FastModel | null {
  const supported =
    rules.movement.model === 'straight' &&
    rules.movement.exits === 'edges' &&
    rules.queue.fillPolicy === 'firstFree' &&
    rules.vehicles.departOnFull &&
    rules.passengers.order === 'strict' &&
    rules.passengers.boardPolicy === 'firstMatch' &&
    rules.limits.moves === null &&
    state.status === 'playing' &&
    state.vehicles.length <= 2 * MASK_BITS &&
    state.grid.cells.length === 0 &&
    state.vehicles.every((v) => !v.locked) &&
    state.slots.every((s) => s.kind !== 'locked');
  if (!supported) return null;

  const colorIds = new Map<string, number>();
  const colorOf = (c: string): number => {
    let id = colorIds.get(c);
    if (id === undefined) {
      id = colorIds.size;
      colorIds.set(c, id);
    }
    return id;
  };
  const index = new Map(state.vehicles.map((v, i) => [v.id, i]));
  const color = state.vehicles.map((v) => colorOf(v.color));
  for (const s of state.slots) {
    if (s.kind !== 'vehicle') continue;
    const i = index.get(s.vehicleId);
    const v = i === undefined ? undefined : state.vehicles[i];
    if (!v || v.status !== 'queued' || v.capacity !== s.capacity || v.color !== s.color)
      return null;
  }

  // Zellenbelegung je Fahrzeug und Blockademasken (statisch, da straight).
  const occupant = new Map<number, number>();
  const stride = state.grid.width + 1;
  const keyOf = (x: number, y: number): number => y * stride + x;
  state.vehicles.forEach((v, i) => {
    const [dx, dy] = DIR_STEP[v.dir]!;
    for (let k = 0; k < v.length; k++) occupant.set(keyOf(v.x - dx * k, v.y - dy * k), i);
  });
  const blockLo: number[] = [];
  const blockHi: number[] = [];
  state.vehicles.forEach((v, i) => {
    let lo = 0;
    let hi = 0;
    const [dx, dy] = DIR_STEP[v.dir]!;
    let x = v.x + dx;
    let y = v.y + dy;
    while (x >= 0 && y >= 0 && x < state.grid.width && y < state.grid.height) {
      const j = occupant.get(keyOf(x, y));
      if (j !== undefined && j !== i) {
        if (j < MASK_BITS) lo |= 1 << j;
        else hi |= 1 << (j - MASK_BITS);
      }
      x += dx;
      y += dy;
    }
    blockLo.push(lo);
    blockHi.push(hi);
  });

  return {
    ids: state.vehicles.map((v) => v.id),
    capacity: state.vehicles.map((v) => v.capacity),
    color,
    blockLo,
    blockHi,
    passengers: state.passengers.map(colorOf),
  };
}

function fastRoot(state: GameState): FastState {
  let pl = 0;
  let ph = 0;
  const index = new Map(state.vehicles.map((v, i) => [v.id, i]));
  state.vehicles.forEach((v, i) => {
    if (v.status !== 'parked') return;
    if (i < MASK_BITS) pl |= 1 << i;
    else ph |= 1 << (i - MASK_BITS);
  });
  return {
    pl,
    ph,
    pi: state.passengerIndex,
    sv: state.slots.map((s) => (s.kind === 'vehicle' ? index.get(s.vehicleId)! : EMPTY_SLOT)),
    sf: state.slots.map((s) => (s.kind === 'vehicle' ? s.filled : 0)),
    status: PLAYING,
  };
}

class FastSearcher {
  readonly memo = new Map<string, FastNode>();
  truncated = false;
  deadStates = 0;
  deadDepthSum = 0;

  constructor(
    private readonly m: FastModel,
    private readonly maxStates: number,
  ) {}

  private isParked(s: FastState, i: number): boolean {
    return i < MASK_BITS ? (s.pl & (1 << i)) !== 0 : (s.ph & (1 << (i - MASK_BITS))) !== 0;
  }

  private hasEmpty(s: FastState): boolean {
    return s.sv.includes(EMPTY_SLOT);
  }

  private tappable(s: FastState, i: number): boolean {
    return (
      this.isParked(s, i) && (s.pl & this.m.blockLo[i]!) === 0 && (s.ph & this.m.blockHi[i]!) === 0
    );
  }

  /** Antippbare Fahrzeuge in Fahrzeugreihenfolge (Zustand muss "playing" sein). */
  legal(s: FastState): number[] {
    if (!this.hasEmpty(s)) return [];
    const out: number[] = [];
    for (let i = 0; i < this.m.ids.length; i++) if (this.tappable(s, i)) out.push(i);
    return out;
  }

  /** Ein Zug samt Einsteigen und Ergebnisbewertung. */
  move(s: FastState, i: number): FastState {
    const m = this.m;
    const sv = s.sv.slice();
    const sf = s.sf.slice();
    let pl = s.pl;
    let ph = s.ph;
    let pi = s.pi;
    if (i < MASK_BITS) pl &= ~(1 << i);
    else ph &= ~(1 << (i - MASK_BITS));
    const slot = sv.indexOf(EMPTY_SLOT);
    sv[slot] = i;
    sf[slot] = 0;
    const n = m.passengers.length;
    while (pi < n) {
      const c = m.passengers[pi]!;
      let at = -1;
      for (let k = 0; k < sv.length; k++) {
        const v = sv[k]!;
        if (v !== EMPTY_SLOT && m.color[v] === c && sf[k]! < m.capacity[v]!) {
          at = k;
          break;
        }
      }
      if (at < 0) break;
      sf[at] = sf[at]! + 1;
      pi += 1;
      if (sf[at]! >= m.capacity[sv[at]!]!) {
        sv[at] = EMPTY_SLOT;
        sf[at] = 0;
      }
    }
    const next: FastState = { pl, ph, pi, sv, sf, status: PLAYING };
    if (pi >= n) next.status = WON;
    else if (!this.hasEmpty(next) || !this.anyTappable(next)) next.status = LOST;
    return next;
  }

  private anyTappable(s: FastState): boolean {
    for (let i = 0; i < this.m.ids.length; i++) if (this.tappable(s, i)) return true;
    return false;
  }

  private key(s: FastState): string {
    let k = String.fromCharCode(
      s.pi,
      s.pl & KEY_HALF_MASK,
      s.pl >>> KEY_HALF,
      s.ph & KEY_HALF_MASK,
      s.ph >>> KEY_HALF,
    );
    for (let i = 0; i < s.sv.length; i++) {
      k += String.fromCharCode((s.sv[i]! + 1) | (s.sf[i]! << FILL_SHIFT));
    }
    return k;
  }

  evaluate(s: FastState, keepKids = false): FastNode {
    return this.evaluateKeyed(this.key(s), s, keepKids);
  }

  private evaluateKeyed(key: string, state: FastState, keepKids: boolean): FastNode {
    const cached = this.memo.get(key);
    if (cached) return cached;

    if (state.status !== PLAYING) {
      const won = state.status === WON;
      const node: FastNode = {
        wins: won ? 1n : 0n,
        total: 1n,
        p: won ? 1 : 0,
        min: won ? 0 : Infinity,
        best: -1,
        unknown: false,
        depth: 0,
      };
      this.memo.set(key, node);
      return node;
    }
    if (this.memo.size >= this.maxStates) {
      this.truncated = true;
      return { wins: 0n, total: 1n, p: 0, min: Infinity, best: -1, unknown: true, depth: 0 };
    }

    const moves = this.legal(state);
    const kids: Array<{ idx: number; node: FastNode }> = [];
    let wins = 0n;
    let total = 0n;
    let pSum = 0;
    let min = Infinity;
    let best = -1;
    let unknown = false;
    let depth = 0;
    for (const idx of moves) {
      const node = this.evaluate(this.move(state, idx));
      if (keepKids) kids.push({ idx, node });
      wins += node.wins;
      total += node.total;
      pSum += node.p;
      unknown ||= node.unknown;
      if (node.min + 1 < min) {
        min = node.min + 1;
        best = idx;
      }
      depth = Math.max(depth, node.depth + 1);
    }
    const result: FastNode = {
      wins,
      total,
      p: moves.length > 0 ? pSum / moves.length : 0,
      min,
      best,
      unknown,
      depth,
    };
    if (keepKids) result.kids = kids;
    if (wins === 0n && !unknown) {
      this.deadStates += 1;
      this.deadDepthSum += depth;
    }
    this.memo.set(key, result);
    return result;
  }
}

export interface DifficultyInput {
  randomPlayWinProbability: number;
  deadStates: number;
  statesExplored: number;
  avgDeadEndDepth: number | null;
  colors: number;
  slots: number;
}

const W_LUCK = 0.4;
const W_DEAD = 0.25;
const W_DEPTH = 0.15;
const W_COLOR = 0.2;
const DEPTH_NORM = 6;
const MAX_DIFFICULTY = 10;
const MIN_DIFFICULTY = 1;

/**
 * Schwierigkeit 0-10 (1 = trivial).
 *   luck      = 1 - randomPlayWinProbability          (wie oft Zufallsspiel scheitert)
 *   dead      = deadStates / statesExplored           (Anteil der Sackgassen im Zustandsraum)
 *   depth     = min(1, avgDeadEndDepth / 6)           (Fehler werden erst spaet sichtbar)
 *   pressure  = min(1, (farben - 1) / slots)          (Farbdruck auf die Warteschlange)
 *   score     = 0.40 luck + 0.25 dead + 0.15 depth + 0.20 pressure   (0..1)
 *   difficulty = 1 + 9 * score, auf 1 Dezimale; unloesbar = 10.
 */
export function computeDifficulty(input: DifficultyInput): number {
  if (input.randomPlayWinProbability <= 0 && input.deadStates === 0) return MAX_DIFFICULTY;
  const luck = 1 - input.randomPlayWinProbability;
  const dead = input.statesExplored > 0 ? input.deadStates / input.statesExplored : 0;
  const depth = Math.min(1, (input.avgDeadEndDepth ?? 0) / DEPTH_NORM);
  const pressure = Math.min(1, Math.max(0, input.colors - 1) / Math.max(1, input.slots));
  const score = W_LUCK * luck + W_DEAD * dead + W_DEPTH * depth + W_COLOR * pressure;
  const raw = MIN_DIFFICULTY + (MAX_DIFFICULTY - MIN_DIFFICULTY) * score;
  const f = 10 ** DECIMALS;
  return Math.min(MAX_DIFFICULTY, Math.round(raw * f) / f);
}

function ratio(a: bigint, b: bigint): number {
  if (b === 0n) return 0;
  // Skaliert, damit grosse BigInts nicht ueber Number laufen.
  const scale = 1_000_000n;
  return Number((a * scale) / b) / Number(scale);
}

/** Wie viele Slots entlang der Loesung maximal belegt waren (direkt nach dem Ausfahren, vor dem Einsteigen). */
function maxQueueUsed(state: GameState, solution: string[], rules: ResolvedRules): number {
  let s = state;
  let max = 0;
  for (const id of solution) {
    const res = step(s, { type: 'tapVehicle', vehicleId: id }, rules);
    s = strip(res.state);
    const occupied = s.slots.filter((x) => x.kind === 'vehicle').length;
    const departed = res.events.filter((e) => e.type === 'vehicleDeparted').length;
    max = Math.max(max, occupied + departed);
  }
  return max;
}

function finish(
  state: GameState,
  rules: ResolvedRules,
  start: GameState,
  parts: {
    solvable: boolean;
    truncated: boolean;
    minRemaining: number;
    solution: string[];
    wins: bigint;
    total: bigint;
    p: number;
    firstMoves: FirstMoveInfo[];
    statesExplored: number;
    deadStates: number;
    deadDepthSum: number;
  },
): LevelAnalysis {
  const colors = new Set(state.passengers.slice(state.passengerIndex)).size;
  const avgDeadEndDepth = parts.deadStates > 0 ? parts.deadDepthSum / parts.deadStates : null;
  return {
    solvable: parts.solvable,
    truncated: parts.truncated,
    minMoves: parts.solvable ? parts.minRemaining + state.moves : null,
    solution: parts.solvable ? parts.solution : null,
    winningPaths: parts.wins.toString(),
    totalPaths: parts.total.toString(),
    winRate: ratio(parts.wins, parts.total),
    randomPlayWinProbability: parts.p,
    firstMoves: parts.firstMoves,
    statesExplored: parts.statesExplored,
    deadStates: parts.deadStates,
    avgDeadEndDepth,
    maxQueueUsedOnBestPath: parts.solvable ? maxQueueUsed(start, parts.solution, rules) : 0,
    difficulty: computeDifficulty({
      randomPlayWinProbability: parts.p,
      deadStates: parts.deadStates,
      statesExplored: parts.statesExplored,
      avgDeadEndDepth,
      colors,
      slots: rules.queue.slots,
    }),
  };
}

/** Referenzimplementierung ueber die Engine (langsam, fuer Sonderregeln und Regressionstests). */
export function analyzeStateReference(
  state: GameState,
  rules: ResolvedRules,
  opts: AnalyzeOptions = {},
): LevelAnalysis {
  const searcher = new Searcher(rules, opts.maxStates ?? DEFAULT_MAX_STATES);
  const start = strip(state);
  const root = searcher.evaluate(start, true);

  const solution: string[] = [];
  if (root.min !== Infinity) {
    let s = start;
    for (;;) {
      const node = searcher.evaluate(s);
      if (node.terminal || node.best === null) break;
      solution.push(node.best);
      s = strip(step(s, { type: 'tapVehicle', vehicleId: node.best }, rules).state);
    }
  }
  return finish(state, rules, start, {
    solvable: root.min !== Infinity,
    truncated: searcher.truncated,
    minRemaining: root.min,
    solution,
    wins: root.wins,
    total: root.total,
    p: root.p,
    firstMoves: (root.kids ?? []).map(({ id, node }) => ({
      vehicleId: id,
      winningPaths: node.wins.toString(),
      totalPaths: node.total.toString(),
      deadEnd: node.wins === 0n && !node.unknown,
    })),
    statesExplored: searcher.memo.size,
    deadStates: searcher.deadStates,
    deadDepthSum: searcher.deadDepthSum,
  });
}

/** Analysiert einen beliebigen Spielzustand (auch mitten im Spiel). */
export function analyzeState(
  state: GameState,
  rules: ResolvedRules,
  opts: AnalyzeOptions = {},
): LevelAnalysis {
  const model = buildFastModel(state, rules);
  if (!model) return analyzeStateReference(state, rules, opts);
  const searcher = new FastSearcher(model, opts.maxStates ?? DEFAULT_MAX_STATES);
  const start = strip(state);
  const rootState = fastRoot(state);
  const root = searcher.evaluate(rootState, true);

  const solution: string[] = [];
  if (root.min !== Infinity) {
    let s = rootState;
    for (;;) {
      const node = searcher.evaluate(s);
      if (s.status !== PLAYING || node.best < 0) break;
      solution.push(model.ids[node.best]!);
      s = searcher.move(s, node.best);
    }
  }
  return finish(state, rules, start, {
    solvable: root.min !== Infinity,
    truncated: searcher.truncated,
    minRemaining: root.min,
    solution,
    wins: root.wins,
    total: root.total,
    p: root.p,
    firstMoves: (root.kids ?? []).map(({ idx, node }) => ({
      vehicleId: model.ids[idx]!,
      winningPaths: node.wins.toString(),
      totalPaths: node.total.toString(),
      deadEnd: node.wins === 0n && !node.unknown,
    })),
    statesExplored: searcher.memo.size,
    deadStates: searcher.deadStates,
    deadDepthSum: searcher.deadDepthSum,
  });
}

/** Analysiert ein Level ab dem Startzustand. */
export function analyze(
  level: Level,
  rules: ResolvedRules,
  opts: AnalyzeOptions = {},
): LevelAnalysis {
  return analyzeState(createGame(level, rules), rules, opts);
}
