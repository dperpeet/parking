// Reine Geometrie der Ausfahrt mit Knicken (Abbiegepfeile). Keine Spiellogik: Weg und Ausfahrrichtung kommen
// aus dem Event `vehicleExited` (`path`, `exitDir`). Alle Werte in Zelleinheiten, Zelle (x, y) hat die Mitte
// (x + 0.5, y + 0.5).
import type { Dir } from '../schema';
import { DIR_VECTOR } from './layout';
import type { Point } from './direction';

/** Linienzug, auf dem Front- und Heckpunkt des Fahrzeugs laufen; `headAt` = Bogenlaenge der Kopfzellen-Mitte. */
export interface ExitTrack {
  points: Point[];
  headAt: number;
}

/** Lage des Fahrzeugs: Mittelpunkt (Zelleinheiten) und Winkel der Laengsachse (Heck -> Front, Bogenmass). */
export interface ExitPose {
  x: number;
  y: number;
  angle: number;
}

const center = (c: Point): Point => [c[0] + 0.5, c[1] + 0.5];

/** Nur Knickpunkte behalten (gleich gerichtete Zwischenpunkte fallen weg). */
function corners(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (b && b[0] === p[0] && b[1] === p[1]) continue;
    if (a && b && (b[0] - a[0]) * (p[1] - b[1]) === (b[1] - a[1]) * (p[0] - b[0])) out.pop();
    out.push(p);
  }
  return out;
}

/**
 * Linienzug der Ausfahrt: vom Heck (gegen `dir`) ueber die Kopfzelle und `path` bis `length + 1` Zellen
 * hinter der letzten Wegzelle in `exitDir`. So liegen Front und Heck in Ruhelage und am Ende auf dem Zug.
 */
export function exitTrack(
  head: Point,
  dir: Dir,
  path: readonly Point[],
  exitDir: Dir,
  length: number,
): ExitTrack {
  const [dx, dy] = DIR_VECTOR[dir];
  const [ex, ey] = DIR_VECTOR[exitDir];
  const h = center(head);
  const last = center(path[path.length - 1] ?? head);
  const out = length + 1;
  return {
    points: corners([
      [h[0] - dx * length, h[1] - dy * length],
      h,
      ...path.map(center),
      [last[0] + ex * out, last[1] + ey * out],
    ]),
    headAt: length,
  };
}

/** Punkt bei Bogenlaenge `s`; ausserhalb des Zugs wird das erste bzw. letzte Stueck verlaengert. */
export function sampleTrack(points: readonly Point[], s: number): Point {
  const first = points[0];
  if (!first) return [0, 0];
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= 0) continue;
    const isLast = i === points.length - 1;
    if (s <= walked + len || isLast) {
      // Vor dem Start (t < 0, nur im ersten Stueck) und hinter dem Ende (t > 1, nur im letzten) linear weiter.
      const t = (s - walked) / len;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += len;
  }
  return first;
}

/**
 * Lage nach `travelled` Zellen Fahrt: Die Frontkante (eine halbe Zelle vor der Kopfmitte) und die Heckkante
 * (`length - 0.5` Zellen dahinter) laufen auf dem Zug; das Fahrzeug liegt dazwischen. An Knicken dreht es sich
 * dadurch stetig. Bei `travelled = 0` ist das genau die Ruhelage.
 */
export function exitPose(track: ExitTrack, length: number, travelled: number): ExitPose {
  const front = sampleTrack(track.points, track.headAt + 0.5 + travelled);
  const rear = sampleTrack(track.points, track.headAt - (length - 0.5) + travelled);
  return {
    x: (front[0] + rear[0]) / 2,
    y: (front[1] + rear[1]) / 2,
    angle: Math.atan2(front[1] - rear[1], front[0] - rear[0]),
  };
}

/** Fahrstrecke in Zellen, bis das Heck die letzte Wegzelle verlassen hat (wie beim geraden Ausfahren). */
export const exitDistance = (pathCells: number, length: number): number => pathCells + length;

/** Winkel der Blickrichtung (Bogenmass, Bildschirmkoordinaten mit y nach unten). */
export function dirAngle(dir: Dir): number {
  const [dx, dy] = DIR_VECTOR[dir];
  return Math.atan2(dy, dx);
}
