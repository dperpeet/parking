// Darstellung verdeckter Mystery-Fahrzeuge: neutraler Stil und Schraffur. Reine Geometrie, kein Pixi.
import type { Point } from './direction';
import type { Rect } from './layout';
import { PALETTE, THEME } from './theme';

/** Was ein Fahrzeug zum Zeichnen braucht: Flaeche, Kontrastfarbe, Symbol und ob es schraffiert ist. */
export interface VehicleLook {
  fill: string;
  ink: string;
  glyph: string;
  hatched: boolean;
}

/** Fallback fuer unbekannte Farb-IDs (sollte nach der Level-Validierung nicht vorkommen). */
const UNKNOWN_FILL = '#CCCCCC';

/** Abstand der Schraffurlinien als Anteil der Zellgroesse. */
export const HATCH_SPACING = 0.22;
/** Strichstaerke der Schraffur als Anteil der Zellgroesse. */
export const HATCH_WIDTH = 0.06;

/** Verdeckt: neutraler Stil ohne Palettenfarbe und -symbol; sonst der Palettenstil der Farbe. */
export function vehicleLook(colorId: string, hidden: boolean): VehicleLook {
  if (hidden) {
    return {
      fill: THEME.mysteryFill,
      ink: THEME.mysteryInk,
      glyph: THEME.mysteryGlyph,
      hatched: true,
    };
  }
  const style = PALETTE[colorId];
  return style
    ? { fill: style.fill, ink: style.ink, glyph: style.glyph, hatched: false }
    : { fill: UNKNOWN_FILL, ink: THEME.ink, glyph: THEME.mysteryGlyph, hatched: false };
}

/**
 * Diagonale Schraffur (Linien x + y = k) im Rechteck `r`, auf `r` zugeschnitten, im Abstand `spacing`.
 * Wer abgerundete Ecken hat, uebergibt das um r * (1 - 1/sqrt 2) eingerueckte Rechteck: das liegt ganz innen.
 */
export function hatchSegments(r: Rect, spacing: number): Array<[Point, Point]> {
  const out: Array<[Point, Point]> = [];
  if (spacing <= 0 || r.w <= 0 || r.h <= 0) return out;
  const x0 = r.x;
  const x1 = r.x + r.w;
  const y0 = r.y;
  const y1 = r.y + r.h;
  for (let k = x0 + y0 + spacing; k < x1 + y1; k += spacing) {
    const lo = Math.max(x0, k - y1);
    const hi = Math.min(x1, k - y0);
    if (hi > lo) out.push([[lo, k - lo] as const, [hi, k - hi] as const]);
  }
  return out;
}

/** Einrueckung, ab der ein Rechteck ganz in einem abgerundeten Rechteck mit Radius `radius` liegt. */
export const roundInset = (radius: number): number => radius * (1 - Math.SQRT1_2);
