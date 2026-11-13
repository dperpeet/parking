import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { step } from '../../../src/engine';
import type { GameEvent, GameState } from '../../../src/engine';
import { BoardView } from '../../../src/render/board-view';
import type { BoardHost } from '../../../src/render/board-view';
import { EventPlayer } from '../../../src/render/event-player';
import type { BoardAnimator, HudSink } from '../../../src/render/event-player';
import { LockDecor } from '../../../src/render/lock-decor';
import { hatchSegments, roundInset, vehicleLook } from '../../../src/render/mystery-style';
import { PALETTE, THEME } from '../../../src/render/theme';
import { Tweener } from '../../../src/render/tween';
import type { VehicleView } from '../../../src/render/vehicle-view';
import type { LevelSpec } from '../engine/helpers';
import { setup, tap, v } from '../engine/helpers';

const M = { mystery: true };

/** a (blau) ist Schluessel und Blocker; m1 (gruen) ist verdeckt und gesperrt, m2 (pink) verdeckt. */
const LOCKED: LevelSpec = {
  vehicles: [
    v('a', 5, 0, 'E', 's', 'blue'),
    v('m2', 4, 2, 'N', 's', 'pink', M),
    v('m1', 2, 0, 'E', 's', 'green', { ...M, locked: true, keyId: 'a' }),
  ],
  passengers: ['blue', 'blue', 'green', 'green', 'pink', 'pink'],
  overrides: { special: { mysteryVehicles: true, keyVehicles: true } },
};

function board(reduced = true) {
  const host: BoardHost = {
    stage: new Container(),
    tweener: new Tweener({ add: () => undefined, remove: () => undefined }, () => reduced),
    requestRender: () => undefined,
    size: () => ({ width: 390, height: 600 }),
  };
  return new BoardView(host);
}

const views = (b: BoardView): Map<string, VehicleView> =>
  (b as unknown as { vehicles: Map<string, VehicleView> }).vehicles;

describe('vehicleLook / hatchSegments', () => {
  it('verdeckt: neutraler Stil mit "?" und Schraffur, nie die Palettenfarbe', () => {
    const look = vehicleLook('green', true);
    expect(look).toEqual({
      fill: THEME.mysteryFill,
      ink: THEME.mysteryInk,
      glyph: THEME.mysteryGlyph,
      hatched: true,
    });
    for (const style of Object.values(PALETTE)) {
      expect(look.fill).not.toBe(style.fill);
      expect(look.glyph).not.toBe(style.glyph);
    }
    expect(vehicleLook('green', false)).toMatchObject({
      fill: PALETTE.green!.fill,
      glyph: PALETTE.green!.glyph,
      hatched: false,
    });
    expect(vehicleLook('nope', false).hatched).toBe(false);
  });

  it('Schraffur liegt im Rechteck und verlaeuft diagonal', () => {
    const r = { x: 2, y: 3, w: 40, h: 20 };
    const segs = hatchSegments(r, 7);
    expect(segs.length).toBeGreaterThan(4);
    for (const [a, b] of segs) {
      for (const [x, y] of [a, b]) {
        expect(x).toBeGreaterThanOrEqual(r.x - 1e-9);
        expect(x).toBeLessThanOrEqual(r.x + r.w + 1e-9);
        expect(y).toBeGreaterThanOrEqual(r.y - 1e-9);
        expect(y).toBeLessThanOrEqual(r.y + r.h + 1e-9);
      }
      expect(a[0] + a[1]).toBeCloseTo(b[0] + b[1]);
    }
    expect(hatchSegments(r, 0)).toEqual([]);
    expect(hatchSegments({ ...r, w: 0 }, 7)).toEqual([]);
    expect(roundInset(10)).toBeCloseTo(10 * (1 - Math.SQRT1_2));
  });
});

describe('BoardView: Mystery-Fahrzeuge', () => {
  it('baut verdeckte Fahrzeuge verdeckt auf und deckt per reveal auf; das Schloss bleibt oben', async () => {
    const { state } = setup(LOCKED);
    const b = board();
    b.build(state);
    const m1 = views(b).get('m1')!;
    expect(m1.hidden).toBe(true);
    expect(views(b).get('a')!.hidden).toBe(false);
    expect(m1.children.at(-1)).toBeInstanceOf(LockDecor);
    const count = m1.children.length;
    await b.reveal('m1');
    expect(m1.hidden).toBe(false);
    expect(m1.children.length).toBe(count);
    expect(m1.children.at(-1)).toBeInstanceOf(LockDecor);
    // Nach dem Umklappen hat die Flaeche wieder volle Groesse.
    const body = m1.children.find((c) => !(c instanceof LockDecor))!;
    expect([body.scale.x, body.scale.y]).toEqual([1, 1]);
  });

  it('Umklappen: in der Mitte flach und noch verdeckt bis zur Haelfte', () => {
    const { state } = setup(LOCKED);
    const b = board();
    b.build(state);
    const m2 = views(b).get('m2')!;
    m2.setRevealProgress(0.25);
    expect(m2.hidden).toBe(true);
    m2.setRevealProgress(0.5);
    expect(m2.hidden).toBe(false);
    const body = m2.children[0]!;
    // m2 schaut nach Norden: es klappt quer (x) zusammen.
    expect(body.scale.x).toBeLessThan(0.1);
    expect(body.scale.y).toBe(1);
  });

  it('sync uebernimmt hidden aus dem Zustand (Aufdecken nach Zug, bleibt nach Undo)', () => {
    const { state, rules } = setup(LOCKED);
    const b = board();
    b.build(state);
    const after = step(state, tap('a'), rules);
    b.sync(after.state);
    expect(views(b).get('m1')!.hidden).toBe(false);
    expect(views(b).get('m2')!.hidden).toBe(false);
    const undone = step(after.state, { type: 'usePowerUp', powerUp: 'undo' }, rules).state;
    b.sync(undone);
    expect(views(b).get('m1')!.hidden).toBe(false);
    // Neuaufbau (z. B. Groessenaenderung) nach Undo: weiterhin aufgedeckt.
    b.build(undone);
    expect(views(b).get('m1')!.hidden).toBe(false);
    expect(views(b).get('a')).toBeDefined();
  });
});

describe('EventPlayer: vehicleRevealed', () => {
  it('meldet das Event dem HUD und spielt das Aufdecken nach dem Ausfahren ab', async () => {
    const { state, rules } = setup(LOCKED);
    const { events, state: next } = step(state, tap('a'), rules);
    const log: string[] = [];
    const animator: BoardAnimator = {
      shake: () => Promise.resolve(),
      exit: (id) => {
        log.push(`exit ${id}`);
        return Promise.resolve();
      },
      unlock: (id) => {
        log.push(`unlock ${id}`);
        return Promise.resolve();
      },
      reveal: vi.fn((id: string) => {
        log.push(`reveal ${id}`);
        return Promise.resolve();
      }),
      sync: () => log.push('sync'),
    };
    const hud: HudSink = {
      onEvent: (e: GameEvent) => {
        if (e.type === 'vehicleRevealed') log.push(`hud ${e.vehicleId}`);
      },
      render: () => undefined,
    };
    await new EventPlayer(animator, hud).play(events, next as GameState);
    expect(log).toEqual([
      'exit a',
      'unlock m1',
      'hud m2',
      'reveal m2',
      'hud m1',
      'reveal m1',
      'sync',
    ]);
  });
});
