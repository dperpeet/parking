import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { BoardView } from '../../../src/render/board-view';
import type { BoardHost } from '../../../src/render/board-view';
import { Tweener } from '../../../src/render/tween';
import { fakeEngine } from '../../../src/app/fake-engine';
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
