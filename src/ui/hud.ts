import type { Action, GameEvent, GameState, PowerUpId } from '../engine/types';
import type { ResolvedRules } from '../schema';
import { t } from '../i18n';
import { createDialogs } from './components/dialogs';
import type { DialogInfo, MaybeAsync } from './components/dialogs';
import { createHeader } from './components/header';
import type { HeaderTitle } from './components/header';
import { createPassengers } from './components/passengers';
import { createPowerUps } from './components/powerups';
import type { HintStatus } from './components/powerups';
import { createQueue } from './components/queue';
import type { Shell } from './shell';
import { announce } from './strings';
import { h } from './dom';
import { createVehicleButtons } from './vehicle-buttons';

/** Alles, was das HUD pro Zustand vom Modus (Kampagne, Tageslevel, Endlos ...) erfragt. */
export interface HudInfo {
  title: HeaderTitle;
  dialog: DialogInfo;
  hint: HintStatus;
  /** Teilbarer Ergebnistext (nur Tageslevel nach Sieg), sonst null. */
  share: string | null;
}

export type ShareResult = 'shared' | 'copied' | 'manual' | 'cancelled';

export interface HudActions {
  dispatch(action: Action): void;
  restart(): void;
  /** "Nochmal" im Dialog (kann im Endlos-Modus einen neuen Run starten). */
  again(): MaybeAsync;
  next(): MaybeAsync;
  similar(): MaybeAsync;
  hint(): void;
  /** Teilt den Text (Share-Dialog, Zwischenablage); wirft nie. */
  share(text: string): Promise<ShareResult>;
  back(): void;
  info(state: GameState): HudInfo;
}

export interface Hud {
  onEvent(event: GameEvent, state: GameState): void;
  render(state: GameState): void;
  /** Zeichnet den zuletzt gezeigten Zustand neu (z. B. nach Aenderung der Tipp-Anzahl). */
  refresh(): void;
  moveFocus(dx: number, dy: number): void;
  isDialogOpen(): boolean;
  /** Screenreader-Ansage ausserhalb der Engine-Events. */
  announce(text: string): void;
  /** Markiert ein Fahrzeug als Tipp (null entfernt die Markierung). */
  setHint(vehicleId: string | null): void;
}

export function createHud(shell: Shell, rules: () => ResolvedRules, actions: HudActions): Hud {
  const usePowerUp = (powerUp: PowerUpId): void =>
    actions.dispatch({ type: 'usePowerUp', powerUp });

  const header = createHeader(shell.header, actions.back);
  const passengers = createPassengers(shell.passengers);
  const queue = createQueue(shell.queue);
  const buttons = createVehicleButtons(shell.vehicleLayer, (vehicleId) =>
    actions.dispatch({ type: 'tapVehicle', vehicleId }),
  );
  const powerUps = createPowerUps(shell.powerUps, {
    onPowerUp: usePowerUp,
    onHint: actions.hint,
    onRestart: actions.restart,
  });
  const dialogs = createDialogs(shell.dialogLayer, shell.game, {
    onNext: actions.next,
    onAgain: actions.again,
    onSimilar: actions.similar,
    onUndo: () => usePowerUp('undo'),
    onMenu: actions.back,
    info: (state) => actions.info(state).dialog,
  });

  let pending: string[] = [];
  let last: GameState | null = null;

  const paint = (state: GameState): void => {
    last = state;
    const info = actions.info(state);
    header.update(info.title, state.moves);
    passengers.update(state, rules().passengers.visible);
    queue.update(state);
    powerUps.update(state, info.hint);
    buttons.update(state);
    dialogs.update(state);
    attachShare(state, info.share);
  };

  /** Haengt "Ergebnis teilen" an den Sieg-Dialog (einmalig je Dialog). */
  const attachShare = (state: GameState, text: string | null): void => {
    const dialog = shell.dialogLayer.querySelector('.dialog-win');
    if (!dialog || state.status !== 'won' || text === null) return;
    if (dialog.querySelector('[data-testid="share-result"]')) return;
    const status = h('p', {
      class: 'share-status',
      role: 'status',
      'data-testid': 'share-status',
    });
    const button = h(
      'button',
      { type: 'button', class: 'btn btn-secondary', 'data-testid': 'share-result' },
      t('shareResult'),
    );
    button.addEventListener('click', () => {
      void actions.share(text).then((result) => {
        if (!button.isConnected) return;
        if (result === 'copied') status.textContent = t('shareCopied');
        else if (result === 'manual') {
          // Letzter Ausweg: Text zum Markieren anzeigen.
          const box = h('textarea', {
            class: 'share-text',
            readonly: true,
            rows: text.split('\n').length,
            'aria-label': t('shareManual'),
            'data-testid': 'share-text',
          });
          box.value = text;
          status.replaceChildren(t('shareManual'), box);
          box.focus();
          box.select();
        }
      });
    });
    const next = dialog.querySelector('.dlg-row');
    dialog.insertBefore(
      h('div', { class: 'dlg-share' }, button, status),
      next?.nextSibling ?? null,
    );
  };

  const say = (text: string): void => {
    shell.live.textContent = text;
  };

  return {
    onEvent(event, state) {
      const text = announce(event, state);
      if (text) pending.push(text);
    },
    render(state) {
      paint(state);
      if (pending.length > 0) {
        say(pending.join('. '));
        pending = [];
      }
    },
    refresh() {
      if (last) paint(last);
    },
    moveFocus: buttons.moveFocus,
    isDialogOpen: dialogs.isOpen,
    announce: say,
    setHint: buttons.setHint,
  };
}
