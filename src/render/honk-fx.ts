// Comic-Schallzacken "HUP!" am hupenden Fahrzeug. Reine Geometrie plus ein kleiner Container.
import { Container, Graphics, Text } from 'pixi.js';
import { THEME } from './theme';

/** Zacken der Sprechblase; Innenradius als Anteil des Aussenradius. */
export const BURST_SPIKES = 9;
export const BURST_INNER_RATIO = 0.62;
/** Aussenradius und Schriftgroesse als Anteil der Zellgroesse. */
const BURST_RADIUS = 0.72;
const TEXT_SIZE = 0.27;
/** Leichte Schraeglage, wie von Hand gezeichnet. */
const BURST_TILT = -0.12;

/** Eckpunkte eines Sterns mit `spikes` Zacken, abwechselnd aussen und innen, um (0,0). */
export function burstPoints(
  outer: number,
  inner: number,
  spikes: number = BURST_SPIKES,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

export class HonkBurst extends Container {
  constructor(label: string, cell: number) {
    super();
    const outer = cell * BURST_RADIUS;
    const pts = burstPoints(outer, outer * BURST_INNER_RATIO).flat();
    const g = new Graphics();
    g.poly(pts.map((p) => p + THEME.shadowOffset)).fill(THEME.outline);
    g.poly(pts)
      .fill(THEME.star)
      .stroke({ width: THEME.outlineWidth, color: THEME.outline, join: 'round' });
    g.rotation = BURST_TILT;
    const text = new Text({
      text: label,
      style: {
        fontFamily: THEME.font,
        fontWeight: '800',
        fontSize: Math.round(cell * TEXT_SIZE),
        fill: THEME.ink,
      },
    });
    text.anchor.set(0.5);
    text.rotation = BURST_TILT;
    this.addChild(g, text);
  }
}
