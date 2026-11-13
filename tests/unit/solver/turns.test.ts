import { describe, expect, it } from 'vitest';
import { createGame } from '../../../src/engine';
import { Level } from '../../../src/schema';
import { analyze } from '../../../src/solver/analyze';
import { blindAnalysis } from '../../../src/solver/blind';
import { hint } from '../../../src/solver/hint';
import { rulesFor } from '../helpers';

/**
 * 5x5 mit Abbiegepfeil bei (3,2) nach Sueden: V (blau) biegt ab und wird von B (gruen) blockiert; geradeaus
 * stuende C (pink) im Weg, blockiert aber nicht. Nur B zuerst gewinnt.
 */
function turnsLevel(mystery: boolean): Level {
  return Level.parse({
    schema: 'parking.level/1',
    id: 'turns',
    title: 'Abbiegen',
    ruleset: 'classic',
    overrides: {
      movement: { model: 'turns' },
      special: { oneWay: true, mysteryVehicles: mystery },
    },
    grid: { width: 5, height: 5, cells: [{ x: 3, y: 2, type: 'oneWay', dir: 'S' }] },
    vehicles: [
      { id: 'V', pos: [1, 2], dir: 'E', type: 's', color: 'blue', mystery },
      { id: 'B', pos: [3, 4], dir: 'E', type: 's', color: 'green' },
      { id: 'C', pos: [4, 1], dir: 'N', type: 's', color: 'pink' },
    ],
    passengers: ['blue', 'blue', 'green', 'green', 'pink', 'pink'],
  });
}

describe('solver with turning arrows', () => {
  it('analyze uses the bent paths', () => {
    const level = turnsLevel(false);
    const a = analyze(level, rulesFor(level));
    expect(a.solvable).toBe(true);
    expect(a.minMoves).toBe(3);
    expect(a.firstMoves.map((m) => m.vehicleId).sort()).toEqual(['B', 'C']);
    expect(a.solution!.indexOf('B')).toBeLessThan(a.solution!.indexOf('V'));
  });

  it('hint picks a move that frees the turning vehicle eventually', () => {
    const level = turnsLevel(false);
    const rules = rulesFor(level);
    const id = hint(createGame(level, rules), rules);
    expect(['B', 'C']).toContain(id);
  });

  it('blind playouts follow the bent paths', () => {
    const level = turnsLevel(true);
    const res = blindAnalysis(level, rulesFor(level), { playouts: 8 });
    expect(res.informedWin).toBe(1);
    expect(res.blindWin).toBe(1);
  });
});
