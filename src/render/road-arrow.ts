// Reine Geometrie des Fahrbahnpfeils einer `oneWay`-Zelle (Blockpfeil, kein Chevron). Keine Spiellogik.
import type { Dir } from '../schema';
import { DIR_VECTOR } from './layout';
import type { Rect } from './layout';
import type { Point } from './direction';

/** Masse als Anteil der Zelle: Gesamtlaenge, Laenge der Spitze, halbe Breite von Schaft und Spitze. */
export const ROAD_ARROW_LENGTH = 0.74;
export const ROAD_ARROW_HEAD = 0.34;
export const ROAD_ARROW_SHAFT = 0.11;
export const ROAD_ARROW_WING = 0.29;
/** Eckenradius der Fahrbahnflaeche in px (wie die Zellen des Bretts). */
export const ROAD_RADIUS = 8;

/**
 * Umriss (7 Punkte, Spitze zuerst) eines Blockpfeils in Richtung `dir`, mittig im Rechteck `r`.
 * Die Richtung steckt allein in der Form, damit der Pfeil auch ohne Farbwahrnehmung lesbar ist.
 */
export function roadArrowPoints(dir: Dir, r: Rect): Point[] {
  const size = Math.min(r.w, r.h);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const [dx, dy] = DIR_VECTOR[dir];
  // Lokale Koordinaten: `a` laengs (in Pfeilrichtung), `c` quer dazu.
  const at = (a: number, c: number): Point => [
    cx + (dx * a - dy * c) * size,
    cy + (dy * a + dx * c) * size,
  ];
  const tip = ROAD_ARROW_LENGTH / 2;
  const neck = tip - ROAD_ARROW_HEAD;
  const tail = -tip;
  return [
    at(tip, 0),
    at(neck, ROAD_ARROW_WING),
    at(neck, ROAD_ARROW_SHAFT),
    at(tail, ROAD_ARROW_SHAFT),
    at(tail, -ROAD_ARROW_SHAFT),
    at(neck, -ROAD_ARROW_SHAFT),
    at(neck, -ROAD_ARROW_WING),
  ];
}
