// Spielbildschirm: Shell + HUD + Pixi-Brett, verbunden mit einer GameSession.
import { t } from '../i18n';
import type { StringKey } from '../i18n';
import type { GameEvent, GameState } from '../engine/types';
import { BoardView, EventPlayer, createPixiApp } from '../render';
import type { PixiHandle } from '../render';
import { THEME } from '../render/theme';
import { bindKeyboard, createHud, mountShell, openIntro } from '../ui';
import type { Hud, IntroCard } from '../ui';
import { hintAnnouncement } from '../ui/strings';
import { browserShareEnv, buildDailyShareText, pageUrl, shareText } from './daily-share';
import { HINT_DISPLAY_MS } from './hints';
import type { HonkAdvice } from './honk-guide';
import type { GameSession, SharedError } from './session';

/** Wie lange die Schrift hoechstens geladen wird, bevor das Spiel startet. */
const FONT_WAIT_MS = 1500;
const TOAST_MS = 3000;
/** Der Hinweis auf ein ungeprueftes Level bleibt etwas laenger stehen. */
const NOTICE_MS = 6000;

/** Fehlertext je Fehlergruppe eines geteilten Levels. */
const SHARE_ERROR_TEXT: Record<SharedError, StringKey> = {
  empty: 'shareErrBroken',
  encoding: 'shareErrBroken',
  inflate: 'shareErrBroken',
  json: 'shareErrBroken',
  tooLong: 'shareErrTooLong',
  version: 'shareErrVersion',
  schema: 'shareErrInvalid',
  unknownRuleset: 'shareErrInvalid',
  invalidLevel: 'shareErrInvalid',
  unsolvable: 'shareErrUnsolvable',
};

let fontReady: Promise<void> | null = null;
function loadFont(): Promise<void> {
  fontReady ??= (async () => {
    try {
      await Promise.race([
        document.fonts.load(`800 24px ${THEME.font}`),
        new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
      ]);
    } catch {
      // Schrift ist optional, Fallback-Schrift reicht.
    }
  })();
  return fontReady;
}

/** Ereignisse, die den Zustand nicht aendern: ein Tipp bleibt dabei stehen. */
function changesNothing(events: GameEvent[]): boolean {
  return (
    events.length > 0 &&
    events.every((e) => e.type === 'vehicleBlocked' || e.type === 'invalidAction')
  );
}

export interface GameScreenOptions {
  /** Zurueck zur Levelauswahl (Header-Pfeil, Menue-Knopf). */
  back(): void;
  /** Screen neu aufbauen (Wiederholen nach Fehler). */
  retry(): void;
}

export interface GameScreen {
  dispose(): void;
}

function el(tag: string, cls: string, ...children: Array<Node | string>): HTMLElement {
  const node = document.createElement(tag);
  node.className = cls;
  node.append(...children);
  return node;
}

export function mountGameScreen(
  root: HTMLElement,
  session: GameSession,
  opts: GameScreenOptions,
): GameScreen {
  let disposed = false;
  let pixi: PixiHandle | null = null;
  let board: BoardView | null = null;
  let hud: Hud | null = null;
  let unbindKeys: (() => void) | null = null;
  let intro: IntroCard | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** Letzter Rat des Hupen-Hinweises (wartet ggf., bis die Intro-Karte zu ist). */
  let advice: HonkAdvice = { kind: 'none' };
  let nudgeAnnounced = false;

  const shell = mountShell(root);
  const layer = el('div', 'loading-layer');
  layer.setAttribute('data-testid', 'loading');
  const showLoading = (): void => {
    const spinner = el('span', 'spinner');
    spinner.setAttribute('aria-hidden', 'true');
    layer.replaceChildren(spinner, t('loading'));
    layer.setAttribute('role', 'status');
    shell.wrap.append(layer);
  };
  const showError = (): void => {
    const reason = session.errorReason();
    const retry = el('button', 'btn btn-primary', t('retry'));
    retry.setAttribute('type', 'button');
    retry.setAttribute('data-testid', 'retry');
    retry.addEventListener('click', opts.retry);
    const back = el('button', 'btn btn-secondary', t('toMenu'));
    back.setAttribute('type', 'button');
    back.addEventListener('click', opts.back);
    layer.removeAttribute('role');
    if (reason) {
      // Ein geteiltes Level wird beim Wiederholen nicht besser: nur Text und Rueckweg.
      const message = el('p', '', t(SHARE_ERROR_TEXT[reason]));
      message.setAttribute('data-testid', 'share-error');
      layer.replaceChildren(message, back);
    } else {
      layer.replaceChildren(el('p', '', t('loadFailed')), retry, back);
    }
    shell.wrap.append(layer);
  };

  const toast = (text: string, ms = TOAST_MS): void => {
    shell.boardWrap.querySelector('.toast')?.remove();
    // Lange Hinweise (ungeprueftes Level) duerfen umbrechen, alle anderen Meldungen bleiben einzeilig.
    const node = el('div', ms === NOTICE_MS ? 'toast toast-wrap panel' : 'toast panel', text);
    shell.boardWrap.append(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), ms);
  };

  /** Entfernt eine stehende Kurzmeldung sofort (Undo, Neustart, Levelwechsel, Sackgassen-Karte). */
  const clearToast = (): void => {
    clearTimeout(toastTimer);
    shell.boardWrap.querySelector('.toast')?.remove();
  };

  const clearHint = (): void => {
    clearTimeout(hintTimer);
    hud?.setHint(null);
    hud?.nudgeHonk(false);
    hud?.nudgeUndo(false);
    board?.highlight(null);
    advice = { kind: 'none' };
  };

  /** Zeigt den proaktiven Hupen-Hinweis: pulsierender Knopf, im gefuehrten Level auch die Blase am Fahrzeug. */
  const applyAdvice = (): void => {
    if (!hud || advice.kind !== 'honk' || intro) return;
    hud.nudgeHonk(true);
    if (!nudgeAnnounced) {
      nudgeAnnounced = true;
      hud.announce(t('honkNow'));
    }
    if (session.guidedHonk() && advice.move.action === 'honk') {
      hud.setHint(advice.move.vehicleId, 'honk');
      board?.highlight(advice.move.vehicleId);
    }
  };

  /** Fragt den Solver im Hintergrund (kein Tipp). Nur Pflicht-Hupe-Level bekommen einen Hinweis. */
  const refreshAdvice = async (): Promise<void> => {
    const { controller, honkGuide } = session;
    const result = await honkGuide.check(() => controller.getState(), controller.getRules());
    if (disposed || !hud) return;
    advice = result;
    applyAdvice();
  };

  /** Nach einer Hupe im Pflicht-Hupe-Level: Lob, wenn es danach noch zum Sieg reicht, sonst Hinweis auf Zurueck. */
  const judgeHonk = async (): Promise<void> => {
    const { controller, honkGuide } = session;
    const verdict = await honkGuide.assessHonk(() => controller.getState(), controller.getRules());
    // Im Verlust-Dialog steht der Hinweis selbst; ein veraltetes Urteil (neuer Zug) bleibt stumm.
    if (disposed || !hud || controller.getState().status === 'lost') return;
    if (verdict === 'useful') toast(t('honkPraise'));
    else if (verdict === 'useless') {
      hud.announce(t('honkUseless'));
      toast(t('honkUseless'), NOTICE_MS);
      hud.nudgeUndo(true);
    }
  };

  const onHint = async (): Promise<void> => {
    if (!hud) return;
    const { controller, hints } = session;
    const pending = hints.request(() => controller.getState(), controller.getRules());
    hud.refresh();
    const result = await pending;
    if (disposed || !hud) return;
    hud.refresh();
    switch (result.kind) {
      case 'vehicle': {
        const color =
          controller.getState().vehicles.find((v) => v.id === result.vehicleId)?.color ?? '';
        const text = hintAnnouncement(color, result.action);
        hud.announce(text);
        toast(text);
        hud.setHint(result.vehicleId, result.action);
        clearTimeout(hintTimer);
        if (result.action === 'honk') {
          // Ein Hupen-Tipp bleibt, bis gehupt, gezogen, zurueckgenommen oder neu gestartet wird.
          board?.highlight(result.vehicleId);
        } else {
          board?.highlight(result.vehicleId, HINT_DISPLAY_MS);
          hintTimer = setTimeout(() => hud?.setHint(null), HINT_DISPLAY_MS);
        }
        break;
      }
      case 'none':
        hud.announce(t('hintNone'));
        toast(t('hintNone'));
        break;
      case 'error':
        hud.announce(t('hintFailed'));
        toast(t('hintFailed'));
        break;
      case 'ignored':
        break;
    }
  };

  /** Zeigt die Intro-Karte, falls das Level eine noch ungesehene Mechanik einfuehrt. */
  const maybeShowIntro = (): void => {
    const mechanic = session.pendingIntro();
    if (!mechanic || intro) return;
    intro = openIntro(shell.dialogLayer, shell.game, mechanic, {
      plain: false,
      onClosed: () => {
        intro = null;
        if (disposed) return;
        session.markIntroSeen(mechanic);
        shell.game.querySelector<HTMLElement>('.vehicle-btn')?.focus();
        applyAdvice();
      },
    });
  };

  const shareFor = (state: GameState): string | null => {
    const data = session.dailyShare(state);
    return data ? buildDailyShareText(data, pageUrl(location)) : null;
  };

  const wire = async (): Promise<void> => {
    const { controller } = session;
    hud = createHud(shell, () => controller.getRules(), {
      dispatch: (a) => controller.dispatch(a),
      restart: () => session.restart(),
      again: () => session.again(),
      next: () => session.next(),
      similar: () => session.similar(),
      hint: () => void onHint(),
      honkTargets: (state) => session.honkTargets(state),
      notify: (text) => toast(text),
      clearToast,
      share: (text) => shareText(text, browserShareEnv()),
      back: opts.back,
      info: (state) => ({
        title: session.title(),
        dialog: session.dialogInfo(state),
        hint: { left: session.hints.left(), busy: session.hints.busy() },
        share: shareFor(state),
      }),
    });

    // Pixi ist nur fuer das Brett zustaendig. Scheitert WebGL, bleibt das Spiel ueber die DOM-Buttons bedienbar.
    try {
      const handle = await createPixiApp(shell.boardHost);
      if (disposed) {
        handle.destroy();
        return;
      }
      pixi = handle;
      board = new BoardView(handle);
      handle.onResize(() => board?.resize());
      shell.onFit(() => handle.resize());
    } catch (err) {
      console.warn('Pixi konnte nicht gestartet werden', err);
    }

    const player = new EventPlayer(
      board ?? {
        shake: () => Promise.resolve(),
        exit: () => Promise.resolve(),
        sync: () => undefined,
      },
      hud,
    );
    controller.subscribe((u) => {
      // Ablehnungen (blockiertes Fahrzeug, falsche Hupe) aendern nichts: Tipp und Hinweis bleiben stehen.
      if (u.kind === 'step' && changesNothing(u.events)) {
        void player.play(u.events, u.state);
        return;
      }
      clearHint();
      if (u.kind === 'new' || u.events.some((e) => e.type === 'stateRestored')) clearToast();
      if (u.kind === 'new') {
        nudgeAnnounced = false;
        hud?.cancelHonk();
        void player.reset(u.state);
        maybeShowIntro();
      } else {
        const played = player.play(u.events, u.state);
        if (u.events.some((e) => e.type === 'vehicleYielded')) void played.then(judgeHonk);
      }
      void refreshAdvice();
    });
    unbindKeys = bindKeyboard({
      moveFocus: hud.moveFocus,
      undo: () => controller.dispatch({ type: 'usePowerUp', powerUp: 'undo' }),
      restart: () => session.restart(),
      honk: () => hud?.toggleHonk(),
      cancel: () => hud?.cancelHonk() === true,
      isDialogOpen: () => hud?.isDialogOpen() === true || intro !== null,
    });
    controller.start();
    layer.remove();
    const shared = session.sharedInfo();
    if (shared && (shared.unchecked || shared.truncated)) {
      hud.announce(t('sharedUnchecked'));
      toast(t('sharedUnchecked'), NOTICE_MS);
    }
  };

  showLoading();
  session.onStatus((status) => {
    if (disposed) return;
    if (status === 'error') showError();
  });
  void (async () => {
    const [status] = await Promise.all([session.start(), loadFont()]);
    if (disposed) return;
    if (status === 'notFound') opts.back();
    else if (status === 'ready') await wire();
  })();

  return {
    dispose() {
      disposed = true;
      clearTimeout(hintTimer);
      clearTimeout(toastTimer);
      unbindKeys?.();
      intro?.close();
      session.dispose();
      shell.dispose();
      board?.dispose();
      pixi?.destroy();
      root.replaceChildren();
    },
  };
}
