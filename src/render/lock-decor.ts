// Schloss- und Schluessel-Darstellung auf einem Fahrzeug (Comic-Stil, nur Farben aus theme.ts).
import { Container, Graphics, Text } from 'pixi.js';
import type { Dir } from '../schema';
import { dashSegments } from './direction';
import { THEME } from './theme';

/** Gestrichelter Innenrahmen: Abstand zum Rand, Strichperiode (Anteil Zelle), Strichanteil, Staerke. */
const DASH_INSET = 6;
const DASH_PERIOD = 0.2;
const DASH_RATIO = 0.55;
const DASH_WIDTH = 2.5;
/** Marke: Radius als Anteil der Zelle (mindestens in px), Abstand zum Fahrzeugrand, Konturstaerke. */
const BADGE_RADIUS = 0.23;
const BADGE_MIN_RADIUS = 11;
const BADGE_PAD = 3;
const BADGE_OUTLINE = 2;
/** Breite der Nummernflaeche rechts neben dem Symbol, in Radien. */
const NUMBER_WIDTH = 0.9;
/** Symbolgroesse (Anteil des Markenradius) und Mindeststrichstaerke. */
const ICON_SIZE = 0.6;
const ICON_MIN_STROKE = 1.5;
const ICON_STROKE = 0.34;
/** Entsperr-Animation: ab wann das Schloss offen gezeichnet wird, ab wann es ausblendet, Aufstieg und Wackeln. */
const OPEN_AT = 0.2;
const FADE_FROM = 0.45;
const POP_SCALE = 0.7;
const POP_TILT = 0.5;
const RISE_RATIO = 1.2;

export interface DecorSpec {
  w: number;
  h: number;
  radius: number;
  cell: number;
  dir: Dir;
  /** Nummer des Schlosses (null: Fahrzeug ist nicht gesperrt). */
  lock: number | null;
  /** Nummer des Schluessels (null: kein Schluessel-Fahrzeug). */
  key: number | null;
  /** Nummern nur zeigen, wenn mehrere Schluessel im Level sind. */
  numbered: boolean;
}

type Kind = 'lock' | 'key';

/** Hinterer Rand des Fahrzeugs: zwei Ecken, in denen Marken sitzen (Front trägt die Scheinwerfer). */
function rearCorners(dir: Dir): Array<{ left: boolean; top: boolean }> {
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

function drawLock(g: Graphics, u: number, open: boolean): void {
  const stroke = Math.max(ICON_MIN_STROKE, u * ICON_STROKE);
  g.roundRect(-u, -u * 0.1, 2 * u, 1.3 * u, u * 0.25).fill(THEME.outline);
  const lift = open ? -u * 0.55 : 0;
  const cy = -u * 0.1 + lift;
  const r = u * 0.65;
  g.moveTo(-r, cy).arc(0, cy, r, Math.PI, 2 * Math.PI);
  // Geschlossen reicht der Buegel auf beiden Seiten in den Koerper, offen nur links.
  if (!open) g.lineTo(r, -u * 0.1);
  g.moveTo(-r, cy).lineTo(-r, -u * 0.1);
  g.stroke({ width: stroke, color: THEME.outline, cap: 'round', join: 'round' });
}

function drawKey(g: Graphics, u: number): void {
  const stroke = Math.max(ICON_MIN_STROKE, u * ICON_STROKE);
  g.circle(-u * 0.45, u * 0.45, u * 0.5).stroke({ width: stroke, color: THEME.outline });
  g.moveTo(-u * 0.1, u * 0.1)
    .lineTo(u * 0.95, -u * 0.95)
    .moveTo(u * 0.55, -u * 0.55)
    .lineTo(u * 0.95, -u * 0.15)
    .moveTo(u * 0.2, -u * 0.2)
    .lineTo(u * 0.55, 0.15 * u)
    .stroke({ width: stroke, color: THEME.outline, cap: 'round', join: 'round' });
}

/** Eine Marke (Pille mit Schloss oder Schluessel und optionaler Nummer). */
function badge(kind: Kind, number: number | null, radius: number, open = false): Container {
  const c = new Container();
  const numberW = number === null ? 0 : radius * NUMBER_WIDTH;
  const width = 2 * radius + numberW;
  const g = new Graphics();
  g.roundRect(-width / 2, -radius, width, 2 * radius, radius)
    .fill(kind === 'lock' ? THEME.panel : THEME.star)
    .stroke({ width: BADGE_OUTLINE, color: THEME.outline });
  c.addChild(g);
  const icon = new Graphics();
  icon.position.set(-width / 2 + radius, 0);
  const u = radius * ICON_SIZE * 2;
  if (kind === 'lock') drawLock(icon, u / 2, open);
  else drawKey(icon, u / 2);
  c.addChild(icon);
  if (number !== null) {
    const text = new Text({
      text: String(number),
      style: {
        fontFamily: THEME.font,
        fontWeight: '800',
        fontSize: Math.round(radius * 1.15),
        fill: THEME.ink,
      },
    });
    text.anchor.set(0.5);
    text.position.set(width / 2 - radius * 0.62, radius * 0.08);
    c.addChild(text);
  }
  return c;
}

export class LockDecor extends Container {
  private readonly dim: Graphics | null = null;
  private lockBadge: Container | null = null;
  private lockHome = { x: 0, y: 0 };
  private readonly radius: number;
  private opened = false;
  private readonly lockNumber: number | null;

  constructor(private readonly spec: DecorSpec) {
    super();
    const { w, h, cell, lock, key, numbered } = spec;
    const radius = Math.max(BADGE_MIN_RADIUS, cell * BADGE_RADIUS);
    this.radius = radius;
    this.lockNumber = numbered ? lock : null;
    if (lock !== null) {
      const dim = new Graphics();
      dim.roundRect(0, 0, w, h, spec.radius).fill(THEME.lockDim);
      const period = cell * DASH_PERIOD;
      const i = DASH_INSET;
      const corners: Array<[number, number]> = [
        [i, i],
        [w - i, i],
        [w - i, h - i],
        [i, h - i],
      ];
      for (let k = 0; k < corners.length; k++) {
        const a = corners[k];
        const b = corners[(k + 1) % corners.length];
        if (!a || !b) continue;
        for (const [from, to] of dashSegments(a, b, period, DASH_RATIO)) {
          dim.moveTo(from[0], from[1]).lineTo(to[0], to[1]);
        }
      }
      dim.stroke({ width: DASH_WIDTH, color: THEME.panel, cap: 'round' });
      this.dim = dim;
      this.addChild(dim);
    }
    const slots = rearCorners(spec.dir);
    let slot = 0;
    const place = (b: Container, badgeWidth: number): void => {
      const corner = slots[slot++] ?? slots[0];
      if (!corner) return;
      const half = badgeWidth / 2;
      b.position.set(
        corner.left ? BADGE_PAD + half : w - BADGE_PAD - half,
        corner.top ? BADGE_PAD + radius : h - BADGE_PAD - radius,
      );
      this.addChild(b);
    };
    const width = (n: number | null): number =>
      2 * radius + (n === null ? 0 : radius * NUMBER_WIDTH);
    if (lock !== null) {
      const n = numbered ? lock : null;
      const b = badge('lock', n, radius);
      place(b, width(n));
      this.lockBadge = b;
      this.lockHome = { x: b.x, y: b.y };
    }
    if (key !== null) {
      const n = numbered ? key : null;
      place(badge('key', n, radius), width(n));
    }
  }

  /** 0..1: Schloss springt auf, steigt und blendet aus; die Abdunklung verschwindet. */
  setUnlockProgress(p: number): void {
    const { dim, lockBadge } = this;
    if (dim) dim.alpha = 1 - p;
    if (!lockBadge) return;
    if (p >= OPEN_AT && !this.opened) {
      this.opened = true;
      const fresh = badge('lock', this.lockNumber, this.radius, true);
      fresh.position.copyFrom(lockBadge.position);
      this.removeChild(lockBadge);
      lockBadge.destroy({ children: true });
      this.addChild(fresh);
      this.lockBadge = fresh;
    }
    const target = this.lockBadge;
    if (!target) return;
    const pop = Math.sin(Math.PI * p);
    target.scale.set(1 + POP_SCALE * pop);
    target.rotation = -POP_TILT * pop;
    target.position.set(this.lockHome.x, this.lockHome.y - p * this.radius * RISE_RATIO);
    target.alpha = p < FADE_FROM ? 1 : 1 - (p - FADE_FROM) / (1 - FADE_FROM);
  }
}
