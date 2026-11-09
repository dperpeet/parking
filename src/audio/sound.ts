// Spielt Klaenge per Web Audio. Alles ist optional: ohne Web Audio bleibt das Spiel still.
import type { GameEvent } from '../engine/types';
import { cueFor } from './cues';
import type { CueId } from './cues';
import { RECIPES } from './recipes';

/** Der Teil von AudioContext, den der Sound braucht (in Tests ersetzbar). */
export type AudioContextLike = Pick<
  AudioContext,
  'currentTime' | 'state' | 'destination' | 'resume' | 'createOscillator' | 'createGain'
>;

export interface SoundOptions {
  /** Erzeugt den AudioContext beim ersten Klang; `null`, wenn es kein Web Audio gibt. */
  createContext?: () => AudioContextLike | null;
}

export interface Sound {
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  /** Spielt den Klang zu einem Engine-Event (falls es einen gibt). */
  cue(event: GameEvent): void;
  play(id: CueId, step?: number): void;
}

/** Gesamtlautstaerke ueber allen Klaengen. */
const MASTER_GAIN = 0.5;
/** Klaenge im selben Moment (z. B. mehrere Fahrgaeste) werden um so viele Sekunden versetzt. */
const STAGGER_SEC = 0.06;
/** Einschwingzeit und Ziel des Ausklingens (exponentiell, darf nicht 0 sein). */
const ATTACK_SEC = 0.005;
const SILENT = 0.0001;
const SEMITONE = 2 ** (1 / 12);

function browserContext(): AudioContextLike | null {
  const Ctor = globalThis.AudioContext as typeof AudioContext | undefined;
  return Ctor ? new Ctor() : null;
}

export function createSound(opts: SoundOptions = {}): Sound {
  const create = opts.createContext ?? browserContext;
  let enabled = false;
  let ctx: AudioContextLike | null = null;
  let master: GainNode | null = null;
  let unavailable = false;
  let nextStart = 0;

  const context = (): { ctx: AudioContextLike; master: GainNode } | null => {
    if (unavailable) return null;
    if (!ctx || !master) {
      try {
        ctx = create();
        if (!ctx) {
          unavailable = true;
          return null;
        }
        master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(ctx.destination);
      } catch {
        unavailable = true;
        ctx = null;
        master = null;
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return { ctx, master };
  };

  const play = (id: CueId, step = 0): void => {
    if (!enabled) return;
    const audio = context();
    if (!audio) return;
    try {
      const start = Math.max(audio.ctx.currentTime, nextStart);
      nextStart = start + STAGGER_SEC;
      const pitch = SEMITONE ** step;
      for (const t of RECIPES[id]) {
        const begin = start + t.at;
        const end = begin + t.dur;
        const osc = audio.ctx.createOscillator();
        const env = audio.ctx.createGain();
        osc.type = t.wave;
        osc.frequency.setValueAtTime(t.from * pitch, begin);
        osc.frequency.linearRampToValueAtTime(t.to * pitch, end);
        env.gain.setValueAtTime(SILENT, begin);
        env.gain.linearRampToValueAtTime(t.gain, begin + ATTACK_SEC);
        env.gain.exponentialRampToValueAtTime(SILENT, end);
        osc.connect(env);
        env.connect(audio.master);
        osc.start(begin);
        osc.stop(end);
      }
    } catch {
      // Ein fehlgeschlagener Klang ist kein Spielfehler.
    }
  };

  return {
    setEnabled(on) {
      enabled = on;
    },
    isEnabled: () => enabled,
    cue(event) {
      const c = cueFor(event);
      if (c) play(c.id, c.step);
    },
    play,
  };
}
