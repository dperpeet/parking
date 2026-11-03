import { describe, expect, it } from 'vitest';
import { computeBoardLayout, vehicleCellBox } from '../../src/render/layout';
import { announce, colorAdjective } from '../../src/ui/strings';
import { fakeEngine } from '../support/fake-engine';
import { level, rules } from './helpers';

describe('layout', () => {
  it('Fahrzeugbox je Blickrichtung (Kopf bei x,y)', () => {
    expect(vehicleCellBox({ x: 3, y: 0, dir: 'N', length: 3 })).toEqual({
      col: 3,
      row: 0,
      cols: 1,
      rows: 3,
    });
    expect(vehicleCellBox({ x: 4, y: 4, dir: 'S', length: 2 })).toEqual({
      col: 4,
      row: 3,
      cols: 1,
      rows: 2,
    });
    expect(vehicleCellBox({ x: 5, y: 1, dir: 'E', length: 2 })).toEqual({
      col: 4,
      row: 1,
      cols: 2,
      rows: 1,
    });
    expect(vehicleCellBox({ x: 1, y: 5, dir: 'W', length: 3 })).toEqual({
      col: 1,
      row: 5,
      cols: 3,
      rows: 1,
    });
  });

  it('Brett passt in die Zeichenflaeche', () => {
    const l = computeBoardLayout(6, 6, 358, 358);
    expect(l.board.x + l.board.w).toBeLessThanOrEqual(358);
    expect(l.cell * 6).toBeLessThan(358);
  });
});

describe('Ansagen', () => {
  it('dekliniert Farbnamen', () => {
    expect(colorAdjective('blue', 'es')).toBe('Blaues');
    expect(colorAdjective('orange', 'er')).toBe('Oranger');
    expect(colorAdjective('purple', 'es')).toBe('Lila');
  });

  it('kuendigt das Ausfahren an', () => {
    const s = fakeEngine.createGame(level, rules);
    expect(announce({ type: 'vehicleExited', vehicleId: 'v2', slotIndex: 1, path: [] }, s)).toBe(
      'Blaues Fahrzeug fährt zur Halteposition 2',
    );
  });
});
