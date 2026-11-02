import { Container, Graphics, Text } from 'pixi.js';
import type { Dir } from '../schema';
import { PALETTE, THEME } from './theme';
import type { Rect } from './layout';

/** Anteile der Zellgroesse fuer die Frontscheibe. */
const WINDSHIELD_THICKNESS = 0.16;
const WINDSHIELD_MARGIN = 0.14;
const WINDSHIELD_SIDE_INSET = 0.2;
const GLYPH_SIZE = 0.42;

export class VehicleView extends Container {
  /** Ruheposition (obere linke Ecke des Rechtecks), Basis fuer Animationen. */
  readonly restX: number;
  readonly restY: number;

  constructor(
    readonly vehicleId: string,
    rect: Rect,
    dir: Dir,
    colorId: string,
    cell: number,
  ) {
    super();
    const style = PALETTE[colorId] ?? { fill: '#CCCCCC', ink: THEME.ink, glyph: '?' };
    const radius = Math.min(THEME.vehicleRadius, Math.min(rect.w, rect.h) / 2);
    this.restX = rect.x;
    this.restY = rect.y;
    this.position.set(rect.x, rect.y);

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
    glyph.position.set(rect.w / 2, rect.h / 2);
    this.addChild(glyph);
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
