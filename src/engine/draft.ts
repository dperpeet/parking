import type { GameState, Snapshot } from './types';

/**
 * Arbeitskopie fuer einen Schritt. Kopiert, was Regeln mutieren (Fahrzeuge, Slots, Zaehler);
 * passengers und history werden nie in-place veraendert, sondern ersetzt.
 */
export function draft(state: GameState): GameState {
  return {
    ...state,
    vehicles: state.vehicles.map((v) => ({ ...v })),
    slots: state.slots.map((s) => ({ ...s })),
    powerUps: { ...state.powerUps },
  };
}

/** Snapshot des unveraenderten Eingabezustands (wird nie mutiert, daher ohne Kopie teilbar). */
export function takeSnapshot(state: GameState): Snapshot {
  return {
    vehicles: state.vehicles,
    slots: state.slots,
    passengers: state.passengers,
    passengerIndex: state.passengerIndex,
    moves: state.moves,
    rng: state.rng,
  };
}
