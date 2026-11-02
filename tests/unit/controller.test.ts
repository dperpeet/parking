import { describe, expect, it } from 'vitest';
import { fakeEngine } from '../../src/app/fake-engine';
import { GameController } from '../../src/app/game-controller';
import type { ControllerUpdate } from '../../src/app/game-controller';
import { makeSimilarLevel } from '../../src/app/similar-level';
import type { GameState } from '../../src/engine/types';
import { LOSE_ORDER, WIN_ORDER, level, rules } from './helpers';

function make(): { c: GameController; updates: ControllerUpdate[] } {
  const c = new GameController({ engine: fakeEngine, levels: [level], rules });
  const updates: ControllerUpdate[] = [];
  c.subscribe((u) => updates.push(u));
  return { c, updates };
}

const tap = (c: GameController, id: string) => c.dispatch({ type: 'tapVehicle', vehicleId: id });

describe('GameController (Fake-Engine)', () => {
  it('start sendet den Anfangszustand als new', () => {
    const { c, updates } = make();
    c.start();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.kind).toBe('new');
    expect(updates[0]?.state.status).toBe('playing');
  });

  it('blockiertes Fahrzeug wackelt, zaehlt aber nicht', () => {
    const { c } = make();
    const events = tap(c, 'v4');
    expect(events[0]).toMatchObject({ type: 'vehicleBlocked', reason: 'path' });
    expect(c.getState().moves).toBe(0);
  });

  it('Ausfahren belegt einen Slot und Fahrgaeste steigen ein', () => {
    const { c, updates } = make();
    const events = tap(c, 'v1');
    expect(events.map((e) => e.type)).toEqual([
      'vehicleExited',
      'passengerBoarded',
      'passengerBoarded',
      'vehicleDeparted',
    ]);
    expect(updates.at(-1)?.kind).toBe('step');
    expect(c.getState().moves).toBe(1);
  });

  it('gewinnt Level 007 in der Referenzreihenfolge mit 3 Sternen', () => {
    const { c } = make();
    let last: GameState = c.getState();
    for (const id of WIN_ORDER) {
      tap(c, id);
      last = c.getState();
    }
    expect(last.status).toBe('won');
    expect(last.stars).toBe(3);
    expect(last.moves).toBe(11);
  });

  it('verliert, wenn kein Platz mehr da ist; Undo setzt zurueck', () => {
    const { c } = make();
    for (const id of LOSE_ORDER) tap(c, id);
    expect(c.getState().status).toBe('lost');
    c.dispatch({ type: 'usePowerUp', powerUp: 'undo' });
    expect(c.getState().status).toBe('playing');
    expect(c.getState().powerUps.undo).toBe(2);
  });

  it('Shuffle und +1 Platz zaehlen Power-Ups und kosten Sterne', () => {
    const { c } = make();
    c.dispatch({ type: 'usePowerUp', powerUp: 'extraSlot' });
    expect(c.getState().slots).toHaveLength(6);
    c.dispatch({ type: 'usePowerUp', powerUp: 'shuffle' });
    expect(c.getState().powerUpsUsed).toBe(2);
    expect(c.getState().powerUps.shuffle).toBe(0);
    const again = c.dispatch({ type: 'usePowerUp', powerUp: 'shuffle' });
    expect(again[0]?.type).toBe('invalidAction');
  });

  it('restart erzeugt ein frisches Spiel', () => {
    const { c, updates } = make();
    tap(c, 'v1');
    c.restart();
    expect(updates.at(-1)?.kind).toBe('new');
    expect(c.getState().moves).toBe(0);
  });

  it('similar spiegelt das Level und dreht Farben', () => {
    const { c } = make();
    c.similar();
    const s = c.getState();
    const v1 = s.vehicles.find((v) => v.id === 'v1');
    // v1: pos [0,0] dir W blau/orange -> gespiegelt x=5, dir E, Farbe orange -> green
    expect(v1).toMatchObject({ x: 5, y: 0, dir: 'E', color: 'green' });
    expect(c.getLevel().id).toBe('w1-07-s1');
  });

  it('next ohne weiteres Level liefert eine Variante', () => {
    const { c } = make();
    c.next();
    expect(c.getLevel().id).toBe('w1-07-s1');
  });
});

describe('makeSimilarLevel', () => {
  it('ist ein Involutions-Spiegel der Positionen', () => {
    const once = makeSimilarLevel(level, rules.vehicles.colors, 1);
    const twice = makeSimilarLevel(once, rules.vehicles.colors, 2);
    expect(twice.vehicles.map((v) => v.pos)).toEqual(level.vehicles.map((v) => v.pos));
    expect(twice.id).toBe('w1-07-s2');
  });
});
