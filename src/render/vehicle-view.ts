import { Container, Graphics, Text } from 'pixi.js';
import type { Dir } from '../schema';
import { PALETTE, THEME } from './theme';
import type { Rect } from './layout';
import { LockDecor } from './lock-decor';
import type { LockMark } from './lock-marks';
import {
  CHEVRON_SIZE,
  HEADLIGHT_RADIUS,
  chevronCenters,
  chevronPoints,
  glyphCenter,
  headlightCenters,
} from './direction';

/** Anteile der Zellgroesse fuer die Frontscheibe. */
const WINDSHIELD_THICKNESS = 0.16;
const WINDSHIELD_MARGIN = 0.14;
const WINDSHIELD_SIDE_INSET = 0.2;
const GLYPH_SIZE = 0.42;
/** Chevron-Strichstaerke als Anteil der Zellgroesse; Mindeststaerke und Scheinwerferkontur in px. */
const CHEVRON_STROKE = 0.085;
const CHEVRON_MIN_STROKE = 2;
const HEADLIGHT_OUTLINE = 1.5;
/** Leuchtrahmen des Tipps: Abstand zum Fahrzeug und Strichstaerke in px. */
const HINT_GLOW_GROW = 5;
const HINT_GLOW_WIDTH = 7;

export class VehicleView extends Container {
  /** Ruheposition (obere linke Ecke des Rechtecks), Basis fuer Animationen. */
  readonly restX: number;
  readonly restY: number;
  private glow: Graphics | null = null;
  private decor: LockDecor | null = null;
  private decorKey = '';
  private readonly size: { w: number; h: number; radius: number };

  constructor(
    readonly vehicleId: string,
    rect: Rect,
    private readonly dir: Dir,
    colorId: string,
    private readonly cell: number,
    length = 1,
  ) {
    super();
    const style = PALETTE[colorId] ?? { fill: '#CCCCCC', ink: THEME.ink, glyph: '?' };
    const radius = Math.min(THEME.vehicleRadius, Math.min(rect.w, rect.h) / 2);
    this.restX = rect.x;
    this.restY = rect.y;
    this.position.set(rect.x, rect.y);
    this.size = { w: rect.w, h: rect.h, radius };

    const g = new Graphics();
    g.roundRect(THEME.shadowOffset, THEME.shadowOffset, rect.w, rect.h, radius).fill(THEME.outline);
    g.roundRect(0, 0, rect.w, rect.h, radius)
      .fill(style.fill)
      .stroke({ width: THEME.outlineWidth, color: THEME.outline });
    const t = cell * WINDSHIELD_THICKNESS;
    const m = cell * WINDSHIELD_MARGIN;
    const s = cell * WINDSHIELD_SIDE_INSET;
    const ws = windshield(dir, rect.w, rect.h, t, m, s);
    g.roundRect(ws.x, ws.y, ws.w, ws.h, t / 2).fill(THEME.windshield);
    // Scheinwerfer an der Front (mit Kontur), Chevrons in Kontrastfarbe auf dem Dach.
    for (const [lx, ly] of headlightCenters(dir, rect.w, rect.h, cell)) {
      g.circle(lx, ly, cell * HEADLIGHT_RADIUS)
        .fill(THEME.star)
        .stroke({ width: HEADLIGHT_OUTLINE, color: THEME.outline });
    }
    for (const [cx, cy] of chevronCenters(dir, length, rect.w, rect.h, cell)) {
      const [a, tip, b] = chevronPoints(dir, cx, cy, cell * CHEVRON_SIZE);
      g.moveTo(a[0], a[1])
        .lineTo(tip[0], tip[1])
        .lineTo(b[0], b[1])
        .stroke({
          width: Math.max(CHEVRON_MIN_STROKE, cell * CHEVRON_STROKE),
          color: style.ink,
          cap: 'round',
          join: 'round',
        });
    }
    this.addChild(g);

    const glyph = new Text({
      text: style.glyph,
      style: {
        fontFamily: THEME.font,
        fontWeight: '800',
        fontSize: Math.round(cell * GLYPH_SIZE),
        fill: style.ink,
      },
    });
    glyph.anchor.set(0.5);
    glyph.position.set(...glyphCenter(dir, length, rect.w, rect.h, cell));
    this.addChild(glyph);
  }

  /** Setzt Schloss und Schluessel-Symbol; ohne Aenderung bleibt die Darstellung unveraendert. */
  setLock(mark: LockMark, numbered: boolean): void {
    const key = `${mark.lock ?? '-'}|${mark.key ?? '-'}|${numbered}`;
    if (key === this.decorKey) return;
    this.decorKey = key;
    this.decor?.destroy({ children: true });
    this.decor = null;
    if (mark.lock === null && mark.key === null) return;
    const { w, h, radius } = this.size;
    this.decor = new LockDecor({
      w,
      h,
      radius,
      cell: this.cell,
      dir: this.dir,
      lock: mark.lock,
      key: mark.key,
      numbered,
    });
    this.addChild(this.decor);
  }

  /** Fortschritt 0..1 der Entsperr-Animation (Schloss springt auf und verschwindet). */
  setUnlockProgress(p: number): void {
    this.decor?.setUnlockProgress(p);
  }

  /** Leuchtrahmen fuer den Tipp. alpha 0 blendet ihn aus. */
  setGlow(alpha: number): void {
    if (alpha <= 0) {
      this.glow?.destroy();
      this.glow = null;
      return;
    }
    if (!this.glow) {
      const { w, h, radius } = this.size;
      const grow = HINT_GLOW_GROW;
      const g = new Graphics();
      g.roundRect(-grow, -grow, w + 2 * grow, h + 2 * grow, radius + grow).stroke({
        width: HINT_GLOW_WIDTH,
        color: THEME.accent,
      });
      this.glow = g;
      this.addChildAt(g, 0);
    }
    this.glow.alpha = alpha;
  }
}

function windshield(dir: Dir, w: number, h: number, t: number, m: number, s: number): Rect {
  switch (dir) {
    case 'E':
      return { x: w - m - t, y: s, w: t, h: h - 2 * s };
    case 'W':
      return { x: m, y: s, w: t, h: h - 2 * s };
    case 'N':
      return { x: s, y: m, w: w - 2 * s, h: t };
    case 'S':
      return { x: s, y: h - m - t, w: w - 2 * s, h: t };
  }
}
