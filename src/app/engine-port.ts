import type { CreateGame, Step } from '../engine/types';

/** Schmale Engine-Schnittstelle, die der Controller braucht. Die App nutzt die echte Engine; Tests koennen eine eigene Implementierung einsetzen. */
export interface EngineApi {
  createGame: CreateGame;
  step: Step;
}
