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
