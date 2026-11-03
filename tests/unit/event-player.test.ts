import { describe, expect, it } from 'vitest';
import { EventPlayer } from '../../src/render/event-player';
import type { BoardAnimator, HudSink } from '../../src/render/event-player';
import { Tweener, easings } from '../../src/render/tween';
import type { GameEvent, GameState } from '../../src/engine/types';
import { fakeEngine } from '../../src/app/fake-engine';
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
