import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../../src/engine';
import { analyze } from '../../../src/solver/analyze';
import { level as level007, rules as rules007, rulesFor } from '../helpers';
import { deadlock, doubleFree, oneOrder } from './fixtures';

describe('analyze', () => {
  it('counts independent free vehicles when order does not matter', () => {
    const a = analyze(doubleFree, rulesFor(doubleFree));
    expect(a.solvable).toBe(true);
    expect(a.minMoves).toBe(2);
    expect(a.winningPaths).toBe('2');
    expect(a.totalPaths).toBe('2');
    expect(a.winRate).toBe(1);
    expect(a.randomPlayWinProbability).toBe(1);
    expect(a.deadStates).toBe(0);
    expect(a.avgDeadEndDepth).toBeNull();
    expect(a.firstMoves.every((m) => !m.deadEnd)).toBe(true);
  });

  it('counts exactly one winning order when the queue has a single slot', () => {
    const a = analyze(oneOrder, rulesFor(oneOrder));
    expect(a.solution).toEqual(['v1', 'v2']);
    expect(a.winningPaths).toBe('1');
    expect(a.totalPaths).toBe('2');
    expect(a.winRate).toBe(0.5);
    expect(a.randomPlayWinProbability).toBe(0.5);
    expect(a.firstMoves).toEqual([
      { vehicleId: 'v1', winningPaths: '1', totalPaths: '1', deadEnd: false },
      { vehicleId: 'v2', winningPaths: '0', totalPaths: '1', deadEnd: true },
    ]);
    expect(a.maxQueueUsedOnBestPath).toBe(1);
  });

  it('reports a deadlock as unsolvable', () => {
    const a = analyze(deadlock, rulesFor(deadlock));
    expect(a.solvable).toBe(false);
    expect(a.minMoves).toBeNull();
    expect(a.solution).toBeNull();
    expect(a.winningPaths).toBe('0');
    expect(a.difficulty).toBe(10);
  });

  it('flags truncation when the state limit is hit', () => {
    const a = analyze(level007, rules007, { maxStates: 50 });
    expect(a.truncated).toBe(true);
  });

  it('analyzes level 007 (snapshot)', () => {
    const a = analyze(level007, rules007);
    expect(a.solvable).toBe(true);
    expect(a.truncated).toBe(false);
    expect(a.minMoves).toBe(11);
    expect(a.winningPaths).toBe('118123');
    expect(a.totalPaths).toBe('131629');
    expect(a.statesExplored).toBe(4620);
    expect(a.randomPlayWinProbability).toBeCloseTo(0.6573548, 6);
    expect(a.difficulty).toBeGreaterThan(2);
    expect(a.difficulty).toBeLessThan(6);
    // Die Loesung gewinnt tatsaechlich in der Engine.
    let s = createGame(level007, rules007);
    for (const id of a.solution!)
      s = step(s, { type: 'tapVehicle', vehicleId: id }, rules007).state;
    expect(s.status).toBe('won');
    expect(s.moves).toBe(11);
  });
});
