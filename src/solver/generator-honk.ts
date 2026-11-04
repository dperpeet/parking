// Pflicht-Hupe fuer den Generator: Rueckwaerts-Konstruktion "Blocker weicht der Hupe aus".
// Vorwaerts: v1..v(j-1) fahren aus, V=v_j hupt, der Blocker B rutscht entlang seiner Achse von V's
// Weg an seinen urspruenglichen Platz P, danach geht es mit Tipps weiter. Rueckwaerts: B startet
// stattdessen an P' (P um s Zellen verschoben), sodass er V's Weg kreuzt. Nur Kandidaten, bei denen
// reine Tipps in einer Verklemmung enden (geometrisch, ohne Warteschlange), werden gewaehlt.
import { createGame, step } from '../engine';
import type { Level, ResolvedRules } from '../schema';
import { pick } from './generator-special';
import type { Pos, Rng } from './generator-special';

type DirKey = 'N' | 'E' | 'S' | 'W';
const STEP: Record<DirKey, Pos> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const CELL_KEY_STRIDE = 64;
const SIGNS = [-1, 1] as const;

/** Das, was die Konstruktion von einem platzierten Fahrzeug braucht (Index = Ausfahr-Reihenfolge). */
export interface HonkVehicle {
  id: string;
  head: Pos;
  dir: DirKey;
  cells: Pos[];
  path: Pos[];
}

/** Hupender (`honker`), ausweichender Blocker (`yielder`) und dessen Kopfzelle nach dem Ausweichen. */
export interface HonkPlan {
  honker: number;
  yielder: number;
  to: Pos;
}

const keyOf = ([x, y]: Pos): number => y * CELL_KEY_STRIDE + x;
const isHorizontal = (d: DirKey): boolean => d === 'E' || d === 'W';

/** Geometrische Verklemmung: bleiben nach dem Abraeumen aller frei fahrbaren Fahrzeuge welche uebrig? */
function deadlocks(vs: HonkVehicle[], bollards: Set<number>): boolean {
  const cellSets = vs.map((v) => new Set(v.cells.map(keyOf)));
  const remaining = new Set(vs.keys());
  for (let changed = true; changed;) {
    changed = false;
    for (const i of [...remaining]) {
      const blocked = vs[i]!.path.some((c) => {
        const k = keyOf(c);
        if (bollards.has(k)) return true;
        for (const j of remaining) if (j !== i && cellSets[j]!.has(k)) return true;
        return false;
      });
      if (!blocked) {
        remaining.delete(i);
        changed = true;
      }
    }
  }
  return remaining.size > 0;
}

/** Fahrzeug `v` um `delta` Zellen entlang seiner Achse verschoben (Weg bis zum Rand neu berechnet). */
function shifted<T extends HonkVehicle>(v: T, delta: number, w: number, h: number): T {
  const [dx, dy] = STEP[v.dir];
  const move = ([x, y]: Pos): Pos => [x + dx * delta, y + dy * delta];
  const head = move(v.head);
  const path: Pos[] = [];
  for (let x = head[0] + dx, y = head[1] + dy; x >= 0 && y >= 0 && x < w && y < h;) {
    path.push([x, y]);
    x += dx;
    y += dy;
  }
  return { ...v, head, cells: v.cells.map(move), path };
}

/**
 * Waehlt (seed-deterministisch) Hupenden und Blocker und setzt den Blocker an P' (Eintrag in
 * `placed` wird ersetzt). null, wenn kein Kandidat in einer Verklemmung endet.
 */
export function applyHonkLayout<T extends HonkVehicle>(
  r: Rng,
  placed: T[],
  bollards: Pos[],
  width: number,
  height: number,
): HonkPlan | null {
  const bollardKeys = new Set(bollards.map(keyOf));
  const owner = new Map<number, number>();
  placed.forEach((v, i) => v.cells.forEach((c) => owner.set(keyOf(c), i)));
  const pathKeys = placed.map((v) => new Set(v.path.map(keyOf)));
  const options: Array<{ plan: HonkPlan; moved: T }> = [];
  for (let j = 0; j < placed.length; j++) {
    for (let i = j + 1; i < placed.length; i++) {
      const b = placed[i]!;
      if (isHorizontal(b.dir) === isHorizontal(placed[j]!.dir)) continue;
      for (const sign of SIGNS) {
        for (let s = 1; s <= b.cells.length; s++) {
          const moved = shifted(b, sign * s, width, height);
          const free = moved.cells.every(([x, y]) => {
            const inside = x >= 0 && y >= 0 && x < width && y < height;
            const k = keyOf([x, y]);
            return inside && !bollardKeys.has(k) && (owner.get(k) ?? i) === i;
          });
          if (!free || !moved.cells.some((c) => pathKeys[j]!.has(keyOf(c)))) continue;
          // Die neu belegten Zellen duerfen v1..v(j-1) vor der Hupe nicht im Weg sein.
          const own = new Set(b.cells.map(keyOf));
          const extra = moved.cells.filter((c) => !own.has(keyOf(c)));
          if (pathKeys.slice(0, j).some((p) => extra.some((c) => p.has(keyOf(c))))) continue;
          const test = placed.map((v, k) => (k === i ? moved : v));
          if (!deadlocks(test, bollardKeys)) continue;
          options.push({ plan: { honker: j, yielder: i, to: b.head }, moved });
        }
      }
    }
  }
  if (options.length === 0) return null;
  const chosen = pick(r, options);
  placed[chosen.plan.yielder] = chosen.moved;
  return chosen.plan;
}

/**
 * Prueft per Engine, dass die konstruierte Vorwaerts-Loesung traegt: die Tipps v1..v(j-1) gehen
 * durch, danach laesst die Hupe von V den Blocker genau an seinen Platz P ausweichen.
 */
export function honkPlanHolds(
  level: Level,
  rules: ResolvedRules,
  vehicleIds: string[],
  plan: HonkPlan,
): boolean {
  let s = createGame(level, rules);
  for (const id of vehicleIds.slice(0, plan.honker)) {
    const next = step(s, { type: 'tapVehicle', vehicleId: id }, rules).state;
    if (next.moves === s.moves || next.status !== 'playing') return false;
    s = next;
  }
  const honk = step(
    s,
    { type: 'usePowerUp', powerUp: 'honk', vehicleId: vehicleIds[plan.honker]! },
    rules,
  );
  if (honk.events.some((e) => e.type === 'invalidAction')) return false;
  const moved = honk.state.vehicles.find((v) => v.id === vehicleIds[plan.yielder]);
  return moved !== undefined && moved.x === plan.to[0] && moved.y === plan.to[1];
}
