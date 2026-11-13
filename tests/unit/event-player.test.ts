import { describe, expect, it } from 'vitest';
import { EventPlayer } from '../../src/render/event-player';
import type { BoardAnimator, HudSink } from '../../src/render/event-player';
import { Tweener, easings } from '../../src/render/tween';
import type { GameEvent, GameState } from '../../src/engine/types';
import { fakeEngine } from '../support/fake-engine';
import { level, rules } from './helpers';

function setup() {
  const log: string[] = [];
  const gates: Array<() => void> = [];
  const wait = (label: string): Promise<void> =>
    new Promise((resolve) => {
      log.push(`start ${label}`);
      gates.push(() => {
        log.push(`end ${label}`);
        resolve();
      });
    });
  const board: BoardAnimator = {
    shake: (id) => wait(`shake ${id}`),
    exit: (id) => wait(`exit ${id}`),
    sync: () => log.push('board.sync'),
  };
  const hud: HudSink = {
    onEvent: (e) => log.push(`hud ${e.type}`),
    render: () => log.push('hud.render'),
  };
  return { log, gates, player: new EventPlayer(board, hud) };
}

const state = fakeEngine.createGame(level, rules) as GameState;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EventPlayer', () => {
  it('spielt Events nacheinander ab und wartet auf Animationen', async () => {
    const { log, gates, player } = setup();
    const events: GameEvent[] = [
      { type: 'vehicleExited', vehicleId: 'v1', slotIndex: 0, path: [[0, 0]] },
      {
        type: 'passengerBoarded',
        passengerIndex: 0,
        color: 'orange',
        vehicleId: 'v1',
        slotIndex: 0,
        filled: 1,
      },
      { type: 'vehicleDeparted', vehicleId: 'v1', slotIndex: 0 },
    ];
    const done = player.play(events, state);
    await flush();
    expect(log).toEqual(['start exit v1']);
    gates[0]?.();
    await done;
    expect(log).toEqual([
      'start exit v1',
      'end exit v1',
      'hud vehicleExited',
      'hud passengerBoarded',
      'hud vehicleDeparted',
      'board.sync',
      'hud.render',
    ]);
  });

  it('wackelt bei vehicleBlocked', async () => {
    const { log, gates, player } = setup();
    const done = player.play(
      [{ type: 'vehicleBlocked', vehicleId: 'v6', reason: 'path', blockerId: 'v3' }],
      state,
    );
    await flush();
    gates[0]?.();
    await done;
    expect(log.slice(0, 3)).toEqual(['hud vehicleBlocked', 'start shake v6', 'end shake v6']);
  });

  it('wackelt bei invalidAction nur fuer ein vorhandenes, geparktes Fahrzeug', async () => {
    const { log, gates, player } = setup();
    const parked = state.vehicles.find((v) => v.status === 'parked')!;
    const gone = { ...state, vehicles: state.vehicles.map((v) => ({ ...v, status: 'queued' })) };
    const invalid = (vehicleId?: string): GameEvent => ({
      type: 'invalidAction',
      reason: 'cannotYield',
      vehicleId,
    });
    const done = player.play([invalid(parked.id)], state);
    await flush();
    expect(log).toEqual(['hud invalidAction', `start shake ${parked.id}`]);
    gates[0]?.();
    await done;
    log.length = 0;
    await player.play([invalid(parked.id), invalid('nope'), invalid()], gone as GameState);
    await player.play([invalid('nope'), invalid()], state);
    expect(log.filter((l) => l.includes('shake'))).toEqual([]);
  });

  it('zeigt bei vehicleBlocked die Fahrspur-Vorschau mit blockerId', async () => {
    const previews: Array<[string, string | null]> = [];
    const board: BoardAnimator = {
      shake: () => Promise.resolve(),
      exit: () => Promise.resolve(),
      sync: () => undefined,
      previewLane: (id, blocker) => previews.push([id, blocker]),
    };
    const player = new EventPlayer(board, { onEvent: () => undefined, render: () => undefined });
    await player.play(
      [{ type: 'vehicleBlocked', vehicleId: 'v6', reason: 'path', blockerId: 'v3' }],
      state,
    );
    expect(previews).toEqual([['v6', 'v3']]);
  });

  it('reiht mehrere play()-Aufrufe hintereinander', async () => {
    const { log, gates, player } = setup();
    const a = player.play(
      [{ type: 'vehicleExited', vehicleId: 'v1', slotIndex: 0, path: [] }],
      state,
    );
    const b = player.play(
      [{ type: 'vehicleExited', vehicleId: 'v2', slotIndex: 1, path: [] }],
      state,
    );
    await flush();
    expect(log).toEqual(['start exit v1']);
    gates[0]?.();
    await a;
    await flush();
    expect(log).toContain('start exit v2');
    gates[1]?.();
    await b;
    expect(log.indexOf('end exit v1')).toBeLessThan(log.indexOf('start exit v2'));
  });

  it('reset synchronisiert Brett und HUD ohne Animation', async () => {
    const { log, player } = setup();
    await player.reset(state);
    expect(log).toEqual(['board.sync', 'hud.render']);
  });
});

describe('Tweener', () => {
  function fakeTicker() {
    const fns = new Set<(t: { deltaMS: number }) => void>();
    return {
      add: (fn: (t: { deltaMS: number }) => void) => fns.add(fn),
      remove: (fn: (t: { deltaMS: number }) => void) => fns.delete(fn),
      tick: (ms: number) => [...fns].forEach((f) => f({ deltaMS: ms })),
      size: () => fns.size,
    };
  }

  it('laeuft ueber den Ticker und endet exakt bei 1', async () => {
    const t = fakeTicker();
    const seen: number[] = [];
    const p = new Tweener(t).run({
      durationMs: 100,
      ease: easings.easeInQuad,
      onUpdate: (v) => seen.push(v),
    });
    t.tick(50);
    t.tick(60);
    await p;
    expect(seen).toEqual([0.25, 1]);
    expect(t.size()).toBe(0);
  });

  it('ist bei reduced motion sofort fertig', async () => {
    const t = fakeTicker();
    const seen: number[] = [];
    await new Tweener(t, () => true).run({ durationMs: 500, onUpdate: (v) => seen.push(v) });
    expect(seen).toEqual([1]);
    expect(t.size()).toBe(0);
  });
});

describe('EventPlayer: Ton', () => {
  it('meldet jedes Event dem Ton, wenn es abgespielt wird (nach vorherigen Animationen)', async () => {
    const log: string[] = [];
    let release: () => void = () => undefined;
    const board: BoardAnimator = {
      shake: () => Promise.resolve(),
      exit: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      sync: () => undefined,
    };
    const hud: HudSink = { onEvent: () => undefined, render: () => undefined };
    const player = new EventPlayer(board, hud, { cue: (e) => log.push(e.type) });
    const done = player.play(
      [
        { type: 'vehicleExited', vehicleId: 'v1', slotIndex: 0, path: [] },
        { type: 'won', moves: 1, stars: 3 },
      ],
      state,
    );
    await flush();
    expect(log).toEqual(['vehicleExited']);
    release();
    await done;
    expect(log).toEqual(['vehicleExited', 'won']);
  });
});

describe('EventPlayer: vehicleYielded', () => {
  it('hupt zuerst, laesst dann den Blocker gleiten und gleicht danach ab', async () => {
    const log: string[] = [];
    const board: BoardAnimator = {
      shake: () => Promise.resolve(),
      exit: () => Promise.resolve(),
      honk: async (id) => {
        log.push(`honk ${id}`);
        await flush();
        log.push(`honked ${id}`);
      },
      yield: (id, from, to) => {
        log.push(`yield ${id} ${from.join(',')}->${to.join(',')}`);
        return Promise.resolve();
      },
      sync: () => log.push('board.sync'),
    };
    const hud: HudSink = {
      onEvent: (e) => log.push(`hud ${e.type}`),
      render: () => log.push('hud.render'),
    };
    await new EventPlayer(board, hud).play(
      [
        { type: 'vehicleYielded', vehicleId: 'v2', byVehicleId: 'v1', from: [3, 2], to: [3, 3] },
        { type: 'powerUpUsed', powerUp: 'honk', remaining: 0 },
      ],
      state,
    );
    expect(log).toEqual([
      'hud vehicleYielded',
      'honk v1',
      'honked v1',
      'yield v2 3,2->3,3',
      'hud powerUpUsed',
      'board.sync',
      'hud.render',
    ]);
  });

  it('kommt ohne optionale Brett-Animationen aus', async () => {
    const log: string[] = [];
    const board: BoardAnimator = {
      shake: () => Promise.resolve(),
      exit: () => Promise.resolve(),
      sync: () => log.push('board.sync'),
    };
    const hud: HudSink = { onEvent: (e) => log.push(`hud ${e.type}`), render: () => undefined };
    await new EventPlayer(board, hud).play(
      [{ type: 'vehicleYielded', vehicleId: 'v2', byVehicleId: 'v1', from: [3, 2], to: [3, 3] }],
      state,
    );
    expect(log).toEqual(['hud vehicleYielded', 'board.sync']);
  });
});

describe('EventPlayer: Abbiegepfeile', () => {
  it('reicht exitDir an exit weiter, gerade Wege ohne drittes Argument', async () => {
    const calls: unknown[][] = [];
    const board: BoardAnimator = {
      shake: () => Promise.resolve(),
      exit: (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve();
      },
      sync: () => undefined,
    };
    const hud: HudSink = { onEvent: () => undefined, render: () => undefined };
    const turned: Array<[number, number]> = [
      [1, 0],
      [2, 0],
      [2, 1],
    ];
    await new EventPlayer(board, hud).play(
      [
        { type: 'vehicleExited', vehicleId: 'v1', slotIndex: 0, path: turned, exitDir: 'S' },
        { type: 'vehicleExited', vehicleId: 'v2', slotIndex: 1, path: [[0, 1]] },
      ],
      state,
    );
    expect(calls).toEqual([
      ['v1', turned, 'S'],
      ['v2', [[0, 1]]],
    ]);
  });
});
