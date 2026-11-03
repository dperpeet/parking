import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../../src/engine';
import { Level } from '../../../src/schema';
import { analyze, analyzeState, analyzeStateReference } from '../../../src/solver/analyze';
import { generate } from '../../../src/solver/generator';
import { level as level007, rules as rules007, rulesFor } from '../helpers';
import { deadlock, doubleFree, oneOrder } from './fixtures';

const PACK = 'src/content/levels/pack-01';

function packLevel(name: string): Level {
  return Level.parse(JSON.parse(readFileSync(`${PACK}/${name}.json`, 'utf8')));
}

/** Referenz: Engine-basierte Suche (die schnelle Analyse muss exakt dasselbe liefern). */
function reference(level: Level) {
  const rules = rulesFor(level);
  return analyzeStateReference(createGame(level, rules), rules);
}

describe('analyze regression (fast path == engine reference)', () => {
  it('keeps the known numbers for level 007', () => {
    const a = analyze(level007, rules007);
    expect(a.winningPaths).toBe('118123');
    expect(a.totalPaths).toBe('131629');
    expect(a.randomPlayWinProbability).toBe(0.6573547939171811);
    expect(a.winRate).toBe(0.897393);
    expect(a.statesExplored).toBe(4620);
    expect(a.deadStates).toBe(0);
    expect(a.minMoves).toBe(11);
    expect(a.difficulty).toBe(3.7);
    expect(a.maxQueueUsedOnBestPath).toBe(2);
  });

  it('pins numbers of generated pack levels', () => {
    const a13 = analyze(packLevel('013'), rulesFor(packLevel('013')));
    expect(a13.statesExplored).toBe(11595);
    expect(a13.winningPaths).toBe('40977');
    expect(a13.deadStates).toBe(543);
    expect(a13.difficulty).toBe(4.3);
    const l24 = packLevel('024');
    const a24 = analyze(l24, rulesFor(l24));
    expect(a24.statesExplored).toBe(6141);
    expect(a24.winningPaths).toBe('58028');
    expect(a24.deadStates).toBe(464);
    expect(a24.difficulty).toBe(5.6);
  });

  it.each(['001', '005', '008', '013', '016', '021', '024', '026'])(
    'matches the reference on pack level %s',
    (name) => {
      const level = packLevel(name);
      expect(analyze(level, rulesFor(level))).toEqual(reference(level));
    },
  );

  it.each([
    ['doubleFree', doubleFree],
    ['oneOrder', oneOrder],
    ['deadlock', deadlock],
  ])('matches the reference on fixture %s', (_name, level) => {
    expect(analyze(level, rulesFor(level))).toEqual(reference(level));
  });

  it('matches the reference on generated levels with slot overrides', () => {
    for (const seed of [1, 2, 3]) {
      const g = generate(
        {
          seed,
          width: 6,
          height: 6,
          vehicleCount: 9,
          colors: ['blue', 'orange', 'green', 'yellow'],
          slots: 6,
          shuffleWindow: 5,
          maxAttempts: 3,
        },
        rules007,
      );
      expect(g.level.overrides?.queue?.slots).toBe(6);
      expect(analyze(g.level, rulesFor(g.level))).toEqual(reference(g.level));
    }
  });

  it('matches the reference when the state limit truncates the search', () => {
    const rules = rulesFor(level007);
    const state = createGame(level007, rules);
    const fast = analyze(level007, rules, { maxStates: 300 });
    const slow = analyzeStateReference(state, rules, { maxStates: 300 });
    expect(fast.truncated).toBe(true);
    expect(fast).toEqual(slow);
  });

  it('matches the reference from a mid-game state', () => {
    const rules = rulesFor(level007);
    let state = createGame(level007, rules);
    for (const id of analyze(level007, rules).solution!.slice(0, 4)) {
      state = step(state, { type: 'tapVehicle', vehicleId: id }, rules).state;
    }
    expect(state.moves).toBe(4);
    const fast = analyzeState(state, rules);
    expect(fast).toEqual(analyzeStateReference(state, rules));
    expect(fast.minMoves).toBe(11);
  });
});
