import type { Dir } from '../schema';
import type { GameState, VehicleState } from './types';

export type Point = [number, number];

export const DIR_VECTORS: Record<Dir, Point> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

export type Grid = GameState['grid'];

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function inBounds(grid: Pick<Grid, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

/** Belegte Zellen: Kopf und `length - 1` Zellen entgegen der Blickrichtung. */
export function vehicleCells(v: Pick<VehicleState, 'x' | 'y' | 'dir' | 'length'>): Point[] {
  const [dx, dy] = DIR_VECTORS[v.dir];
  const cells: Point[] = [];
  for (let i = 0; i < v.length; i++) cells.push([v.x - dx * i, v.y - dy * i]);
  return cells;
}

/** Zellen vor dem Kopf (ohne Kopfzelle) bis zum letzten Feld im Raster. */
export function pathToEdge(
  v: Pick<VehicleState, 'x' | 'y' | 'dir'>,
  grid: Pick<Grid, 'width' | 'height'>,
): Point[] {
  const [dx, dy] = DIR_VECTORS[v.dir];
  const path: Point[] = [];
  let x = v.x + dx;
  let y = v.y + dy;
  while (inBounds(grid, x, y)) {
    path.push([x, y]);
    x += dx;
    y += dy;
  }
  return path;
}

/** Gegenrichtung (Falschfahrt auf einem Pfeil). */
export const OPPOSITE_DIR: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

/**
 * Obergrenze fuer die Wegverfolgung je Rasterzelle: ein schleifenfreier Weg betritt jede Zelle hoechstens einmal
 * je Richtung (siehe docs/adr/0002-einbahn-und-abbiegen.md, Regel 5).
 */
const TRACE_STEPS_PER_CELL = Object.keys(DIR_VECTORS).length;

/** Pfeilzellen (`oneWay` mit `dir`): Zelle -> Pfeilrichtung. */
export function oneWayCells(grid: Pick<Grid, 'cells'>): Map<string, Dir> {
  const map = new Map<string, Dir>();
  for (const c of grid.cells) {
    if (c.type === 'oneWay' && c.dir !== undefined) map.set(cellKey(c.x, c.y), c.dir);
  }
  return map;
}

export interface ExitPath {
  /** Zellen vor der Kopfzelle bis zur letzten Zelle im Raster bzw. bis vor `wrongWay` (ohne Kopfzelle). */
  path: Point[];
  /** Richtung am Ende des Wegs (beim Verlassen des Rasters). */
  exitDir: Dir;
  /** Falschfahrt-Pfeilzelle, an der der Weg endet (ein Hindernis wie ein Poller), sonst `null`. */
  wrongWay: Point | null;
  /** Verfolgung nach `4 · Breite · Höhe` Schritten abgebrochen (Pfeil-Schleife; `validateLevel` verhindert sie). */
  loop: boolean;
}

/**
 * Ausfahrweg ab der Kopfzelle (docs/INTERFACES.md, Spielregeln 9): geradeaus in Blickrichtung; auf einer Pfeilzelle
 * mit Richtung `p` geht es in `p` weiter, ausser `p` zeigt entgegen (Falschfahrt). Ohne Pfeilzellen gleich
 * `pathToEdge`. Ein Pfeil auf der Kopfzelle selbst zaehlt nicht (sie wird nicht betreten).
 */
export function exitPath(v: Pick<VehicleState, 'x' | 'y' | 'dir'>, grid: Grid): ExitPath {
  const arrows = oneWayCells(grid);
  const maxSteps = TRACE_STEPS_PER_CELL * grid.width * grid.height;
  const path: Point[] = [];
  let dir = v.dir;
  let x = v.x;
  let y = v.y;
  for (let steps = 0; steps < maxSteps; steps++) {
    const [dx, dy] = DIR_VECTORS[dir];
    x += dx;
    y += dy;
    if (!inBounds(grid, x, y)) return { path, exitDir: dir, wrongWay: null, loop: false };
    const arrow = arrows.get(cellKey(x, y));
    if (arrow !== undefined) {
      if (arrow === OPPOSITE_DIR[dir]) return { path, exitDir: dir, wrongWay: [x, y], loop: false };
      dir = arrow;
    }
    path.push([x, y]);
  }
  return { path, exitDir: dir, wrongWay: null, loop: true };
}

export function fixedCells(grid: Grid): Set<string> {
  const set = new Set<string>();
  for (const c of grid.cells) if (c.type === 'fixed') set.add(cellKey(c.x, c.y));
  return set;
}

/** Zelle -> ID des geparkten Fahrzeugs, das sie belegt. */
export function parkedOccupancy(state: GameState): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of state.vehicles) {
    if (v.status !== 'parked') continue;
    for (const [x, y] of vehicleCells(v)) map.set(cellKey(x, y), v.id);
  }
  return map;
}
