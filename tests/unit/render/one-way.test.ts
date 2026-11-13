import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { BoardView } from '../../../src/render/board-view';
import type { BoardHost } from '../../../src/render/board-view';
import { Tweener } from '../../../src/render/tween';
import { fakeEngine } from '../../support/fake-engine';
import type { GameState, VehicleState } from '../../../src/engine/types';
import { level, rules } from '../helpers';

interface ViewLike {
  x: number;
  y: number;
  rotation: number;
  alpha: number;
  destroyed: boolean;
  restX: number;
  restY: number;
}

type Tick = (t: { deltaMS: number }) => void;

/** Brett mit einem Fahrzeug (Laenge 2, Kopf (2,1) Richtung Osten) und einem Pfeil nach Norden auf (4,1). */
function arrowState(): GameState {
  const base = fakeEngine.createGame(level, rules) as GameState;
  const car: VehicleState = {
    ...base.vehicles[0]!,
    id: 't1',
    x: 2,
    y: 1,
    dir: 'E',
    length: 2,
    status: 'parked',
    locked: false,
    keyId: null,
    hidden: false,
  };
  return {
    ...base,
    grid: { width: 5, height: 5, cells: [{ x: 4, y: 1, type: 'oneWay', dir: 'N' }] },
    vehicles: [car],
  };
}

function setup(state: GameState) {
  const ticks = new Set<Tick>();
  const host: BoardHost = {
    stage: new Container(),
    tweener: new Tweener(
      { add: (fn) => ticks.add(fn), remove: (fn) => ticks.delete(fn) },
      () => false,
    ),
    requestRender: () => undefined,
    size: () => ({ width: 390, height: 600 }),
  };
  const board = new BoardView(host);
  board.build(state);
  const tick = (ms: number): void => {
    for (const fn of [...ticks]) fn({ deltaMS: ms });
  };
  const view = (id: string): ViewLike =>
    (board as unknown as { vehicles: Map<string, ViewLike> }).vehicles.get(id)!;
  return { board, tick, view };
}

type ArrowSpy = (g: unknown, r: unknown, dir: string) => void;
const proto = BoardView.prototype as unknown as { drawRoadArrow: ArrowSpy };

describe('BoardView: Abbiegepfeile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('zeichnet jede oneWay-Zelle als Fahrbahnpfeil, Level ohne Pfeile bleiben ohne', () => {
    const spy = vi.spyOn(proto, 'drawRoadArrow');
    setup(arrowState());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![2]).toBe('N');
    spy.mockClear();
    setup(fakeEngine.createGame(level, rules) as GameState);
    expect(spy).not.toHaveBeenCalled();
  });

  it('faehrt mit exitDir um die Ecke: dreht sich, endet in exitDir und wird entfernt', async () => {
    const { board, tick, view } = setup(arrowState());
    const v = view('t1');
    const done = board.exit(
      't1',
      [
        [3, 1],
        [4, 1],
        [4, 0],
      ],
      'N',
    );
    expect(v.rotation).toBe(0);
    const rotations: number[] = [];
    for (let i = 0; i < 40 && !v.destroyed; i++) {
      tick(16);
      if (!v.destroyed) rotations.push(v.rotation);
    }
    await done;
    expect(v.destroyed).toBe(true);
    // Osten -> Norden: gegen den Uhrzeigersinn bis -90 Grad.
    expect(Math.min(...rotations)).toBeCloseTo(-Math.PI / 2, 1);
    expect(rotations.some((r) => r < -0.1 && r > -Math.PI / 2 + 0.1)).toBe(true);
  });

  it('ohne exitDir bleibt die gerade Ausfahrt (keine Drehung, nur Verschiebung)', async () => {
    const { board, tick, view } = setup(arrowState());
    const v = view('t1');
    const startY = v.y;
    const done = board.exit('t1', [
      [3, 1],
      [4, 1],
    ]);
    tick(100);
    expect(v.rotation).toBe(0);
    expect(v.y).toBe(startY);
    expect(v.x).toBeGreaterThan(v.restX);
    for (let i = 0; i < 40; i++) tick(16);
    await done;
    expect(v.destroyed).toBe(true);
  });

  it('exitDir gleich der Blickrichtung nimmt den geraden Weg', async () => {
    const { board, tick, view } = setup(arrowState());
    const v = view('t1');
    const done = board.exit('t1', [[3, 1]], 'E');
    tick(100);
    expect(v.rotation).toBe(0);
    for (let i = 0; i < 40; i++) tick(16);
    await done;
  });

  it('Reduzierte Bewegung: sofort fertig und entfernt', async () => {
    const host: BoardHost = {
      stage: new Container(),
      tweener: new Tweener({ add: () => undefined, remove: () => undefined }, () => true),
      requestRender: () => undefined,
      size: () => ({ width: 390, height: 600 }),
    };
    const board = new BoardView(host);
    board.build(arrowState());
    const v = (board as unknown as { vehicles: Map<string, ViewLike> }).vehicles.get('t1')!;
    await board.exit('t1', [[3, 1]], 'N');
    expect(v.destroyed).toBe(true);
  });

  it('Spur-Vorschau vor einem Pfeil endet ohne Fehler', () => {
    vi.useFakeTimers();
    try {
      const { board } = setup(arrowState());
      expect(() => board.previewLane('t1', null)).not.toThrow();
      vi.advanceTimersByTime(2000);
    } finally {
      vi.useRealTimers();
    }
  });
});
