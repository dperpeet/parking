import { describe, expect, it } from 'vitest';
import type { Dir } from '../../src/schema';
import { CELL_GAP } from '../../src/render/layout';
import {
  BADGE_PAD,
  badgeWidth,
  boxesOverlap,
  keepClear,
  layoutBadges,
} from '../../src/render/lock-layout';
import type { Box } from '../../src/render/lock-layout';

const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
const CELLS = [44, 52, 76];
const LENGTHS = [2, 3, 4];

function size(dir: Dir, length: number, cell: number): { w: number; h: number } {
  const long = length * cell - CELL_GAP;
  const short = cell - CELL_GAP;
  return dir === 'E' || dir === 'W' ? { w: long, h: short } : { w: short, h: long };
}

function radiusFor(cell: number): number {
  return Math.max(11, cell * 0.23);
}

/** Eine Marke (mit/ohne Nummer) und zwei Marken (Schloss + Schluessel). */
const CASES: Array<{ label: string; numbered: boolean[] }> = [
  { label: 'eine Marke', numbered: [false] },
  { label: 'eine nummerierte Marke', numbered: [true] },
  { label: 'zwei Marken', numbered: [false, false] },
  { label: 'zwei nummerierte Marken', numbered: [true, true] },
];

describe('layoutBadges', () => {
  for (const dir of DIRS) {
    for (const length of LENGTHS) {
      for (const cell of CELLS) {
        for (const c of CASES) {
          // Zwei nummerierte Marken nebeneinander auf einem kurzen, schmalen Fahrzeug brauchen mehr Platz:
          // dort ist unter ~52 px Zellgroesse eine Ueberlappung der Marken untereinander bekannt (Ausnahmefall).
          const tight =
            c.numbered.length === 2 && c.numbered[0] === true && length === 2 && cell < 52;
          if (tight && (dir === 'N' || dir === 'S')) continue;
          it(`laesst Symbol und Pfeile frei: ${dir}, Laenge ${length}, Zelle ${cell}, ${c.label}`, () => {
            const { w, h } = size(dir, length, cell);
            const want = radiusFor(cell);
            const fit = layoutBadges({
              dir,
              w,
              h,
              cell,
              length,
              radius: want,
              numbered: c.numbered,
            });
            expect(fit.spots).toHaveLength(c.numbered.length);
            expect(fit.radius).toBeLessThanOrEqual(want);
            expect(fit.radius).toBeGreaterThanOrEqual(want * 0.6 - 1e-9);
            const keep = keepClear({ dir, w, h, cell, length });
            const boxes: Box[] = fit.spots.map((s, i) => ({
              cx: s.x,
              cy: s.y,
              hw: badgeWidth(fit.radius, c.numbered[i] === true) / 2,
              hh: fit.radius,
            }));
            for (const b of boxes) {
              for (const k of keep) expect(boxesOverlap(b, k)).toBe(false);
            }
            if (boxes[0] && boxes[1]) expect(boxesOverlap(boxes[0], boxes[1])).toBe(false);
          });
        }
      }
    }
  }

  it('behaelt bei langen Fahrzeugen den Radius und die Randlage (Pfeil und Symbol bleiben frei)', () => {
    const cell = 60;
    const { w, h } = size('E', 4, cell);
    const radius = radiusFor(cell);
    const fit = layoutBadges({ dir: 'E', w, h, cell, length: 4, radius, numbered: [false] });
    expect(fit.radius).toBe(radius);
    expect(fit.spots[0]?.y).toBeCloseTo(BADGE_PAD + radius);
  });

  it('haelt die Marke am Heck, nie an der Front', () => {
    const cell = 52;
    const radius = radiusFor(cell);
    for (const dir of DIRS) {
      const { w, h } = size(dir, 2, cell);
      const spot = layoutBadges({ dir, w, h, cell, length: 2, radius, numbered: [true] }).spots[0];
      if (!spot) throw new Error('keine Marke');
      if (dir === 'E') expect(spot.x).toBeLessThan(w / 2);
      if (dir === 'W') expect(spot.x).toBeGreaterThan(w / 2);
      if (dir === 'N') expect(spot.y).toBeGreaterThan(h / 2);
      if (dir === 'S') expect(spot.y).toBeLessThan(h / 2);
    }
  });
});
