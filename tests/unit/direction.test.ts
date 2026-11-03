import { describe, expect, it } from 'vitest';
import {
  CHEVRON_ARM,
  CHEVRON_SIZE,
  chevronCenters,
  chevronPoints,
  dashSegments,
  glyphCenter,
  headlightCenters,
  laneCells,
} from '../../src/render/direction';
import { VEHICLE_INSET } from '../../src/render/layout';

describe('laneCells', () => {
  it('liefert Zellen ab dem Feld vor dem Kopf bis zum Rand', () => {
    expect(laneCells({ x: 2, y: 1, dir: 'E', length: 2 }, 5, 4)).toEqual([
      [3, 1],
      [4, 1],
    ]);
    expect(laneCells({ x: 2, y: 1, dir: 'W', length: 2 }, 5, 4)).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(laneCells({ x: 0, y: 2, dir: 'N', length: 2 }, 5, 4)).toEqual([
      [0, 1],
      [0, 0],
    ]);
    expect(laneCells({ x: 0, y: 2, dir: 'S', length: 2 }, 5, 4)).toEqual([[0, 3]]);
  });

  it('ist leer, wenn der Kopf am Rand steht', () => {
    expect(laneCells({ x: 4, y: 0, dir: 'E', length: 2 }, 5, 4)).toEqual([]);
  });
});

describe('chevronPoints', () => {
  it('hat die Spitze in Blickrichtung und symmetrische Arme', () => {
    const [a, tip, b] = chevronPoints('E', 10, 10, 8);
    expect(tip).toEqual([14, 10]);
    expect(a[0]).toBe(6);
    expect(b[0]).toBe(6);
    expect(a[1] - 10).toBeCloseTo(8 * CHEVRON_ARM);
    expect(b[1] - 10).toBeCloseTo(-8 * CHEVRON_ARM);
  });

  it('zeigt fuer alle Richtungen vom Mittelpunkt weg', () => {
    const tips = { N: [10, 6], S: [10, 14], E: [14, 10], W: [6, 10] } as const;
    for (const dir of ['N', 'S', 'E', 'W'] as const) {
      expect(chevronPoints(dir, 10, 10, 8)[1]).toEqual(tips[dir]);
    }
  });
});

describe('chevronCenters', () => {
  it('haelt Abstand zur Windschutzscheibe und zum Symbol (Laenge 2)', () => {
    const cell = 40;
    const w = 2 * cell - 2 * VEHICLE_INSET;
    const h = cell - 2 * VEHICLE_INSET;
    const east = chevronCenters('E', 2, w, h, cell);
    expect(east).toHaveLength(1);
    const front = w - (east[0]?.[0] ?? 0);
    const tip = front - cell * CHEVRON_SIZE * 0.5;
    // Scheibe endet bei 0,14 + 0,16 Zelle; mindestens 0,15 Zelle Luft.
    expect(tip).toBeGreaterThanOrEqual(cell * (0.3 + 0.15));
    // Rueckseite des Chevrons liegt vor dem verschobenen Symbol.
    const glyphX = glyphCenter('E', 2, w, h, cell)[0];
    expect(glyphX).toBeLessThan(w / 2);
    expect((east[0]?.[0] ?? 0) - glyphX).toBeGreaterThan(cell * (0.21 + CHEVRON_SIZE / 2));
    const west = chevronCenters('W', 2, w, h, cell);
    expect(west[0]?.[0]).toBeLessThan(w / 2);
  });

  it('setzt ab Laenge 3 einen zweiten Chevron in die Heckzelle', () => {
    const cell = 40;
    const w = cell - 2 * VEHICLE_INSET;
    const h = 3 * cell - 2 * VEHICLE_INSET;
    const north = chevronCenters('N', 3, w, h, cell);
    const south = chevronCenters('S', 3, w, h, cell);
    expect(north[0]?.[1]).toBeLessThan(north[1]?.[1] ?? -Infinity);
    expect(south[0]?.[1]).toBeGreaterThan(south[1]?.[1] ?? Infinity);
    expect(chevronCenters('E', 1, w, w, cell)).toHaveLength(1);
  });
});

describe('glyphCenter', () => {
  it('bleibt bei langen Fahrzeugen mittig, schiebt kurze Richtung Heck', () => {
    expect(glyphCenter('N', 3, 32, 112, 40)).toEqual([16, 56]);
    const [x, y] = glyphCenter('N', 2, 32, 72, 40);
    expect(x).toBe(16);
    expect(y).toBeGreaterThan(36);
  });
});

describe('headlightCenters', () => {
  it('liegen an der Frontkante, symmetrisch zur Mittelachse', () => {
    const [a, b] = headlightCenters('E', 80, 40, 40);
    expect(a[0]).toBe(b[0]);
    expect(a[0]).toBeGreaterThan(40);
    expect(a[1] + b[1]).toBeCloseTo(40);
    const [c, d] = headlightCenters('W', 80, 40, 40);
    expect(c[0]).toBeLessThan(40);
    expect(c[1] + d[1]).toBeCloseTo(40);
    const [e, f] = headlightCenters('N', 40, 80, 40);
    expect(e[1]).toBeLessThan(40);
    expect(e[0] + f[0]).toBeCloseTo(40);
    const [g, i] = headlightCenters('S', 40, 80, 40);
    expect(g[1]).toBeGreaterThan(40);
    expect(g[0] + i[0]).toBeCloseTo(40);
  });
});

describe('dashSegments', () => {
  it('teilt eine Strecke in Striche', () => {
    expect(dashSegments([0, 0], [10, 0], 4, 0.5)).toEqual([
      [
        [0, 0],
        [2, 0],
      ],
      [
        [4, 0],
        [6, 0],
      ],
      [
        [8, 0],
        [10, 0],
      ],
    ]);
  });

  it('liefert nichts bei Laenge 0 oder Periode 0', () => {
    expect(dashSegments([1, 1], [1, 1], 4, 0.5)).toEqual([]);
    expect(dashSegments([0, 0], [5, 0], 0, 0.5)).toEqual([]);
  });
});
