import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { BoardView } from '../../../src/render/board-view';
import type { BoardHost } from '../../../src/render/board-view';
import { Tweener } from '../../../src/render/tween';
import { fakeEngine } from '../../support/fake-engine';
import type { GameState } from '../../../src/engine/types';
import { level, rules } from '../helpers';

const HINT_MS = 2000;

function setup() {
  const renders = { count: 0 };
  const host: BoardHost = {
    stage: new Container(),
    tweener: new Tweener({ add: () => undefined, remove: () => undefined }, () => true),
    requestRender: () => {
      renders.count += 1;
    },
    size: () => ({ width: 390, height: 600 }),
  };
  const board = new BoardView(host);
  board.build(fakeEngine.createGame(level, rules) as GameState);
  return { board, renders };
}

describe('BoardView.dispose', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('zeichnet nach Ablauf der Hervorhebung, solange das Brett lebt', () => {
    const { board, renders } = setup();
    board.highlight('v1', HINT_MS);
    const before = renders.count;
    vi.advanceTimersByTime(HINT_MS);
    expect(renders.count).toBeGreaterThan(before);
  });

  it('laesst ausstehende Hervorhebungs- und Spur-Timer nach dispose nicht mehr zeichnen', () => {
    const { board, renders } = setup();
    board.highlight('v1', HINT_MS);
    board.previewLane('v2', 'v1');
    board.dispose();
    const before = renders.count;
    vi.advanceTimersByTime(HINT_MS * 2);
    expect(renders.count).toBe(before);
  });

  it('ignoriert neue Hervorhebungen nach dispose', () => {
    const { board, renders } = setup();
    board.dispose();
    const before = renders.count;
    board.highlight('v1', HINT_MS);
    board.previewLane('v1', null);
    vi.advanceTimersByTime(HINT_MS);
    expect(renders.count).toBe(before);
  });
});

describe('BoardView: Hupe', () => {
  interface ViewLike {
    x: number;
    y: number;
    restX: number;
    restY: number;
  }
  const views = (board: BoardView): Map<string, ViewLike> =>
    (board as unknown as { vehicles: Map<string, ViewLike> }).vehicles;

  function south(): { board: BoardView; state: GameState; id: string; x: number; y: number } {
    const { board } = setup();
    const state = fakeEngine.createGame(level, rules) as GameState;
    const veh = state.vehicles.find((v) => v.status === 'parked' && v.dir === 'S');
    if (!veh) throw new Error('kein Fahrzeug Richtung Sueden');
    return { board, state, id: veh.id, x: veh.x, y: veh.y };
  }

  it('yield stellt den Blocker auf die neue Zelle und sync haelt sie', async () => {
    const { board, state, id, x, y } = south();
    const view = views(board).get(id);
    if (!view) throw new Error('keine Ansicht');
    const startY = view.restY;
    await board.yield(id, [x, y], [x, y + 1]);
    const cell = board.getLayout()?.cell ?? 0;
    expect(view.restY).toBeCloseTo(startY + cell, 6);
    expect(view.y).toBeCloseTo(view.restY, 6);
    board.sync({
      ...state,
      vehicles: state.vehicles.map((v) => (v.id === id ? { ...v, y: v.y + 1 } : v)),
    });
    expect(view.restY).toBeCloseTo(startY + cell, 6);
  });

  it('sync bringt ein Fahrzeug nach Undo zurueck an die alte Zelle', async () => {
    const { board, state, id, x, y } = south();
    const view = views(board).get(id);
    if (!view) throw new Error('keine Ansicht');
    const startY = view.restY;
    await board.yield(id, [x, y], [x, y + 1]);
    board.sync(state);
    expect(view.restY).toBeCloseTo(startY, 6);
  });

  it('honk laesst das Fahrzeug nach Ruck und Standzeit an seinem Platz', async () => {
    vi.useFakeTimers();
    try {
      const { board, id } = south();
      const view = views(board).get(id);
      if (!view) throw new Error('keine Ansicht');
      const done = board.honk(id);
      await vi.advanceTimersByTimeAsync(2000);
      await done;
      expect(view.x).toBeCloseTo(view.restX, 6);
      expect(view.y).toBeCloseTo(view.restY, 6);
    } finally {
      vi.useRealTimers();
    }
  });
});
