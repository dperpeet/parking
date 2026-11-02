import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { hint } from '../../../src/solver/hint';
import { level, rules } from '../helpers';
import { deadlock, oneOrder, rulesFor } from './fixtures';

function followHints(start: GameState): GameState {
  let s = start;
  for (let i = 0; i < 60 && s.status === 'playing'; i++) {
    const id = hint(s, rules);
    expect(id).not.toBeNull();
    s = step(s, { type: 'tapVehicle', vehicleId: id! }, rules).state;
  }
  return s;
}

describe('hint', () => {
  it('picks the only winning move', () => {
    expect(hint(createGame(oneOrder, rulesFor(oneOrder)), rulesFor(oneOrder))).toBe('v1');
  });

  it('returns null without a winning continuation', () => {
    expect(hint(createGame(deadlock, rulesFor(deadlock)), rulesFor(deadlock))).toBeNull();
  });

  it('following hints from the start wins level 007', () => {
    const end = followHints(createGame(level, rules));
    expect(end.status).toBe('won');
  });

  it('works mid-game after power-ups were used', () => {
    let s = createGame(level, rules);
    s = step(s, { type: 'tapVehicle', vehicleId: 'v1' }, rules).state;
    s = step(s, { type: 'usePowerUp', powerUp: 'shuffle' }, rules).state;
    s = step(s, { type: 'usePowerUp', powerUp: 'extraSlot' }, rules).state;
    expect(s.powerUpsUsed).toBe(2);
    expect(followHints(s).status).toBe('won');
  });
});
