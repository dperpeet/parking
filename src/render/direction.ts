// Reine Geometrie fuer Fahrtrichtung: Chevrons, Scheinwerfer und Fahrspur. Keine Spiellogik.
import type { Dir } from '../schema';
import { DIR_VECTOR, VEHICLE_INSET } from './layout';
import type { VehicleGeom } from './layout';

export type Point = readonly [number, number];

/** Anteile der Zellgroesse fuer Chevron und Scheinwerfer. */
export const CHEVRON_SIZE = 0.17;
/** Abstand des vorderen Chevrons zur Frontkante (hinter der Scheibe, mit Luft). */
export const CHEVRON_FRONT_DIST = 0.58;
/** Symbol bei kurzen Fahrzeugen um diesen Anteil Richtung Heck schieben. */
export const GLYPH_SHIFT = 0.1;
export const GLYPH_SHIFT_MAX_LENGTH = 2;
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

/** Punkt auf der Mittelachse im Abstand `dist` von der Frontkante, lokal im Fahrzeugrechteck. */
function axisPoint(dir: Dir, dist: number, w: number, h: number): Point {
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

/** Chevron-Mittelpunkte: einer hinter der Scheibe, ab Laenge 3 zusaetzlich in der Heckzelle. */
export function chevronCenters(
  dir: Dir,
  length: number,
  w: number,
  h: number,
  cell: number,
): Point[] {
  const dists = [cell * CHEVRON_FRONT_DIST];
  if (length > GLYPH_SHIFT_MAX_LENGTH) dists.push((length - 0.5) * cell - VEHICLE_INSET);
  return dists.map((d) => axisPoint(dir, d, w, h));
}

/** Mitte des Farbsymbols: bei kurzen Fahrzeugen leicht Richtung Heck verschoben. */
export function glyphCenter(dir: Dir, length: number, w: number, h: number, cell: number): Point {
  const shift = length <= GLYPH_SHIFT_MAX_LENGTH ? cell * GLYPH_SHIFT : 0;
  const [dx, dy] = DIR_VECTOR[dir];
  return [w / 2 - dx * shift, h / 2 - dy * shift];
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
