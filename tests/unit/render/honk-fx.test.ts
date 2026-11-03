import { describe, expect, it } from 'vitest';
import { BURST_SPIKES, burstPoints } from '../../../src/render/honk-fx';

describe('burstPoints', () => {
  it('liefert abwechselnd Aussen- und Innenpunkte', () => {
    const pts = burstPoints(10, 6);
    expect(pts).toHaveLength(BURST_SPIKES * 2);
    pts.forEach(([x, y], i) => {
      expect(Math.hypot(x, y)).toBeCloseTo(i % 2 === 0 ? 10 : 6, 6);
    });
  });

  it('beginnt oben (Spitze nach oben)', () => {
    const [x, y] = burstPoints(10, 6)[0] ?? [0, 0];
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(-10, 6);
  });
});
