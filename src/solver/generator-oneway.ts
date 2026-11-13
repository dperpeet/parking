// Abbiegepfeile fuer den Generator (Welt 5, docs/adr/0002-einbahn-und-abbiegen.md): Pfeil-Strassenstuecke
// vor den Fahrzeugen setzen, gebogene Ausfahrwege verfolgen und die Rolle der Pfeile pruefen. Der Zufall kommt
// aus einem eigenen PRNG; ohne Pfeile wird nichts davon aufgerufen (Ausgabe bitgleich).
import { DIR_VECTORS, cellKey, exitPath } from '../engine/geometry';
import type { Grid } from '../engine/geometry';
import type { Cell, Dir, Level } from '../schema';
import { pick, randInt, resolveCount } from './generator-special';
import type { Count, Pos, Rng } from './generator-special';

const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
/** Default fuer `oneWayStreets`. */
export const DEFAULT_ONE_WAY_STREET = 1;
/** Zufallsversuche je Strassenstueck, bevor die Pfeil-Wahl des Versuchs aufgibt. */
const STREET_TRIES = 32;

export interface Arrow {
  x: number;
  y: number;
  dir: Dir;
}

/** Pfeile eines Versuchs als Raster (fuer `exitPath`) und als Zellmenge. */
export interface ArrowLayout {
  arrows: Arrow[];
  grid: Grid;
  keys: Set<string>;
  /** Hoechstzahl Knicke je Weg (`GeneratorTuning.maxTurns`). */
  maxTurns: number;
}

export interface TracedPath {
  path: Pos[];
  /** Zahl der Richtungswechsel entlang des Wegs. */
  turns: number;
  /** Index in `path` der ersten Zelle nach dem ersten Knick (`path.length` ohne Knick). */
  bentFrom: number;
}

function arrowGrid(width: number, height: number, arrows: Arrow[]): Grid {
  return { width, height, cells: arrows.map((a) => ({ ...a, type: 'oneWay' as const })) };
}

/** Keine Pfeil-Schleife (wie `validateLevel`: Verfolgung ab jeder Pfeilzelle in Pfeilrichtung). */
function loopFree(grid: Grid, arrows: Arrow[]): boolean {
  return arrows.every((a) => !exitPath(a, grid).loop);
}

/**
 * `count` Pfeile als gerade Strassenstuecke (Laenge aus `streets`, gleich gerichtet entlang ihrer Zeile bzw.
 * Spalte), nicht auf `blocked` und ohne Schleife. null, wenn sie nicht unterzubringen sind.
 */
export function chooseArrows(
  r: Rng,
  width: number,
  height: number,
  count: number,
  streets: Count | undefined,
  blocked: Pos[],
  maxTurns = Number.POSITIVE_INFINITY,
): ArrowLayout | null {
  const taken = new Set(blocked.map(([x, y]) => cellKey(x, y)));
  const arrows: Arrow[] = [];
  while (arrows.length < count) {
    const length = Math.min(
      count - arrows.length,
      Math.max(1, resolveCount(r, streets ?? DEFAULT_ONE_WAY_STREET)),
    );
    let street: Arrow[] | null = null;
    for (let t = 0; t < STREET_TRIES && !street; t++) {
      const dir = pick(r, DIRS);
      const [dx, dy] = DIR_VECTORS[dir];
      const x0 = randInt(r, width);
      const y0 = randInt(r, height);
      const cand = Array.from({ length }, (_, i) => ({ x: x0 + dx * i, y: y0 + dy * i, dir }));
      const fits = cand.every(
        (a) => a.x >= 0 && a.y >= 0 && a.x < width && a.y < height && !taken.has(cellKey(a.x, a.y)),
      );
      if (fits && loopFree(arrowGrid(width, height, [...arrows, ...cand]), [...arrows, ...cand])) {
        street = cand;
      }
    }
    if (!street) return null;
    for (const a of street) {
      arrows.push(a);
      taken.add(cellKey(a.x, a.y));
    }
  }
  return {
    arrows,
    grid: arrowGrid(width, height, arrows),
    keys: new Set(arrows.map((a) => cellKey(a.x, a.y))),
    maxTurns,
  };
}

/**
 * Gebogener Ausfahrweg ab der Kopfzelle; null bei Falschfahrt oder Schleife (das Fahrzeug kaeme nie heraus).
 */
export function traceExit(layout: ArrowLayout, head: Pos, dir: Dir): TracedPath | null {
  const exit = exitPath({ x: head[0], y: head[1], dir }, layout.grid);
  if (exit.loop || exit.wrongWay) return null;
  let turns = 0;
  let bentFrom = exit.path.length;
  let prev = head;
  let d = dir;
  exit.path.forEach(([x, y], i) => {
    const [dx, dy] = DIR_VECTORS[d];
    if (x !== prev[0] + dx || y !== prev[1] + dy) {
      turns += 1;
      bentFrom = Math.min(bentFrom, i);
      d = DIRS.find((c) => x === prev[0] + DIR_VECTORS[c][0] && y === prev[1] + DIR_VECTORS[c][1])!;
    }
    prev = [x, y];
  });
  return { path: exit.path, turns, bentFrom };
}

interface RoleVehicle {
  head: Pos;
  dir: Dir;
  cells: Pos[];
}

/**
 * Rollenpruefung: Mindestens ein Fahrzeug faehrt einen abbiegenden Weg und ist anfangs auf dem Teil nach dem
 * ersten Knick von einem anderen Fahrzeug blockiert (damit lenkt auch mindestens ein Pfeil einen Weg um).
 */
export function arrowsHaveRole(layout: ArrowLayout, vehicles: RoleVehicle[]): boolean {
  const owner = new Map<string, number>();
  vehicles.forEach((v, i) => v.cells.forEach(([x, y]) => owner.set(cellKey(x, y), i)));
  return vehicles.some((v, i) => {
    const t = traceExit(layout, v.head, v.dir);
    if (!t || t.turns === 0) return false;
    return t.path.slice(t.bentFrom).some(([x, y]) => {
      const o = owner.get(cellKey(x, y));
      return o !== undefined && o !== i;
    });
  });
}

/** Pfeile als Level-Zellen. */
export function arrowCells(layout: ArrowLayout | null): Cell[] {
  return (layout?.arrows ?? []).map((a) => ({
    x: a.x,
    y: a.y,
    type: 'oneWay' as const,
    dir: a.dir,
  }));
}

/** Zahl der Pfeilzellen und hoechste Knickzahl eines Ausfahrwegs im Level (fuer die CLI-Berichte). */
export function arrowStats(level: Level): { arrows: number; maxTurns: number } {
  const arrows = level.grid.cells.flatMap((c) =>
    c.type === 'oneWay' && c.dir !== undefined ? [{ x: c.x, y: c.y, dir: c.dir }] : [],
  );
  if (arrows.length === 0) return { arrows: 0, maxTurns: 0 };
  const layout: ArrowLayout = {
    arrows,
    grid: level.grid,
    keys: new Set(arrows.map((a) => cellKey(a.x, a.y))),
    maxTurns: Number.POSITIVE_INFINITY,
  };
  const turns = level.vehicles.map((v) => traceExit(layout, v.pos, v.dir)?.turns ?? 0);
  return { arrows: arrows.length, maxTurns: Math.max(0, ...turns) };
}
