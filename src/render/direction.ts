// Reine Geometrie fuer Fahrtrichtung: Chevrons, Scheinwerfer und Fahrspur. Keine Spiellogik.
import type { Dir } from '../schema';
import { DIR_VECTOR, VEHICLE_INSET } from './layout';
import type { VehicleGeom } from './layout';

export type Point = readonly [number, number];

/** Anteile der Zellgroesse fuer Chevron und Scheinwerfer. */
export const CHEVRON_SIZE = 0.2;
export const CHEVRON_ARM = 0.6;
export const HEADLIGHT_ALONG = 0.1;
export const HEADLIGHT_ACROSS = 0.3;
export const HEADLIGHT_RADIUS = 0.06;

/** Zellen vor der Kopfzelle bis zum Rasterrand (ohne Kopfzelle), in Fahrtrichtung. */
export function laneCells(v: VehicleGeom, cols: number, rows: number): Array<[number, number]> {
  const [dx, dy] = DIR_VECTOR[v.dir];
  const out: Array<[number, number]> = [];
  for (let x = v.x + dx, y = v.y + dy; x >= 0 && y >= 0 && x < cols && y < rows; x += dx, y += dy) {
    out.push([x, y]);
  }
  return out;
}

/** Mittelpunkt der k-ten Zelle ab dem Kopf, lokal im Fahrzeugrechteck. */
function cellCenterLocal(dir: Dir, k: number, w: number, h: number, cell: number): Point {
  const dist = (k + 0.5) * cell - VEHICLE_INSET;
  switch (dir) {
    case 'E':
      return [w - dist, h / 2];
    case 'W':
      return [dist, h / 2];
    case 'N':
      return [w / 2, dist];
    case 'S':
      return [w / 2, h - dist];
  }
}

/** Chevron-Mittelpunkte: Kopfzelle und Heckzelle (bei Laenge 1 nur einer). */
export function chevronCenters(
  dir: Dir,
  length: number,
  w: number,
  h: number,
  cell: number,
): Point[] {
  const ks = length > 1 ? [0, length - 1] : [0];
  return ks.map((k) => cellCenterLocal(dir, k, w, h, cell));
}

/** Polylinie (Arm, Spitze, Arm) eines Chevrons mit Spitze in Blickrichtung. */
export function chevronPoints(
  dir: Dir,
  cx: number,
  cy: number,
  size: number,
): [Point, Point, Point] {
  const [dx, dy] = DIR_VECTOR[dir];
  const px = -dy;
  const py = dx;
  const half = size / 2;
  const arm = size * CHEVRON_ARM;
  return [
    [cx - dx * half + px * arm, cy - dy * half + py * arm],
    [cx + dx * half, cy + dy * half],
    [cx - dx * half - px * arm, cy - dy * half - py * arm],
  ];
}

/** Scheinwerfer-Mittelpunkte an der Frontkante (lokal im Fahrzeugrechteck). */
export function headlightCenters(dir: Dir, w: number, h: number, cell: number): [Point, Point] {
  const a = cell * HEADLIGHT_ALONG;
  const c = cell * HEADLIGHT_ACROSS;
  switch (dir) {
    case 'E':
      return [
        [w - a, h / 2 - c],
        [w - a, h / 2 + c],
      ];
    case 'W':
      return [
        [a, h / 2 - c],
        [a, h / 2 + c],
      ];
    case 'N':
      return [
        [w / 2 - c, a],
        [w / 2 + c, a],
      ];
    case 'S':
      return [
        [w / 2 - c, h - a],
        [w / 2 + c, h - a],
      ];
  }
}

/** Strich-Segmente entlang einer Strecke (Strichanteil `dashRatio` je `period`). */
export function dashSegments(
  from: Point,
  to: Point,
  period: number,
  dashRatio: number,
): Array<[Point, Point]> {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (len <= 0 || period <= 0) return [];
  const ux = (to[0] - from[0]) / len;
  const uy = (to[1] - from[1]) / len;
  const out: Array<[Point, Point]> = [];
  for (let s = 0; s < len; s += period) {
    const e = Math.min(len, s + period * dashRatio);
    out.push([
      [from[0] + ux * s, from[1] + uy * s],
      [from[0] + ux * e, from[1] + uy * e],
    ]);
  }
  return out;
}
