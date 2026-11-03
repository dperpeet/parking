import { describe, expect, it } from 'vitest';
import { createGame, legalMoves, step } from '../../../src/engine';
import { level, rules } from '../helpers';
import { run, taps } from './helpers';

describe('level 007', () => {
  it('has no validation issues and starts playing', () => {
    const state = createGame(level, rules);
    expect(state.status).toBe('playing');
    expect(legalMoves(state, rules).length).toBeGreaterThan(0);
  });

  it('is solved by v1,v2,v3,v4,v5,v8,v7,v9,v10,v11,v6 with 3 stars in 11 moves', () => {
    const solution = ['v1', 'v2', 'v3', 'v4', 'v5', 'v8', 'v7', 'v9', 'v10', 'v11', 'v6'];
    let state = createGame(level, rules);
    for (const id of solution) {
      const res = step(state, { type: 'tapVehicle', vehicleId: id }, rules);
      expect(res.events[0]?.type, id).toBe('vehicleExited');
      state = res.state;
    }
    expect(state).toMatchObject({ status: 'won', stars: 3, moves: 11 });
  });

  it('can be lost by clogging the queue (queueFull)', () => {
    const state = createGame(level, rules);
    const res = run(state, rules, taps(LOSING));
    expect(res.state).toMatchObject({ status: 'lost', loseReason: 'queueFull' });
    expect(res.events.at(-1)).toMatchObject({ type: 'lost' });
  });
});

const LOSING = ['v11', 'v8', 'v7', 'v6', 'v3'];
