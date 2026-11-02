import type { CreateGame, Step } from '../engine/types';

/** Schmale Engine-Schnittstelle, die der Controller braucht. Echte und Fake-Engine erfuellen sie. */
export interface EngineApi {
  createGame: CreateGame;
  step: Step;
}
