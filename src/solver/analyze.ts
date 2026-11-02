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

/** Analysiert einen beliebigen Spielzustand (auch mitten im Spiel). */
export function analyzeState(
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

  const firstMoves: FirstMoveInfo[] = (root.kids ?? []).map(({ id, node }) => ({
    vehicleId: id,
    winningPaths: node.wins.toString(),
    totalPaths: node.total.toString(),
    deadEnd: node.wins === 0n && !node.unknown,
  }));

  const colors = new Set(state.passengers.slice(state.passengerIndex)).size;
  const avgDeadEndDepth =
    searcher.deadStates > 0 ? searcher.deadDepthSum / searcher.deadStates : null;
  const statesExplored = searcher.memo.size;
  const randomPlayWinProbability = root.p;
  return {
    solvable: root.min !== Infinity,
    truncated: searcher.truncated,
    minMoves: root.min === Infinity ? null : root.min + state.moves,
    solution: root.min === Infinity ? null : solution,
    winningPaths: root.wins.toString(),
    totalPaths: root.total.toString(),
    winRate: ratio(root.wins, root.total),
    randomPlayWinProbability,
    firstMoves,
    statesExplored,
    deadStates: searcher.deadStates,
    avgDeadEndDepth,
    maxQueueUsedOnBestPath: root.min === Infinity ? 0 : maxQueueUsed(start, solution, rules),
    difficulty: computeDifficulty({
      randomPlayWinProbability,
      deadStates: searcher.deadStates,
      statesExplored,
      avgDeadEndDepth,
      colors,
      slots: rules.queue.slots,
    }),
  };
}

/** Analysiert ein Level ab dem Startzustand. */
export function analyze(
  level: Level,
  rules: ResolvedRules,
  opts: AnalyzeOptions = {},
): LevelAnalysis {
  return analyzeState(createGame(level, rules), rules, opts);
}
