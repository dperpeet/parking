// Spielbildschirm: Shell + HUD + Pixi-Brett, verbunden mit einer GameSession.
import { t } from '../i18n';
import type { StringKey } from '../i18n';
import { BoardView, EventPlayer, createPixiApp } from '../render';
import type { PixiHandle } from '../render';
import { THEME } from '../render/theme';
import { bindKeyboard, createHud, mountShell } from '../ui';
import type { Hud } from '../ui';
import { hintAnnouncement } from '../ui/strings';
import { HINT_DISPLAY_MS } from './hints';
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
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

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
    shell.stage.querySelector('.toast')?.remove();
    const node = el('div', 'toast panel', text);
    shell.stage.append(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), ms);
  };

  const clearHint = (): void => {
    clearTimeout(hintTimer);
    hud?.setHint(null);
    board?.highlight(null);
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
        const text = hintAnnouncement(color);
        hud.announce(text);
        toast(text);
        hud.setHint(result.vehicleId);
        board?.highlight(result.vehicleId, HINT_DISPLAY_MS);
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => hud?.setHint(null), HINT_DISPLAY_MS);
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

  const wire = async (): Promise<void> => {
    const { controller } = session;
    hud = createHud(shell, () => controller.getRules(), {
      dispatch: (a) => controller.dispatch(a),
      restart: () => session.restart(),
      again: () => session.again(),
      next: () => session.next(),
      similar: () => session.similar(),
      hint: () => void onHint(),
      back: opts.back,
      info: (state) => ({
        title: session.title(),
        dialog: session.dialogInfo(state),
        hint: { left: session.hints.left(), busy: session.hints.busy() },
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
      clearHint();
      if (u.kind === 'new') void player.reset(u.state);
      else void player.play(u.events, u.state);
    });
    unbindKeys = bindKeyboard({
      moveFocus: hud.moveFocus,
      undo: () => controller.dispatch({ type: 'usePowerUp', powerUp: 'undo' }),
      restart: () => session.restart(),
      isDialogOpen: hud.isDialogOpen,
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
      session.dispose();
      shell.dispose();
      pixi?.destroy();
      root.replaceChildren();
    },
  };
}
