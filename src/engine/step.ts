import type { ResolvedRules } from '../schema';
import { boardPassengers } from './boarding';
import { draft, takeSnapshot } from './draft';
import { applyHonk } from './rules/powerups/honk';
import { applyExtraSlot } from './rules/powerups/extraSlot';
import { applyShuffle } from './rules/powerups/shuffle';
import type { PowerUpOutcome } from './rules/powerups/types';
import { applyUndo } from './rules/powerups/undo';
import { evaluateOutcome, loseGame } from './rules/outcome';
import { applyExit, checkTap } from './rules/tap';
import type { Action, GameEvent, GameState, PowerUpId, StepResult } from './types';

/** `vehicleId` = das in der Aktion genannte Fahrzeug (falls vorhanden), damit der Renderer es zeigen kann. */
function invalid(state: GameState, reason: string, vehicleId?: string): StepResult {
  const event: GameEvent =
    vehicleId === undefined
      ? { type: 'invalidAction', reason }
      : { type: 'invalidAction', reason, vehicleId };
  return { state, events: [event] };
}

/** Einsteigen und Sieg/Niederlage nach einer Zustandsaenderung. */
function settle(s: GameState, rules: ResolvedRules, events: GameEvent[]): void {
  boardPassengers(s, rules, events);
  evaluateOutcome(s, rules, events);
}

function tap(state: GameState, vehicleId: string, rules: ResolvedRules): StepResult {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return invalid(state, 'unknownVehicle', vehicleId);
  if (vehicle.status !== 'parked') return invalid(state, 'notParked', vehicleId);

  const check = checkTap(state, vehicle);
  if (!check.ok) {
    const event: GameEvent = {
      type: 'vehicleBlocked',
      vehicleId,
      reason: check.reason,
      blockerId: check.blockerId,
    };
    return { state, events: [event] };
  }

  const s = draft(state);
  const events: GameEvent[] = [];
  s.history = [...s.history, takeSnapshot(state)];
  applyExit(s, vehicleId, check.path, rules, events);
  settle(s, rules, events);
  return { state: s, events };
}

function usePowerUp(
  state: GameState,
  powerUp: PowerUpId,
  vehicleId: string | undefined,
  rules: ResolvedRules,
): StepResult {
  // Nach Niederlage erlaubt: Undo immer, Hupe nur bei noMoves.
  const allowedWhenLost =
    powerUp === 'undo' || (powerUp === 'honk' && state.loseReason === 'noMoves');
  const target = powerUp === 'honk' ? vehicleId : undefined;
  if (state.status === 'lost' && !allowedWhenLost) return invalid(state, 'gameLost', target);
  if (state.powerUps[powerUp] <= 0) return invalid(state, 'noUsesLeft', target);

  const s = draft(state);
  const events: GameEvent[] = [];
  let outcome: PowerUpOutcome;
  switch (powerUp) {
    case 'undo':
      outcome = applyUndo(s, events);
      break;
    case 'shuffle':
      outcome = applyShuffle(s, state, rules, events);
      break;
    case 'extraSlot':
      outcome = applyExtraSlot(s, rules, events);
      break;
    case 'honk':
      outcome = applyHonk(s, state, vehicleId, events);
      break;
  }
  if (!outcome.ok) return invalid(state, outcome.reason, target);

  s.powerUps[powerUp] -= 1;
  s.powerUpsUsed += 1;
  events.push({ type: 'powerUpUsed', powerUp, remaining: s.powerUps[powerUp] });
  if (outcome.settle) settle(s, rules, events);
  return { state: s, events };
}

/** Das in der Aktion genannte Fahrzeug (Tipp oder Hupe), sonst undefined. */
function namedVehicle(action: Action): string | undefined {
  if (action.type === 'tapVehicle') return action.vehicleId;
  if (action.type === 'usePowerUp' && action.powerUp === 'honk') return action.vehicleId;
  return undefined;
}

export function step(state: GameState, action: Action, rules: ResolvedRules): StepResult {
  if (state.status === 'won') {
    return invalid(state, 'gameWon', namedVehicle(action));
  }
  switch (action.type) {
    case 'tapVehicle':
      if (state.status === 'lost') return invalid(state, 'gameLost', action.vehicleId);
      return tap(state, action.vehicleId, rules);
    case 'usePowerUp':
      return usePowerUp(state, action.powerUp, action.vehicleId, rules);
    case 'timeUp': {
      if (state.status === 'lost') return invalid(state, 'gameLost');
      const s = draft(state);
      const events: GameEvent[] = [];
      loseGame(s, 'timeUp', events);
      return { state: s, events };
    }
  }
}
