import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_DEBOUNCE_MS, createLiveCheck } from '../../../src/app/editor-check';
import type { CheckStatus } from '../../../src/app/editor-check';
import type { SolverPort } from '../../../src/app/solver-port';
import type { LevelAnalysis } from '../../../src/solver/types';
import { level, rules } from '../helpers';

const analysis = (patch: Partial<LevelAnalysis>): LevelAnalysis =>
  ({ solvable: true, truncated: false, minMoves: 4, difficulty: 2.5, ...patch }) as LevelAnalysis;

function setup(impl: SolverPort['analyze']) {
  const statuses: CheckStatus[] = [];
  const analyzeSpy = vi.fn(impl);
  const check = createLiveCheck({ analyze: analyzeSpy }, (s) => statuses.push(s));
  return { statuses, analyzeSpy, check };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createLiveCheck', () => {
  it('entprellt mehrere Aenderungen zu einem Auftrag', async () => {
    const { check, analyzeSpy, statuses } = setup(() => Promise.resolve(analysis({})));
    check.schedule(level, rules);
    await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS - 1);
    check.schedule(level, rules);
    await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS - 1);
    expect(analyzeSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toEqual({ kind: 'solvable', par: 4, difficulty: 2.5 });
    expect(statuses[0]).toEqual({ kind: 'checking' });
  });

  it('bricht den vorherigen Auftrag ab und ignoriert sein Ergebnis', async () => {
    const signals: AbortSignal[] = [];
    const { check, statuses } = setup((_l, _r, opts) => {
      if (opts?.signal) signals.push(opts.signal);
      return new Promise((resolve) =>
        setTimeout(() => resolve(analysis({ solvable: false })), 1000),
      );
    });
    check.schedule(level, rules);
    await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS);
    expect(signals).toHaveLength(1);
    check.schedule(level, rules);
    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    // Das erste Ergebnis (nicht loesbar) darf nicht ankommen, das zweite schon.
    expect(statuses.filter((s) => s.kind === 'unsolvable')).toHaveLength(1);
  });

  it('bildet truncated, unloesbar und Fehler ab', async () => {
    const results = [
      analysis({ solvable: false, truncated: true }),
      analysis({ solvable: false }),
      new Error('boom'),
      Object.assign(new Error('abort'), { name: 'AbortError' }),
    ];
    let i = 0;
    const { check, statuses } = setup(() => {
      const r = results[i++];
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r as LevelAnalysis);
    });
    for (let n = 0; n < results.length; n++) {
      check.schedule(level, rules);
      await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS);
    }
    const kinds = statuses.filter((s) => s.kind !== 'checking').map((s) => s.kind);
    expect(kinds).toEqual(['truncated', 'unsolvable', 'error']);
  });

  it('cancel setzt auf idle und verhindert den Start', async () => {
    const { check, analyzeSpy, statuses } = setup(() => Promise.resolve(analysis({})));
    check.schedule(level, rules);
    check.cancel();
    await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS * 2);
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({ kind: 'idle' });
  });
});
