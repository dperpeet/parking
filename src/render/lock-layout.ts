// Reine Geometrie: Platz fuer Schloss-/Schluesselmarken, ohne Farbsymbol und Richtungspfeile zu verdecken.
import type { Dir } from '../schema';
import {
  CHEVRON_ARM,
  CHEVRON_SIZE,
  CHEVRON_STROKE,
  GLYPH_SIZE,
  chevronCenters,
  glyphCenter,
} from './direction';

/** Abstand zwischen Marke und Fahrzeugrand (px) sowie Mindestluft zu Symbol, Pfeilen und anderen Marken (px). */
export const BADGE_PAD = 3;
const CLEARANCE = 2;
/** Breite der Nummernflaeche rechts neben dem Symbol (breite Marke), in Radien. */
export const NUMBER_WIDTH = 0.9;
/** Hoehe der Nummernflaeche unter dem Symbol (kompakte Marke), in Radien. */
export const NUMBER_HEIGHT = 0.9;
/** Schrittweite der Suche nach dem kleinsten Ueberstand (px). */
const SEARCH_STEP = 0.5;
/** Hoechster Ueberstand ueber die Kontur (Anteil des Radius), Verkleinerungsschritt und -untergrenze (Anteil). */
const MAX_OVERHANG = 0.5;
const SCALE_STEP = 0.05;
const MIN_SCALE = 0.6;
/** Breite Marken werden hoechstens bis hierhin verkleinert; danach wechseln nummerierte Marken zur kompakten Form. */
const WIDE_MIN_SCALE = 0.85;

export interface Box {
  /** Mittelpunkt und halbe Ausdehnung. */
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

export interface BadgeSpec {
  dir: Dir;
  w: number;
  h: number;
  cell: number;
  length: number;
  /** Gewuenschter Markenradius; wird bei Platzmangel verkleinert. */
  radius: number;
  /** Je Marke (in Reihenfolge der Platzierung): traegt sie eine Nummer? */
  numbered: readonly boolean[];
}

export interface BadgeLayout {
  /** Tatsaechlicher Radius (hoechstens der gewuenschte). */
  radius: number;
  /** Kompakte Form: Nummer unter dem Symbol statt daneben (schmaler, dafuer hoeher). */
  compact: boolean;
  spots: Array<{ x: number; y: number }>;
}

/** Ausdehnung einer Marke: Symbolkreis plus optionale Nummernflaeche (rechts davon oder, kompakt, darunter). */
export function badgeSize(
  radius: number,
  numbered: boolean,
  compact: boolean,
): { width: number; height: number } {
  const extra = numbered ? radius : 0;
  return compact
    ? { width: 2 * radius, height: 2 * radius + extra * NUMBER_HEIGHT }
    : { width: 2 * radius + extra * NUMBER_WIDTH, height: 2 * radius };
}

/** Hinterer Rand des Fahrzeugs: zwei Ecken, in denen Marken sitzen (Front traegt die Scheinwerfer). */
export function rearCorners(dir: Dir): Array<{ left: boolean; top: boolean }> {
  switch (dir) {
    case 'E':
      return [
        { left: true, top: true },
        { left: true, top: false },
      ];
    case 'W':
      return [
        { left: false, top: true },
        { left: false, top: false },
      ];
    case 'N':
      return [
        { left: true, top: false },
        { left: false, top: false },
      ];
    case 'S':
      return [
        { left: true, top: true },
        { left: false, top: true },
      ];
  }
}

/** Flaechen, die frei bleiben muessen: Farbsymbol und Richtungspfeile (als Rechtecke genaehert). */
export function keepClear(spec: Pick<BadgeSpec, 'dir' | 'w' | 'h' | 'cell' | 'length'>): Box[] {
  const { dir, w, h, cell, length } = spec;
  const horizontal = dir === 'E' || dir === 'W';
  const [gx, gy] = glyphCenter(dir, length, w, h, cell);
  const half = (cell * GLYPH_SIZE) / 2;
  const boxes: Box[] = [{ cx: gx, cy: gy, hw: half, hh: half }];
  const stroke = Math.max(0, cell * CHEVRON_STROKE) / 2;
  const along = (cell * CHEVRON_SIZE) / 2 + stroke;
  const across = cell * CHEVRON_SIZE * CHEVRON_ARM + stroke;
  for (const [cx, cy] of chevronCenters(dir, length, w, h, cell)) {
    boxes.push({ cx, cy, hw: horizontal ? along : across, hh: horizontal ? across : along });
  }
  return boxes;
}

export function boxesOverlap(a: Box, b: Box, gap = 0): boolean {
  return Math.abs(a.cx - b.cx) < a.hw + b.hw + gap && Math.abs(a.cy - b.cy) < a.hh + b.hh + gap;
}

/**
 * Platziert die Marken: zuerst buendig in den hinteren Ecken; stoesst eine Marke an Symbol, Pfeil oder eine
 * andere Marke, rutscht sie zuerst entlang der Fahrzeugachse nach innen an den Hindernissen vorbei, danach
 * mit dem kleinsten noetigen Ueberstand ueber die Kontur nach aussen (erst nach hinten, dann zur Seite). Reicht der erlaubte Ueberstand nicht, wird der Radius schrittweise
 * verkleinert (breite Form bis `WIDE_MIN_SCALE`), danach wechseln nummerierte Marken zur kompakten Form (Nummer
 * unter dem Symbol, bis `MIN_SCALE`), zuletzt schrumpft die breite Form bis `MIN_SCALE`; bleibt es eng, gewinnt die Lage mit dem hoechsten Ueberstand.
 */
export function layoutBadges(spec: BadgeSpec): BadgeLayout {
  const anyNumber = spec.numbered.some(Boolean);
  // Erst die breite Form (Nummer neben dem Symbol), danach bei Platzmangel die kompakte (Nummer darunter).
  const forms = anyNumber
    ? [
        { compact: false, floor: WIDE_MIN_SCALE },
        { compact: true, floor: MIN_SCALE },
        // Auf waagerechten Fahrzeugen ist die breite Form die schmalere: sie darf ganz schrumpfen.
        { compact: false, floor: MIN_SCALE },
      ]
    : [{ compact: false, floor: MIN_SCALE }];
  for (const { compact, floor } of forms) {
    for (let scale = 1; ; scale = Math.max(floor, scale - SCALE_STEP)) {
      const radius = spec.radius * scale;
      const spots = placeAll(spec, radius, compact, false);
      if (spots) return { radius, compact, spots };
      if (scale <= floor) break;
    }
  }
  const last = forms[forms.length - 1];
  const compact = last?.compact ?? false;
  const radius = spec.radius * MIN_SCALE;
  return { radius, compact, spots: placeAll(spec, radius, compact, true) ?? [] };
}

function placeAll(
  spec: BadgeSpec,
  radius: number,
  compact: boolean,
  force: boolean,
): Array<{ x: number; y: number }> | null {
  const { dir, w, h, numbered } = spec;
  const horizontal = dir === 'E' || dir === 'W';
  const corners = rearCorners(dir);
  const obstacles = keepClear(spec);
  const placed: Box[] = [];
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < numbered.length; i++) {
    const corner = corners[i] ?? corners[0];
    if (!corner) return null;
    const size = badgeSize(radius, numbered[i] === true, compact);
    const hw = size.width / 2;
    const hh = size.height / 2;
    const baseX = corner.left ? BADGE_PAD + hw : w - BADGE_PAD - hw;
    const baseY = corner.top ? BADGE_PAD + hh : h - BADGE_PAD - hh;
    const sx = corner.left ? -1 : 1;
    const sy = corner.top ? -1 : 1;
    const at = (along: number, across: number): Box => ({
      cx: baseX + sx * (horizontal ? along : across),
      cy: baseY + sy * (horizontal ? across : along),
      hw,
      hh,
    });
    const free = (b: Box): boolean =>
      !obstacles.some((o) => boxesOverlap(b, o, CLEARANCE)) &&
      !placed.some((o) => boxesOverlap(b, o, CLEARANCE));
    const max = radius * MAX_OVERHANG;
    const inward = (horizontal ? w : h) / 2;
    // Reihenfolge: buendig, nach innen an Pfeil/Symbol vorbei, dann Ueberstand ueber die Kontur.
    const tries: Array<[number, number]> = [[0, 0]];
    for (let t = SEARCH_STEP; t <= inward; t += SEARCH_STEP) tries.push([-t, 0]);
    for (let t = SEARCH_STEP; t <= max; t += SEARCH_STEP) tries.push([t, 0], [t, t]);
    let best: Box | null = null;
    for (const [a, c] of tries) {
      const box = at(a, c);
      if (free(box)) {
        best = box;
        break;
      }
    }
    if (!best) {
      if (!force) return null;
      best = at(max, max);
    }
    placed.push(best);
    out.push({ x: best.cx, y: best.cy });
  }
  return out;
}
