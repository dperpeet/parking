import { afterEach, describe, expect, it } from 'vitest';
import { fakeEngine } from '../../src/app/fake-engine';
import { setLanguage } from '../../src/i18n';
import type { GameEvent, GameState } from '../../src/engine/types';
import { EventPlayer } from '../../src/render/event-player';
import type { BoardAnimator, HudSink } from '../../src/render/event-player';
import { computeLockMarks } from '../../src/render/lock-marks';
import { announce, vehicleLabel } from '../../src/ui/strings';
import { level, rules } from './helpers';

afterEach(() => setLanguage('de'));

const veh = (id: string, locked: boolean, keyId: string | null, status = 'parked') => ({
  id,
  status,
  locked,
  keyId,
});

describe('computeLockMarks', () => {
  it('ohne Schloesser gibt es keine Marken', () => {
    const marks = computeLockMarks([veh('a', false, null), veh('b', false, null)]);
    expect(marks.count).toBe(0);
    expect(marks.of('a')).toEqual({ lock: null, key: null });
    expect(marks.of('unbekannt')).toEqual({ lock: null, key: null });
  });

  it('Schloss und Schluessel teilen sich die Nummer, nummeriert in Level-Reihenfolge', () => {
    const marks = computeLockMarks([
      veh('a', true, 'k2'),
      veh('b', true, 'k1'),
      veh('k1', false, null),
      veh('k2', false, null),
    ]);
    expect(marks.count).toBe(2);
    expect(marks.of('a')).toEqual({ lock: 1, key: null });
    expect(marks.of('k2')).toEqual({ lock: null, key: 1 });
    expect(marks.of('b')).toEqual({ lock: 2, key: null });
    expect(marks.of('k1')).toEqual({ lock: null, key: 2 });
  });

  it('ein Schluessel fuer mehrere Schloesser; Fahrzeug kann Schloss und Schluessel tragen', () => {
    const marks = computeLockMarks([
      veh('a', true, 'k'),
      veh('b', true, 'k'),
      veh('k', true, 'z'),
      veh('z', false, null),
    ]);
    expect(marks.count).toBe(2);
    expect(marks.of('a').lock).toBe(1);
    expect(marks.of('b').lock).toBe(1);
    expect(marks.of('k')).toEqual({ lock: 2, key: 1 });
  });

  it('Nummern bleiben nach dem Entsperren stabil, der Schluessel verschwindet', () => {
    const marks = computeLockMarks([
      veh('a', false, 'k1'),
      veh('b', true, 'k2'),
      veh('k1', false, null, 'departed'),
      veh('k2', false, null),
    ]);
    expect(marks.of('b')).toEqual({ lock: 2, key: null });
    expect(marks.of('k2')).toEqual({ lock: null, key: 2 });
    expect(marks.of('k1').key).toBeNull();
    expect(marks.of('a').lock).toBeNull();
  });
});

describe('Beschriftung gesperrter Fahrzeuge', () => {
  const base = { color: 'blue', x: 0, y: 1, dir: 'W' } as const;

  it('nennt gesperrt und Schluessel, nummeriert nur bei mehreren Schluesseln', () => {
    expect(vehicleLabel(base, { mark: { lock: 1, key: null }, count: 1 })).toBe(
      'Blaues Fahrzeug, Reihe 2, Spalte 1, fährt nach links, gesperrt',
    );
    expect(vehicleLabel(base, { mark: { lock: null, key: 1 }, count: 1 })).toContain(', Schlüssel');
    expect(vehicleLabel(base, { mark: { lock: 2, key: 1 }, count: 2 })).toContain(
      'gesperrt, Schloss 2, Schlüssel 1',
    );
    expect(vehicleLabel(base, { mark: { lock: null, key: null }, count: 1 })).toBe(
      vehicleLabel(base),
    );
    setLanguage('en');
    expect(vehicleLabel(base, { mark: { lock: 1, key: null }, count: 1 })).toContain(', locked');
    expect(vehicleLabel(base, { mark: { lock: null, key: 3 }, count: 3 })).toContain(', key 3');
  });

  it('Ansage beim Antippen nennt das Schluessel-Fahrzeug', () => {
    const state = fakeEngine.createGame(level, rules) as GameState;
    const withLock: GameState = {
      ...state,
      vehicles: state.vehicles.map((v) =>
        v.id === 'v1' ? { ...v, locked: true, keyId: 'v2' } : v,
      ),
    };
    const event: GameEvent = {
      type: 'vehicleBlocked',
      vehicleId: 'v1',
      reason: 'locked',
      blockerId: null,
    };
    expect(announce(event, withLock)).toMatch(/gesperrt\. Zuerst muss .* wegfahren/);
    expect(announce(event, state)).toMatch(/ist gesperrt$/);
  });
});

describe('EventPlayer: Schloss und Schluessel', () => {
  const state = fakeEngine.createGame(level, rules) as GameState;

  function setup() {
    const log: string[] = [];
    const board: BoardAnimator = {
      shake: (id) => {
        log.push(`shake ${id}`);
        return Promise.resolve();
      },
      previewLane: (id) => void log.push(`lane ${id}`),
      previewKey: (id) => void log.push(`key ${id}`),
      unlock: (id) => {
        log.push(`unlock ${id}`);
        return Promise.resolve();
      },
      exit: () => Promise.resolve(),
      sync: () => void log.push('sync'),
    };
    const hud: HudSink = {
      onEvent: (e) => void log.push(`hud ${e.type}`),
      render: () => void log.push('render'),
    };
    return { log, player: new EventPlayer(board, hud) };
  }

  it('gesperrtes Fahrzeug: Schluessel hervorheben statt Fahrspur zeigen', async () => {
    const { log, player } = setup();
    await player.play(
      [{ type: 'vehicleBlocked', vehicleId: 'v3', reason: 'locked', blockerId: null }],
      state,
    );
    expect(log).toEqual(['hud vehicleBlocked', 'key v3', 'shake v3', 'sync', 'render']);
  });

  it('normal blockiertes Fahrzeug zeigt weiter die Fahrspur', async () => {
    const { log, player } = setup();
    await player.play(
      [{ type: 'vehicleBlocked', vehicleId: 'v3', reason: 'path', blockerId: 'v4' }],
      state,
    );
    expect(log).toContain('lane v3');
    expect(log).not.toContain('key v3');
  });

  it('vehicleUnlocked wird animiert, bevor der Zustand abgeglichen wird', async () => {
    const { log, player } = setup();
    await player.play([{ type: 'vehicleUnlocked', vehicleId: 'v3' }], state);
    expect(log).toEqual(['hud vehicleUnlocked', 'unlock v3', 'sync', 'render']);
  });

  it('ein Animator ohne unlock/previewKey genuegt', async () => {
    const board: BoardAnimator = {
      shake: () => Promise.resolve(),
      exit: () => Promise.resolve(),
      sync: () => undefined,
    };
    const player = new EventPlayer(board, { onEvent: () => undefined, render: () => undefined });
    await player.play(
      [
        { type: 'vehicleUnlocked', vehicleId: 'v3' },
        { type: 'vehicleBlocked', vehicleId: 'v3', reason: 'locked', blockerId: null },
      ],
      state,
    );
  });
});
