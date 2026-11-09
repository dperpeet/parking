// Klangrezepte: jeder Klang ist eine kurze Folge synthetischer Toene (keine Audiodateien).

export interface Tone {
  wave: OscillatorType;
  /** Frequenz in Hz am Anfang und am Ende (gleitet linear). */
  from: number;
  to: number;
  /** Start relativ zum Klang und Dauer, in Sekunden. */
  at: number;
  dur: number;
  /** Spitzenlautstaerke 0..1 vor der Gesamtlautstaerke. */
  gain: number;
}

const tone = (
  wave: OscillatorType,
  from: number,
  to: number,
  at: number,
  dur: number,
  gain: number,
): Tone => ({
  wave,
  from,
  to,
  at,
  dur,
  gain,
});

// Noten in Hz (gleichstufig, A4 = 440).
const G4 = 392;
const B4 = 493.88;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

export const RECIPES = {
  exit: [tone('triangle', 220, 520, 0, 0.18, 0.35)],
  bump: [tone('square', 150, 90, 0, 0.09, 0.18)],
  board: [tone('sine', 660, 880, 0, 0.07, 0.3)],
  depart: [tone('sawtooth', 110, 260, 0, 0.35, 0.14), tone('triangle', 220, 520, 0, 0.35, 0.2)],
  // Hupe: zweimal kurz, als Zweiklang.
  honk: [
    tone('square', G4, G4, 0, 0.11, 0.1),
    tone('square', B4, B4, 0, 0.11, 0.1),
    tone('square', G4, G4, 0.15, 0.13, 0.1),
    tone('square', B4, B4, 0.15, 0.13, 0.1),
  ],
  unlock: [tone('sine', 1200, 1200, 0, 0.04, 0.25), tone('sine', 1600, 1600, 0.05, 0.06, 0.25)],
  undo: [tone('triangle', 520, 330, 0, 0.14, 0.3)],
  shuffle: [
    tone('sine', 600, 600, 0, 0.05, 0.25),
    tone('sine', 750, 750, 0.05, 0.05, 0.25),
    tone('sine', 900, 900, 0.1, 0.06, 0.25),
  ],
  slot: [tone('sine', 440, 660, 0, 0.12, 0.3)],
  won: [
    tone('triangle', C5, C5, 0, 0.16, 0.3),
    tone('triangle', E5, E5, 0.1, 0.16, 0.3),
    tone('triangle', G5, G5, 0.2, 0.16, 0.3),
    tone('triangle', C6, C6, 0.3, 0.45, 0.3),
  ],
  lost: [
    tone('triangle', G4, G4, 0, 0.18, 0.3),
    tone('triangle', E5 / 2, E5 / 2, 0.18, 0.18, 0.3),
    tone('triangle', C5 / 2, C5 / 2, 0.36, 0.4, 0.3),
  ],
} satisfies Record<string, Tone[]>;
