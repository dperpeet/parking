// Seed-deterministischer Level-Generator (Rueckwaerts-Konstruktion, siehe docs/DESIGN.md).
import { createRng, nextRandom, validateLevel } from '../engine';
import { cellKey } from '../engine/geometry';
import type { Dir, Level, ResolvedRules } from '../schema';
import { Level as LevelSchema } from '../schema';
import { SOLVER_VERSION, analyze } from './analyze';
import { applyHonkLayout, honkPlanHolds } from './generator-honk';
import type { HonkPlan } from './generator-honk';
import { DEFAULT_MYSTERY_MIN_BLIND_WIN, applyMystery } from './generator-mystery';
import { arrowCells, arrowsHaveRole, chooseArrows, traceExit } from './generator-oneway';
import type { ArrowLayout } from './generator-oneway';
import {
  DEFAULT_KEY_CHAIN_DEPTH,
  assignKeys,
  bollardHasRole,
  chooseBollards,
  pick,
  rand,
  randInt,
  resolveCount,
} from './generator-special';
import type { Pos, Rng } from './generator-special';
import type {
  GenerateResult,
  GeneratorOptions,
  GeneratorTuning,
  LevelAnalysis,
  MysteryInfo,
} from './types';

const DEFAULT_MAX_ATTEMPTS = 40;
/** Zustandslimit pro Versuch: groessere Level gelten als zu teuer zu pruefen und werden verworfen. */
const DEFAULT_MAX_STATES = 20_000;
const DEFAULT_SHUFFLE_WINDOW = 3;
const DEFAULT_BLOCKINESS = 0.7;
const TRIVIAL_WIN_PROBABILITY = 0.9;
const TRIVIAL_ALLOWED_BELOW = 1.5;
/** Trivial wirkende Level gewinnen nur, wenn nichts anderes uebrig bleibt. */
const TRIVIAL_PENALTY = 100;
/** Aufschlag auf den Zielabstand, wenn preferDeadEnds nicht erfuellt ist (groesser als jede Toleranz). */
const SOFT_PENALTY = 50;
/** Aufschlag, wenn der Mystery-Fairness-Filter nicht erfuellt ist (schwerer als jede andere Strafe). */
const FAIRNESS_PENALTY = 200;
/** Trennt den Mystery-Zufall vom Zufall der Konstruktion (Level ohne Mystery bleiben bitgleich). */
const MYSTERY_SALT = 0x6d797374;
/** Trennt den Zufall der Abbiegepfeile ab (Level ohne Pfeile bleiben bitgleich). */
const ONE_WAY_SALT = 0x6f6e6577;
/** Mit Pfeilen werden abbiegende Wege bevorzugt: Sie zaehlen bei der Platzierung wie eine Blockade mehr. */
const TURN_BONUS = 1;
const SEED_MIX = 0x9e3779b1;
const UINT32_RANGE = 0x100000000;
const MIN_SHUFFLE = 1;
/** Standardgewichte nach Fahrzeuglaenge: kurze Fahrzeuge bevorzugt, damit das Raster nicht zuwaechst. */
const DEFAULT_LENGTH_WEIGHT_BASE = 3;

const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
const STEP: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

function weightedPick<T>(r: Rng, items: Array<[T, number]>): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = rand(r) * total;
  for (const [item, w] of items) {
    x -= w;
    if (x < 0) return item;
  }
  return items[items.length - 1]![0];
}

function shuffleInPlace<T>(r: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Leitet den Seed eines Versuchs deterministisch aus dem Basis-Seed ab. */
export function deriveSeed(seed: number, attempt: number): number {
  const [v] = nextRandom(createRng((seed ^ Math.imul(attempt + 1, SEED_MIX)) >>> 0));
  return Math.floor(v * UINT32_RANGE);
}

interface Placed {
  id: string;
  type: string;
  color: string;
  head: [number, number];
  dir: Dir;
  cells: Array<[number, number]>;
  path: Array<[number, number]>;
}

const key = (x: number, y: number): number => y * 64 + x;

function footprint(
  head: [number, number],
  dir: Dir,
  length: number,
): { cells: Array<[number, number]>; path: Array<[number, number]> } {
  const [dx, dy] = STEP[dir];
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < length; i++) cells.push([head[0] - dx * i, head[1] - dy * i]);
  return { cells, path: [] };
}

function pathOf(head: [number, number], dir: Dir, w: number, h: number): Array<[number, number]> {
  const [dx, dy] = STEP[dir];
  const path: Array<[number, number]> = [];
  let x = head[0] + dx;
  let y = head[1] + dy;
  while (x >= 0 && y >= 0 && x < w && y < h) {
    path.push([x, y]);
    x += dx;
    y += dy;
  }
  return path;
}

/**
 * Gebogener Weg einer Kandidatenposition oder null, wenn sie auf einem Pfeil steht, falsch faehrt, in einer
 * Schleife landet, ueber die eigenen Zellen fuehrt oder mehr als `maxTurns` Knicke hat.
 */
function bentPath(
  layout: ArrowLayout,
  head: [number, number],
  dir: Dir,
  cells: Array<[number, number]>,
): { path: Array<[number, number]>; turns: number } | null {
  if (cells.some(([cx, cy]) => layout.keys.has(cellKey(cx, cy)))) return null;
  const t = traceExit(layout, head, dir);
  if (!t || t.turns > layout.maxTurns) return null;
  const own = new Set(cells.map(([cx, cy]) => key(cx, cy)));
  return t.path.some(([cx, cy]) => own.has(key(cx, cy))) ? null : t;
}

/** Platziert Fahrzeuge in umgekehrter Ausfahr-Reihenfolge; null, wenn das Raster nicht reicht. */
function placeVehicles(
  p: GeneratorOptions,
  rules: ResolvedRules,
  r: Rng,
  types: string[],
  colors: string[],
  bollards: Pos[],
  layout: ArrowLayout | null,
): Placed[] | null {
  const n = types.length;
  const blockiness = p.blockiness ?? DEFAULT_BLOCKINESS;
  const placed: Placed[] = [];
  const occupied = new Set<number>(bollards.map(([bx, by]) => key(bx, by)));
  const paths: Array<Set<number>> = [];

  for (let k = n - 1; k >= 0; k--) {
    let type = types[k]!;
    let chosen: Placed | null = null;
    // Zu grosse Typen faellt man auf kleinere zurueck.
    const fallbacks = Object.keys(rules.vehicles.types).sort(
      (a, b) => rules.vehicles.types[a]!.length - rules.vehicles.types[b]!.length,
    );
    const tryTypes = [type, ...fallbacks.filter((t) => t !== type)];
    for (const t of tryTypes) {
      const length = rules.vehicles.types[t]!.length;
      const cands: Array<{ pl: Placed; score: number }> = [];
      for (const dir of DIRS) {
        for (let y = 0; y < p.height; y++) {
          for (let x = 0; x < p.width; x++) {
            const head: [number, number] = [x, y];
            const { cells } = footprint(head, dir, length);
            if (cells.some(([cx, cy]) => cx < 0 || cy < 0 || cx >= p.width || cy >= p.height)) {
              continue;
            }
            if (cells.some(([cx, cy]) => occupied.has(key(cx, cy)))) continue;
            const bent = layout ? bentPath(layout, head, dir, cells) : null;
            if (layout && !bent) continue;
            const path = bent?.path ?? pathOf(head, dir, p.width, p.height);
            // Der eigene Weg darf nur von frueher ausfahrenden (spaeter platzierten) Fahrzeugen blockiert sein.
            if (path.some(([cx, cy]) => occupied.has(key(cx, cy)))) continue;
            let score = bent && bent.turns > 0 ? TURN_BONUS : 0;
            for (const set of paths) if (cells.some(([cx, cy]) => set.has(key(cx, cy)))) score += 1;
            cands.push({
              pl: { id: `v${k + 1}`, type: t, color: colors[k]!, head, dir, cells, path },
              score,
            });
          }
        }
      }
      if (cands.length === 0) continue;
      const maxScore = Math.max(...cands.map((c) => c.score));
      const pool =
        rand(r) < blockiness && maxScore > 0 ? cands.filter((c) => c.score === maxScore) : cands;
      chosen = pick(r, pool).pl;
      type = t;
      break;
    }
    if (!chosen) return null;
    placed.push(chosen);
    for (const [cx, cy] of chosen.cells) occupied.add(key(cx, cy));
    paths.push(new Set(chosen.path.map(([cx, cy]) => key(cx, cy))));
  }
  return placed.reverse();
}

/** Fahrgast-Folge aus der geplanten Ausfahr-Reihenfolge, gemischt ueber ein Fenster von `window` Fahrzeugen. */
function buildPassengers(
  r: Rng,
  vehicles: Placed[],
  rules: ResolvedRules,
  window: number,
): string[] {
  const remaining = vehicles.map((v) => ({
    color: v.color,
    left: rules.vehicles.types[v.type]!.capacity,
  }));
  const out: string[] = [];
  for (;;) {
    const open = remaining.filter((v) => v.left > 0).slice(0, window);
    if (open.length === 0) return out;
    const v = pick(r, open);
    v.left -= 1;
    out.push(v.color);
  }
}

function hasDeadEnds(a: LevelAnalysis, p: GeneratorTuning): boolean {
  return a.deadStates > 0 && (a.avgDeadEndDepth ?? 0) >= (p.minDeadEndDepth ?? 0);
}

function isTrivial(a: LevelAnalysis, target?: [number, number]): boolean {
  if (a.randomPlayWinProbability <= TRIVIAL_WIN_PROBABILITY) return false;
  return target === undefined || target[0] >= TRIVIAL_ALLOWED_BELOW;
}

/** `overrides` fuers Level aus slots/visiblePassengers (leer, wenn nichts gesetzt ist). */
function overridesFor(p: GeneratorTuning): Pick<Level, 'overrides'> {
  const overrides: NonNullable<Level['overrides']> = {};
  if (p.slots !== undefined) overrides.queue = { slots: p.slots };
  if (p.visiblePassengers !== undefined) overrides.passengers = { visible: p.visiblePassengers };
  return Object.keys(overrides).length > 0 ? { overrides } : {};
}

/** Regeln mit den Tuning-Overrides (entspricht resolveRules(ruleset, level.overrides)). */
function effectiveRules(rules: ResolvedRules, p: GeneratorTuning): ResolvedRules {
  return {
    ...rules,
    queue: { ...rules.queue, ...(p.slots !== undefined ? { slots: p.slots } : {}) },
    passengers: {
      ...rules.passengers,
      ...(p.visiblePassengers !== undefined ? { visible: p.visiblePassengers } : {}),
    },
  };
}

/** Pfeile aus eigenem Zufall; null ohne Pfeile (Zahl 0), undefined, wenn sie nicht passen. */
function arrowsFor(
  p: GeneratorOptions,
  attemptSeed: number,
  bollards: Pos[],
): ArrowLayout | null | undefined {
  const ar: Rng = { state: createRng((attemptSeed ^ ONE_WAY_SALT) >>> 0) };
  const count = resolveCount(ar, p.oneWay);
  if (count === 0) return null;
  const layout = chooseArrows(
    ar,
    p.width,
    p.height,
    count,
    p.oneWayStreets,
    bollards,
    p.maxTurns ?? Number.POSITIVE_INFINITY,
  );
  return layout ?? undefined;
}

function buildAttempt(
  p: GeneratorOptions,
  rules: ResolvedRules,
  attemptSeed: number,
  attempt: number,
): { level: Level; honk: HonkPlan | null } | null {
  const r: Rng = { state: createRng(attemptSeed) };
  const typeKeys = Object.keys(rules.vehicles.types);
  const weights: Array<[string, number]> = typeKeys.map((t) => [
    t,
    p.typeWeights?.[t] ??
      DEFAULT_LENGTH_WEIGHT_BASE **
        (Math.max(...typeKeys.map((x) => rules.vehicles.types[x]!.length)) -
          rules.vehicles.types[t]!.length),
  ]);
  const types = Array.from({ length: p.vehicleCount }, () => weightedPick(r, weights));

  // Jede Farbe mindestens einmal (soweit moeglich), Rest zufaellig; Reihenfolge gemischt.
  const colors: string[] = [];
  for (let i = 0; i < p.vehicleCount; i++) {
    colors.push(i < p.colors.length ? p.colors[i]! : pick(r, p.colors));
  }
  shuffleInPlace(r, colors);

  const bollards = chooseBollards(r, p.width, p.height, resolveCount(r, p.bollards));
  const layout = p.oneWay === undefined ? null : arrowsFor(p, attemptSeed, bollards);
  if (layout === undefined) return null;
  const placed = placeVehicles(p, rules, r, types, colors, bollards, layout);
  if (!placed) return null;
  if (!bollardHasRole(bollards, placed)) return null;
  if (layout && !arrowsHaveRole(layout, placed)) return null;
  // Pflicht-Hupe: ein Blocker startet dort, wo ihn die Hupe von seinem Platz verdraengt haette.
  const honk = p.requireHonk ? applyHonkLayout(r, placed, bollards, p.width, p.height) : null;
  if (p.requireHonk && !honk) return null;
  const lockCount = resolveCount(r, p.keys);
  const keyOf =
    lockCount > 0
      ? assignKeys(r, placed, lockCount, p.keyChainDepth ?? DEFAULT_KEY_CHAIN_DEPTH)
      : null;
  if (lockCount > 0 && !keyOf) return null;

  const maxWindow = Math.max(
    MIN_SHUFFLE,
    Math.min(rules.queue.slots, p.shuffleWindow ?? DEFAULT_SHUFFLE_WINDOW),
  );
  // Versuche variieren das Fenster: erster Versuch voll, spaetere zufaellig kleiner.
  const window = attempt === 0 ? maxWindow : MIN_SHUFFLE + randInt(r, maxWindow);
  const passengers = buildPassengers(r, placed, rules, Math.max(window, MIN_SHUFFLE));

  const level: Level = {
    schema: 'parking.level/1',
    id: p.id ?? `gen-${p.seed}`,
    title: p.title ?? `Generated ${p.seed}`,
    seed: attemptSeed,
    ruleset: p.ruleset ?? 'classic',
    ...overridesFor(p),
    grid: {
      width: p.width,
      height: p.height,
      cells: [
        ...bollards.map(([x, y]) => ({ x, y, type: 'fixed' as const })),
        ...arrowCells(layout),
      ],
    },
    vehicles: placed.map((v, i) => ({
      id: v.id,
      pos: v.head,
      dir: v.dir,
      type: v.type,
      color: v.color,
      ...(keyOf?.has(i) && { locked: true, keyId: placed[keyOf.get(i)!]!.id }),
    })),
    passengers,
    meta: { author: 'generator', solverVersion: SOLVER_VERSION },
  };
  return { level, honk };
}

/**
 * Erzeugt ein Level. Deterministisch pro Parameter-Satz. Liefert das passende Level oder, wenn nach
 * maxAttempts keins im Zielbereich liegt, das naechstliegende (matched = false).
 */
export function generate(p: GeneratorOptions, baseRules: ResolvedRules): GenerateResult {
  const rules = effectiveRules(baseRules, p);
  const maxAttempts = p.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxStates = p.maxStates ?? DEFAULT_MAX_STATES;
  if (p.requireHonk && !(rules.powerups.honk.enabled && rules.powerups.honk.uses > 0)) {
    throw new Error('generate: requireHonk needs powerups.honk in the ruleset');
  }
  const mysteryMax = typeof p.mystery === 'number' ? p.mystery : Math.max(...(p.mystery ?? [0]));
  if (mysteryMax > 0 && !rules.special.mysteryVehicles) {
    throw new Error('generate: mystery needs special.mysteryVehicles in the ruleset');
  }
  const oneWayMax = typeof p.oneWay === 'number' ? p.oneWay : Math.max(...(p.oneWay ?? [0]));
  if (oneWayMax > 0 && !(rules.special.oneWay && rules.movement.model === 'turns')) {
    throw new Error(
      'generate: oneWay needs special.oneWay and movement.model turns in the ruleset',
    );
  }
  if (oneWayMax > 0 && p.requireHonk) {
    throw new Error('generate: oneWay together with requireHonk is not supported');
  }
  let best: {
    level: Level;
    analysis: LevelAnalysis;
    dist: number;
    mystery?: MysteryInfo;
  } | null = null;
  let attempts = 0;
  for (let i = 0; i < maxAttempts; i++) {
    attempts += 1;
    const attemptSeed = deriveSeed(p.seed, i);
    const built = buildAttempt(p, rules, attemptSeed, i);
    if (!built) continue;
    const { honk } = built;
    let level = built.level;
    if (validateLevel(level, rules).length > 0) continue;
    if (
      honk &&
      !honkPlanHolds(
        level,
        rules,
        level.vehicles.map((v) => v.id),
        honk,
      )
    )
      continue;
    const analysis = analyze(level, rules, { maxStates, allowHonk: p.requireHonk });
    if (!analysis.solvable || analysis.truncated) continue;
    if (p.requireHonk) {
      const tapOnly = analyze(level, rules, { maxStates });
      if (tapOnly.solvable || tapOnly.truncated) continue;
    }

    const [lo, hi] = p.targetDifficulty ?? [0, 10];
    const d = analysis.difficulty;
    const trivialPenalty = isTrivial(analysis, p.targetDifficulty) ? TRIVIAL_PENALTY : 0;
    const deadPenalty = p.preferDeadEnds && !hasDeadEnds(analysis, p) ? SOFT_PENALTY : 0;
    const luckPenalty =
      p.maxRandomPlayWin !== undefined && analysis.randomPlayWinProbability > p.maxRandomPlayWin
        ? SOFT_PENALTY
        : 0;
    let dist = (d < lo ? lo - d : d > hi ? d - hi : 0) + trivialPenalty + deadPenalty + luckPenalty;
    // Strafen addieren sich nur: ein Kandidat, der schon jetzt nicht besser ist, braucht keine Mystery-Wahl.
    if (best && dist >= best.dist) continue;
    let mystery: MysteryInfo | undefined;
    if (mysteryMax > 0) {
      const mr: Rng = { state: createRng((attemptSeed ^ MYSTERY_SALT) >>> 0) };
      const count = resolveCount(mr, p.mystery);
      if (count > 0) {
        const picked = applyMystery(
          mr,
          level,
          rules,
          analysis.solution ?? [],
          count,
          p.mysteryMinBlindWin ?? DEFAULT_MYSTERY_MIN_BLIND_WIN,
          p.mysteryPlayouts,
        );
        if (!picked) continue;
        level = picked.level;
        mystery = { ids: picked.ids, ...picked.blind, fair: picked.fair };
        if (!picked.fair) dist += FAIRNESS_PENALTY;
        if (best && dist >= best.dist) continue;
      }
    }
    best = { level, analysis, dist, ...(mystery && { mystery }) };
    if (dist === 0) break;
  }
  if (!best) throw new Error(`generate: no solvable level found in ${maxAttempts} attempts`);
  best.level.meta = {
    ...best.level.meta,
    difficulty: best.analysis.difficulty,
    par: { moves: best.analysis.minMoves ?? undefined },
  };
  best.level.title = p.title ?? best.level.title;
  return {
    level: LevelSchema.parse(best.level),
    analysis: best.analysis,
    attempts,
    matched: best.dist === 0,
    ...(best.mystery && { mystery: best.mystery }),
  };
}
