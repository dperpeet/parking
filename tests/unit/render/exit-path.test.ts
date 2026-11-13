import { describe, expect, it } from 'vitest';
import {
  dirAngle,
  exitDistance,
  exitPose,
  exitTrack,
  sampleTrack,
} from '../../../src/render/exit-path';
import { roadArrowPoints } from '../../../src/render/road-arrow';

type Cell = [number, number];

describe('exitTrack', () => {
  it('gerader Weg: nur Anfangs- und Endpunkt, durch die Zellmitten', () => {
    const path: Cell[] = [
      [2, 2],
      [3, 2],
    ];
    const track = exitTrack([1, 2], 'E', path, 'E', 2);
    expect(track.points).toEqual([
      [-0.5, 2.5],
      [6.5, 2.5],
    ]);
    expect(track.headAt).toBe(2);
  });

  it('Knick: Kopf -> Pfeilzelle -> Ausfahrt in exitDir', () => {
    // Fahrzeug Richtung Osten, Pfeil auf (3,1) nach Norden.
    const path: Cell[] = [
      [2, 1],
      [3, 1],
      [3, 0],
    ];
    const track = exitTrack([1, 1], 'E', path, 'N', 1);
    expect(track.points).toEqual([
      [0.5, 1.5],
      [3.5, 1.5],
      [3.5, -1.5],
    ]);
  });

  it('leerer Weg (Kopf am Rand): faehrt von der Kopfzelle aus hinaus', () => {
    const track = exitTrack([0, 0], 'N', [], 'N', 1);
    expect(track.points).toEqual([
      [0.5, 1.5],
      [0.5, -1.5],
    ]);
  });
});

describe('sampleTrack', () => {
  const pts: Cell[] = [
    [0, 0],
    [2, 0],
    [2, 3],
  ];
  it('laeuft entlang der Stuecke', () => {
    expect(sampleTrack(pts, 1)).toEqual([1, 0]);
    expect(sampleTrack(pts, 2)).toEqual([2, 0]);
    expect(sampleTrack(pts, 4)).toEqual([2, 2]);
  });
  it('verlaengert vor dem Anfang und hinter dem Ende', () => {
    expect(sampleTrack(pts, -1)).toEqual([-1, 0]);
    expect(sampleTrack(pts, 6)).toEqual([2, 4]);
  });
  it('leerer Zug liefert den Ursprung', () => {
    expect(sampleTrack([], 3)).toEqual([0, 0]);
  });
});

describe('exitPose', () => {
  const path: Cell[] = [
    [3, 1],
    [4, 1],
    [4, 0],
  ];

  it('in Ruhelage: Mitte des Fahrzeugs und Winkel der Blickrichtung', () => {
    // Laenge 2 Richtung Osten, Kopf (2,1): belegt (1,1) und (2,1), Mitte bei (2, 1.5).
    const track = exitTrack([2, 1], 'E', path, 'N', 2);
    const pose = exitPose(track, 2, 0);
    expect(pose.x).toBeCloseTo(2);
    expect(pose.y).toBeCloseTo(1.5);
    expect(pose.angle).toBeCloseTo(dirAngle('E'));
  });

  it('dreht sich am Knick stetig und zeigt danach in exitDir', () => {
    const track = exitTrack([2, 1], 'E', path, 'N', 2);
    const total = exitDistance(path.length, 2);
    const steps = 40;
    const angles = Array.from(
      { length: steps + 1 },
      (_, i) => exitPose(track, 2, (total * i) / steps).angle,
    );
    for (let i = 1; i < angles.length; i++) {
      // Osten (0) nach Norden (-pi/2): der Winkel nimmt nie zu und springt nicht.
      expect(angles[i]!).toBeLessThanOrEqual(angles[i - 1]! + 1e-9);
      expect(angles[i - 1]! - angles[i]!).toBeLessThan(Math.PI / 4);
    }
    expect(Math.min(...angles)).toBeCloseTo(dirAngle('N'));
    const end = exitPose(track, 2, total);
    expect(end.angle).toBeCloseTo(dirAngle('N'));
    // Am Ende liegt das ganze Fahrzeug (halbe Laenge 1) oberhalb des Rasters.
    expect(end.y + 1).toBeLessThanOrEqual(0);
    expect(end.x).toBeCloseTo(4.5);
  });

  it('gerader Weg entspricht reiner Verschiebung', () => {
    const track = exitTrack([1, 3], 'S', [[1, 4]], 'S', 3);
    const a = exitPose(track, 3, 0);
    const b = exitPose(track, 3, 1.25);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y - a.y).toBeCloseTo(1.25);
    expect(b.angle).toBeCloseTo(dirAngle('S'));
  });
});

describe('exitDistance und dirAngle', () => {
  it('Strecke = Wegzellen + Laenge (wie geradeaus)', () => {
    expect(exitDistance(3, 2)).toBe(5);
    expect(exitDistance(0, 1)).toBe(1);
  });
  it('Winkel der vier Richtungen (y nach unten)', () => {
    expect(dirAngle('E')).toBeCloseTo(0);
    expect(dirAngle('S')).toBeCloseTo(Math.PI / 2);
    expect(dirAngle('W')).toBeCloseTo(Math.PI);
    expect(dirAngle('N')).toBeCloseTo(-Math.PI / 2);
  });
});

describe('roadArrowPoints', () => {
  const r = { x: 10, y: 20, w: 40, h: 40 };
  it('Spitze zeigt in Pfeilrichtung, Umriss liegt in der Zelle', () => {
    const expected = { N: [30, 25.2], S: [30, 54.8], E: [44.8, 40], W: [15.2, 40] } as const;
    for (const dir of ['N', 'S', 'E', 'W'] as const) {
      const pts = roadArrowPoints(dir, r);
      expect(pts).toHaveLength(7);
      expect(pts[0]![0]).toBeCloseTo(expected[dir][0]);
      expect(pts[0]![1]).toBeCloseTo(expected[dir][1]);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(r.x);
        expect(x).toBeLessThanOrEqual(r.x + r.w);
        expect(y).toBeGreaterThanOrEqual(r.y);
        expect(y).toBeLessThanOrEqual(r.y + r.h);
      }
    }
  });
  it('symmetrisch zur Laengsachse', () => {
    const pts = roadArrowPoints('E', r);
    expect(pts[1]![1] - 40).toBeCloseTo(-(pts[6]![1] - 40));
    expect(pts[1]![0]).toBeCloseTo(pts[6]![0]);
  });
});
