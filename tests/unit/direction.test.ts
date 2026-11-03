import { describe, expect, it } from 'vitest';
import {
  CHEVRON_ARM,
  chevronCenters,
  chevronPoints,
  dashSegments,
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
  it('setzt je einen Chevron in Kopf- und Heckzelle', () => {
    const cell = 40;
    const w = 2 * cell - 2 * VEHICLE_INSET;
    const h = cell - 2 * VEHICLE_INSET;
    const [head, tail] = chevronCenters('E', 2, w, h, cell);
    expect(head?.[0]).toBeGreaterThan(tail?.[0] ?? Infinity);
    expect(head?.[1]).toBe(h / 2);
    const [headW, tailW] = chevronCenters('W', 2, w, h, cell);
    expect(headW?.[0]).toBeLessThan(tailW?.[0] ?? -Infinity);
  });

  it('kennt senkrechte Richtungen und Laenge 1', () => {
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
