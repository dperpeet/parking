import { describe, expect, it } from 'vitest';
import { createSound, cueFor } from '../../../src/audio';
import type { AudioContextLike } from '../../../src/audio';
import type { GameEvent } from '../../../src/engine/types';

interface Started {
  type: string;
  freq: number;
  at: number;
}

/** Minimaler AudioContext, der gestartete Oszillatoren mitschreibt. */
function fakeContext(state: AudioContextState = 'running') {
  const started: Started[] = [];
  let resumed = 0;
  const param = () => {
    const p = { value: 0, first: 0 };
    return {
      ...p,
      setValueAtTime(v: number) {
        if (p.first === 0) p.first = v;
        return this;
      },
      linearRampToValueAtTime() {
        return this;
      },
      exponentialRampToValueAtTime() {
        return this;
      },
      get firstValue() {
        return p.first;
      },
    };
  };
  const node = () => ({ connect: () => undefined });
  const ctx = {
    currentTime: 1,
    state,
    destination: {},
    resume: () => {
      resumed += 1;
      return Promise.resolve();
    },
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      const frequency = param();
      const osc = {
        ...node(),
        type: 'sine',
        frequency,
        start: (at: number) => started.push({ type: osc.type, freq: frequency.firstValue, at }),
        stop: () => undefined,
      };
      return osc;
    },
  };
  return { ctx: ctx as unknown as AudioContextLike, started, resumed: () => resumed };
}

const exited: GameEvent = { type: 'vehicleExited', vehicleId: 'v1', slotIndex: 0, path: [] };
const boarded = (filled: number): GameEvent => ({
  type: 'passengerBoarded',
  passengerIndex: 0,
  color: 'red',
  vehicleId: 'v1',
  slotIndex: 0,
  filled,
});

describe('cueFor', () => {
  it('ordnet Events Klaengen zu, Verwaltungs-Events bleiben still', () => {
    expect(cueFor(exited)?.id).toBe('exit');
    expect(
      cueFor({ type: 'vehicleBlocked', vehicleId: 'v1', reason: 'path', blockerId: null })?.id,
    ).toBe('bump');
    expect(cueFor({ type: 'invalidAction', reason: 'notBlocked' })?.id).toBe('bump');
    expect(cueFor(boarded(3))).toEqual({ id: 'board', step: 3 });
    expect(cueFor({ type: 'vehicleDeparted', vehicleId: 'v1', slotIndex: 0 })?.id).toBe('depart');
    expect(
      cueFor({
        type: 'vehicleYielded',
        vehicleId: 'v2',
        byVehicleId: 'v1',
        from: [0, 0],
        to: [1, 0],
      })?.id,
    ).toBe('honk');
    expect(cueFor({ type: 'vehicleUnlocked', vehicleId: 'v1' })?.id).toBe('unlock');
    expect(cueFor({ type: 'stateRestored' })?.id).toBe('undo');
    expect(cueFor({ type: 'passengersShuffled', from: 0, to: 3 })?.id).toBe('shuffle');
    expect(cueFor({ type: 'slotAdded', slotIndex: 4 })?.id).toBe('slot');
    expect(cueFor({ type: 'won', moves: 3, stars: 3 })?.id).toBe('won');
    expect(cueFor({ type: 'lost', reason: 'noMoves' })?.id).toBe('lost');
    expect(cueFor({ type: 'slotShifted', vehicleId: 'v1', from: 1, to: 0 })).toBeNull();
    expect(cueFor({ type: 'powerUpUsed', powerUp: 'undo', remaining: 1 })).toBeNull();
  });
});

describe('createSound', () => {
  it('ausgeschaltet entsteht kein AudioContext', () => {
    let created = 0;
    const sound = createSound({
      createContext: () => {
        created += 1;
        return fakeContext().ctx;
      },
    });
    sound.cue(exited);
    expect(created).toBe(0);
    expect(sound.isEnabled()).toBe(false);
  });

  it('eingeschaltet spielt es Toene und erzeugt den Context nur einmal', () => {
    const fake = fakeContext();
    let created = 0;
    const sound = createSound({
      createContext: () => {
        created += 1;
        return fake.ctx;
      },
    });
    sound.setEnabled(true);
    sound.cue(exited);
    sound.cue({ type: 'won', moves: 1, stars: 3 });
    expect(created).toBe(1);
    expect(fake.started.length).toBe(5);
  });

  it('gleichzeitige Klaenge werden versetzt, Einsteigen steigt in der Tonhoehe', () => {
    const fake = fakeContext();
    const sound = createSound({ createContext: () => fake.ctx });
    sound.setEnabled(true);
    sound.cue(boarded(1));
    sound.cue(boarded(2));
    const [a, b] = fake.started;
    expect(b!.at).toBeGreaterThan(a!.at);
    expect(b!.freq).toBeGreaterThan(a!.freq);
  });

  it('weckt einen angehaltenen Context auf', () => {
    const fake = fakeContext('suspended');
    const sound = createSound({ createContext: () => fake.ctx });
    sound.setEnabled(true);
    sound.play('bump');
    expect(fake.resumed()).toBe(1);
  });

  it('ohne Web Audio oder bei Fehlern bleibt es still und wirft nicht', () => {
    let calls = 0;
    const none = createSound({
      createContext: () => {
        calls += 1;
        return null;
      },
    });
    none.setEnabled(true);
    none.play('honk');
    none.play('honk');
    expect(calls).toBe(1);

    const broken = createSound({
      createContext: () => {
        throw new Error('kein Audio');
      },
    });
    broken.setEnabled(true);
    expect(() => broken.play('won')).not.toThrow();

    const fake = fakeContext();
    (fake.ctx as unknown as { createOscillator: () => never }).createOscillator = () => {
      throw new Error('kaputt');
    };
    const failing = createSound({ createContext: () => fake.ctx });
    failing.setEnabled(true);
    expect(() => failing.play('exit')).not.toThrow();
  });

  it('der Browser-Default liefert ohne AudioContext null', () => {
    const sound = createSound();
    sound.setEnabled(true);
    expect(() => sound.play('exit')).not.toThrow();
  });
});
