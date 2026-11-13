import { Container, Graphics, Text } from 'pixi.js';
import type { Dir } from '../schema';
import { THEME } from './theme';
import type { Rect } from './layout';
import {
  HATCH_SPACING,
  HATCH_WIDTH,
  hatchSegments,
  roundInset,
  vehicleLook,
} from './mystery-style';
import type { VehicleLook } from './mystery-style';
import { LockDecor } from './lock-decor';
import type { LockMark } from './lock-marks';
import {
  CHEVRON_SIZE,
  CHEVRON_STROKE,
  GLYPH_SIZE,
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
/** Mindest-Strichstaerke des Chevrons und Scheinwerferkontur in px. */
const CHEVRON_MIN_STROKE = 2;
const HEADLIGHT_OUTLINE = 1.5;
/** Leuchtrahmen des Tipps: Abstand zum Fahrzeug und Strichstaerke in px. */
const HINT_GLOW_GROW = 5;
const HINT_GLOW_WIDTH = 7;
/** Aufdecken: Ab diesem Fortschritt zeigt die Flaeche die echte Farbe; kleinste Breite beim Umklappen. */
const REVEAL_SWAP = 0.5;
const REVEAL_MIN_SCALE = 0.05;

export class VehicleView extends Container {
  /** Ruheposition (obere linke Ecke des Rechtecks), Basis fuer Animationen. */
  restX: number;
  restY: number;
  private glow: Graphics | null = null;
  private decor: LockDecor | null = null;
  private decorKey = '';
  private readonly size: { w: number; h: number; radius: number };

  /** Farbe verdeckt (Mystery-Fahrzeug)? */
  private hiddenColor: boolean;
  /** Fahrzeugflaeche mit Scheibe, Lichtern, Chevrons und Symbol; beim Aufdecken ersetzt. */
  private body: Container;

  constructor(
    readonly vehicleId: string,
    rect: Rect,
    private readonly dir: Dir,
    private readonly colorId: string,
    private readonly cell: number,
    private readonly length = 1,
    hidden = false,
  ) {
    super();
    const radius = Math.min(THEME.vehicleRadius, Math.min(rect.w, rect.h) / 2);
    this.restX = rect.x;
    this.restY = rect.y;
    this.position.set(rect.x, rect.y);
    this.size = { w: rect.w, h: rect.h, radius };
    this.hiddenColor = hidden;
    this.body = this.drawBody(vehicleLook(colorId, hidden));
    this.addChild(this.body);
  }

  get hidden(): boolean {
    return this.hiddenColor;
  }

  /** Deckt die Farbe sofort auf (ohne Animation), z. B. beim Abgleich mit dem Zustand. */
  setHidden(hidden: boolean): void {
    if (hidden === this.hiddenColor) return;
    this.hiddenColor = hidden;
    this.replaceBody(vehicleLook(this.colorId, hidden));
  }

  /**
   * Fortschritt 0..1 des Aufdeckens: Die Flaeche klappt quer zur Laengsachse zu (bis 0,5), wechselt
   * zur echten Farbe und klappt wieder auf. Bei 1 ist das Fahrzeug aufgedeckt.
   */
  setRevealProgress(p: number): void {
    if (this.hiddenColor && p >= REVEAL_SWAP) this.setHidden(false);
    const fold = Math.abs(1 - 2 * Math.min(1, Math.max(0, p)));
    const flat = REVEAL_MIN_SCALE + (1 - REVEAL_MIN_SCALE) * fold;
    if (this.dir === 'E' || this.dir === 'W') this.body.scale.set(1, flat);
    else this.body.scale.set(flat, 1);
  }

  private replaceBody(look: VehicleLook): void {
    const index = this.getChildIndex(this.body);
    const scale = { x: this.body.scale.x, y: this.body.scale.y };
    this.body.destroy({ children: true });
    this.body = this.drawBody(look);
    this.body.scale.set(scale.x, scale.y);
    this.addChildAt(this.body, index);
  }

  /** Zeichnet die Flaeche um die Mitte (Pivot), damit das Aufklappen symmetrisch wirkt. */
  private drawBody(style: VehicleLook): Container {
    const { w, h, radius } = this.size;
    const { cell, dir, length } = this;
    const body = new Container();
    body.pivot.set(w / 2, h / 2);
    body.position.set(w / 2, h / 2);
    const g = new Graphics();
    g.roundRect(THEME.shadowOffset, THEME.shadowOffset, w, h, radius).fill(THEME.outline);
    g.roundRect(0, 0, w, h, radius).fill(style.fill);
    if (style.hatched) {
      const inset = roundInset(radius);
      const inner = { x: inset, y: inset, w: w - 2 * inset, h: h - 2 * inset };
      for (const [a, b] of hatchSegments(inner, cell * HATCH_SPACING)) {
        g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
      }
      g.stroke({ width: cell * HATCH_WIDTH, color: THEME.mysteryStripe, cap: 'round' });
    }
    g.roundRect(0, 0, w, h, radius).stroke({ width: THEME.outlineWidth, color: THEME.outline });
    const t = cell * WINDSHIELD_THICKNESS;
    const m = cell * WINDSHIELD_MARGIN;
    const s = cell * WINDSHIELD_SIDE_INSET;
    const ws = windshield(dir, w, h, t, m, s);
    g.roundRect(ws.x, ws.y, ws.w, ws.h, t / 2).fill(THEME.windshield);
    // Scheinwerfer an der Front (mit Kontur), Chevrons in Kontrastfarbe auf dem Dach.
    for (const [lx, ly] of headlightCenters(dir, w, h, cell)) {
      g.circle(lx, ly, cell * HEADLIGHT_RADIUS)
        .fill(THEME.star)
        .stroke({ width: HEADLIGHT_OUTLINE, color: THEME.outline });
    }
    for (const [cx, cy] of chevronCenters(dir, length, w, h, cell)) {
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
    body.addChild(g);

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
    glyph.position.set(...glyphCenter(dir, length, w, h, cell));
    body.addChild(glyph);
    return body;
  }

  /** Setzt die Ruheposition neu (nach dem Ausweichen) und stellt das Fahrzeug dorthin. */
  placeAt(rect: Rect): void {
    this.restX = rect.x;
    this.restY = rect.y;
    this.position.set(rect.x, rect.y);
  }

  /**
   * Lage waehrend einer Fahrt mit Knick: Mittelpunkt (px) und Drehung gegenueber der Ruhelage (Bogenmass).
   * Dreht um die Fahrzeugmitte; danach wird das Fahrzeug nur noch entfernt.
   */
  setPose(cx: number, cy: number, rotation: number): void {
    this.pivot.set(this.size.w / 2, this.size.h / 2);
    this.position.set(cx, cy);
    this.rotation = rotation;
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
      length: this.length,
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
