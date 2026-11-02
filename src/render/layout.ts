// Reine Geometrie des Spielfelds. Wird vom Pixi-Board und von den DOM-Overlays gemeinsam genutzt.
import type { Dir } from '../schema';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardLayout {
  cols: number;
  rows: number;
  /** Aussenrechteck des Bretts (ohne Schatten). */
  board: Rect;
  /** Kantenlaenge einer Zelle inkl. Abstand. */
  cell: number;
  /** Ursprung (oben links) der Zelle (0,0). */
  originX: number;
  originY: number;
}

/** Platz fuer Kontur und Schatten am Rand der Zeichenflaeche. */
const EDGE = 5;
/** Innenabstand zwischen Brettkante und Zellen. */
const PADDING = 8;
/** Abstand zwischen Zellrechteck und Fahrzeug auf jeder Seite. */
export const VEHICLE_INSET = 4;
export const CELL_GAP = 4;

export function computeBoardLayout(
  cols: number,
  rows: number,
  width: number,
  height: number,
): BoardLayout {
  const availW = width - 2 * EDGE;
  const availH = height - 2 * EDGE;
  const cell = Math.max(1, Math.min((availW - 2 * PADDING) / cols, (availH - 2 * PADDING) / rows));
  const bw = cell * cols + 2 * PADDING;
  const bh = cell * rows + 2 * PADDING;
  const bx = (width - bw) / 2;
  const by = (height - bh) / 2;
  return {
    cols,
    rows,
    board: { x: bx, y: by, w: bw, h: bh },
    cell,
    originX: bx + PADDING,
    originY: by + PADDING,
  };
}

export function cellRect(l: BoardLayout, x: number, y: number): Rect {
  const g = CELL_GAP / 2;
  return {
    x: l.originX + x * l.cell + g,
    y: l.originY + y * l.cell + g,
    w: l.cell - CELL_GAP,
    h: l.cell - CELL_GAP,
  };
}

export interface VehicleGeom {
  x: number;
  y: number;
  dir: Dir;
  length: number;
}

/** Zellen-Bounding-Box eines Fahrzeugs: Kopf bei (x,y), Rumpf entgegen der Blickrichtung. */
export function vehicleCellBox(v: VehicleGeom): {
  col: number;
  row: number;
  cols: number;
  rows: number;
} {
  switch (v.dir) {
    case 'N':
      return { col: v.x, row: v.y, cols: 1, rows: v.length };
    case 'S':
      return { col: v.x, row: v.y - v.length + 1, cols: 1, rows: v.length };
    case 'E':
      return { col: v.x - v.length + 1, row: v.y, cols: v.length, rows: 1 };
    case 'W':
      return { col: v.x, row: v.y, cols: v.length, rows: 1 };
  }
}

export function vehicleRect(l: BoardLayout, v: VehicleGeom): Rect {
  const b = vehicleCellBox(v);
  return {
    x: l.originX + b.col * l.cell + VEHICLE_INSET,
    y: l.originY + b.row * l.cell + VEHICLE_INSET,
    w: b.cols * l.cell - 2 * VEHICLE_INSET,
    h: b.rows * l.cell - 2 * VEHICLE_INSET,
  };
}

export const DIR_VECTOR: Record<Dir, readonly [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};
