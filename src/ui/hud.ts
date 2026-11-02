import type { Action, GameEvent, GameState, PowerUpId } from '../engine/types';
import type { ResolvedRules } from '../schema';
import { createDialogs } from './components/dialogs';
import { createHeader } from './components/header';
import { createPassengers } from './components/passengers';
import { createPowerUps } from './components/powerups';
import { createQueue } from './components/queue';
import type { Shell } from './shell';
import { announce } from './strings';
import { createVehicleButtons } from './vehicle-buttons';

export interface HudActions {
  dispatch(action: Action): void;
  restart(): void;
  next(): void;
  similar(): void;
}

export interface Hud {
  onEvent(event: GameEvent, state: GameState): void;
  render(state: GameState): void;
  moveFocus(dx: number, dy: number): void;
  isDialogOpen(): boolean;
}

export function createHud(shell: Shell, rules: () => ResolvedRules, actions: HudActions): Hud {
  const usePowerUp = (powerUp: PowerUpId): void =>
    actions.dispatch({ type: 'usePowerUp', powerUp });

  const header = createHeader(shell.header, () => undefined);
  const passengers = createPassengers(shell.passengers);
  const queue = createQueue(shell.queue);
  const buttons = createVehicleButtons(shell.vehicleLayer, (vehicleId) =>
    actions.dispatch({ type: 'tapVehicle', vehicleId }),
  );
  const powerUps = createPowerUps(shell.powerUps, {
    onPowerUp: usePowerUp,
    onRestart: actions.restart,
  });
  const dialogs = createDialogs(shell.dialogLayer, shell.game, {
    onNext: actions.next,
    onAgain: actions.restart,
    onSimilar: actions.similar,
    onUndo: () => usePowerUp('undo'),
  });

  let pending: string[] = [];

  return {
    onEvent(event, state) {
      const text = announce(event, state);
      if (text) pending.push(text);
    },
    render(state) {
      header.update(state.levelId, state.moves);
      passengers.update(state, rules().passengers.visible);
      queue.update(state);
      powerUps.update(state);
      buttons.update(state);
      dialogs.update(state);
      if (pending.length > 0) {
        shell.live.textContent = pending.join('. ');
        pending = [];
      }
    },
    moveFocus: buttons.moveFocus,
    isDialogOpen: dialogs.isOpen,
  };
}
