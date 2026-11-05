import type { Action, GameEvent, GameState, PowerUpId } from '../engine/types';
import type { ResolvedRules } from '../schema';
import { t } from '../i18n';
import { createDialogs } from './components/dialogs';
import type { DialogInfo, MaybeAsync } from './components/dialogs';
import { createHeader } from './components/header';
import type { HeaderTitle } from './components/header';
import { createPassengers } from './components/passengers';
import { createPowerUps } from './components/powerups';
import { createStuckCard } from './components/stuck-card';
import type { HintStatus } from './components/powerups';
import { createQueue } from './components/queue';
import type { Shell } from './shell';
import { announce, honkErrorText } from './strings';
import { h, icon } from './dom';
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
  /** Ids der Fahrzeuge, deren Hupe die Engine annehmen wuerde (Zielmodus: nur sie werden hervorgehoben). */
  honkTargets(state: GameState): string[];
  /** Kurze sichtbare Meldung (Toast), z. B. wenn Hupen nicht moeglich ist. */
  notify(text: string): void;
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
  /**
   * Markiert ein Fahrzeug als Tipp (null entfernt die Markierung). Bei `honk` wird zusaetzlich
   * der Hupen-Knopf hervorgehoben.
   */
  setHint(vehicleId: string | null, action?: 'tap' | 'honk'): void;
  /** Schaltet den Hupen-Zielmodus um (Knopf, Taste H); wirkungslos, wenn die Hupe nicht nutzbar ist. */
  toggleHonk(): void;
  /** Hupen-Knopf pulsiert mit Sprechblase (proaktiver Hinweis); unabhaengig vom Fahrzeug-Tipp. */
  nudgeHonk(on: boolean): void;
  /** Beendet den Zielmodus; true, wenn er aktiv war. */
  cancelHonk(): boolean;
}

export function createHud(shell: Shell, rules: () => ResolvedRules, actions: HudActions): Hud {
  const usePowerUp = (powerUp: PowerUpId): void =>
    actions.dispatch({ type: 'usePowerUp', powerUp });

  const header = createHeader(shell.header, actions.back);
  const passengers = createPassengers(shell.passengers);
  const queue = createQueue(shell.queue);
  let honkMode = false;
  let last: GameState | null = null;
  let pending: string[] = [];
  let vehicleHonkHint = false;
  let honkNudge = false;

  const honkEnabled = (): boolean => rules().powerups.honk.enabled;
  /** Hupe nutzbar: Zaehler offen, Spiel laeuft oder ist wegen `noMoves` verloren. */
  const honkUsable = (state: GameState): boolean =>
    honkEnabled() &&
    state.powerUps.honk > 0 &&
    (state.status === 'playing' || (state.status === 'lost' && state.loseReason === 'noMoves'));

  // Banner im Zielmodus: Anleitung und sichtbarer Abbrechen-Knopf.
  const honkHint = h('div', {
    class: 'honk-hint panel',
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'honk-hint',
  });
  shell.boardWrap.append(honkHint);

  let validTargets = new Set<string>();

  const leaveHonkMode = (): void => {
    honkMode = false;
    honkHint.replaceChildren();
    shell.vehicleLayer.removeAttribute('data-honk-mode');
    buttons.setHonkTargets(null);
  };

  const setHonkMode = (on: boolean): void => {
    if (honkMode === on) return;
    if (on) {
      honkMode = true;
      const cancel = h(
        'button',
        {
          type: 'button',
          class: 'honk-cancel',
          'aria-label': t('honkCancel'),
          'data-testid': 'honk-cancel',
        },
        icon('close'),
      );
      cancel.addEventListener('click', () => setHonkMode(false));
      honkHint.replaceChildren(h('span', { class: 'honk-hint-text' }, t('honkTarget')), cancel);
      shell.vehicleLayer.setAttribute('data-honk-mode', 'true');
      validTargets = new Set(last ? actions.honkTargets(last) : []);
      buttons.setHonkTargets(validTargets);
    } else leaveHonkMode();
    if (last) paint(last);
  };

  const buttons = createVehicleButtons(shell.vehicleLayer, (vehicleId) => {
    if (!honkMode) {
      actions.dispatch({ type: 'tapVehicle', vehicleId });
      return;
    }
    if (validTargets.has(vehicleId)) {
      // Der Modus endet mit der gueltigen Hupe. Gemalt wird nur der Knopf:
      // ein Neuzeichnen des alten Zustands wuerde einen Verlust-Dialog waehrend der Animation zeigen.
      leaveHonkMode();
      if (last) paintPowerUps(last);
    }
    // Fehlgriff: Der Modus bleibt, die Engine lehnt ab (Meldung und Wackeln kommen aus den Events).
    actions.dispatch({ type: 'usePowerUp', powerUp: 'honk', vehicleId });
  });
  const powerUps = createPowerUps(shell.powerUps, {
    onPowerUp: usePowerUp,
    onHonk: () => {
      if (honkMode) setHonkMode(false);
      else if (last && honkUsable(last)) setHonkMode(true);
    },
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

  const stuckCard = createStuckCard(
    shell.game,
    {
      onHonk: () => {
        setHonkMode(true);
        buttons.moveFocus(0, 0);
      },
      onUndo: () => usePowerUp('undo'),
      onAgain: () => void actions.again(),
    },
    shell.powerUps,
  );

  /** Sackgasse mit Hupe uebrig: Hilfe-Karte statt Verlust-Dialog. */
  const isStuck = (state: GameState): boolean =>
    state.status === 'lost' && state.loseReason === 'noMoves' && honkUsable(state);

  const syncHonkButton = (): void => powerUps.setHonkHint(vehicleHonkHint || honkNudge);

  const paintPowerUps = (state: GameState): void =>
    powerUps.update(state, actions.info(state).hint, {
      enabled: honkEnabled(),
      usable: honkUsable(state),
      active: honkMode,
    });

  const paint = (state: GameState): void => {
    last = state;
    // Wird die Hupe unbenutzbar (Sieg, Niederlage, Zaehler 0, neues Level), endet der Zielmodus.
    if (honkMode && !honkUsable(state)) leaveHonkMode();
    const info = actions.info(state);
    header.update(info.title, state.moves);
    passengers.update(state, rules().passengers.visible);
    queue.update(state);
    paintPowerUps(state);
    // Mit der Sackgassen-Karte schrumpft das Brett (data-stuck), bleibt aber ganz sichtbar; vor dem Button-Layout setzen.
    const showCard = isStuck(state) && !honkMode;
    shell.game.toggleAttribute('data-stuck', showCard);
    buttons.update(state);
    stuckCard.update(state, showCard);
    dialogs.update(state, honkMode || isStuck(state));
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
      if (event.type === 'vehicleYielded') actions.notify(t('honkPraise'));
      if (event.type === 'invalidAction') {
        const message = honkErrorText(event.reason);
        if (message) actions.notify(message);
      }
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
    setHint(vehicleId, action = 'tap') {
      buttons.setHint(vehicleId, action);
      vehicleHonkHint = vehicleId !== null && action === 'honk';
      syncHonkButton();
    },
    nudgeHonk(on) {
      honkNudge = on;
      syncHonkButton();
    },
    toggleHonk() {
      if (honkMode) setHonkMode(false);
      else if (last && honkUsable(last) && !dialogs.isOpen()) setHonkMode(true);
    },
    cancelHonk() {
      if (!honkMode) return false;
      setHonkMode(false);
      return true;
    },
  };
}
