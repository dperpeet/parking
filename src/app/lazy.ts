// Nachladen von Code-Chunks (Spielfeld samt PixiJS): Cache, Vorladen im Leerlauf, Ladeanzeige und Fehlerfall.
import { t } from '../i18n';

export interface LazyModule<T> {
  /** Laedt das Modul (einmal); nach einem Fehler versucht der naechste Aufruf es erneut. */
  load(): Promise<T>;
  /** Wie `load`, aber ohne Ergebnis und ohne Fehler (Vorladen). */
  prefetch(): void;
}

export function lazyModule<T>(importer: () => Promise<T>): LazyModule<T> {
  let pending: Promise<T> | null = null;
  const load = (): Promise<T> => {
    pending ??= importer().catch((err: unknown) => {
      pending = null;
      throw err;
    });
    return pending;
  };
  return {
    load,
    prefetch: () => {
      load().catch(() => {
        // Vorladen ist optional; der echte Levelstart zeigt den Fehler.
      });
    },
  };
}

/** Teil von `window`, den `whenIdle` braucht (requestIdleCallback fehlt z. B. in Safari). */
export interface IdleHost {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout(cb: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

/** Ersatzverzoegerung ohne requestIdleCallback. */
const IDLE_FALLBACK_MS = 1000;
/** Spaetestens dann wird auch ohne Leerlauf gestartet. */
const IDLE_TIMEOUT_MS = 3000;

/** Ruft `fn` auf, sobald der Browser Leerlauf hat. Liefert eine Abbruchfunktion. */
export function whenIdle(host: IdleHost, fn: () => void): () => void {
  if (host.requestIdleCallback && host.cancelIdleCallback) {
    const cancel = host.cancelIdleCallback.bind(host);
    const handle = host.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
    return () => cancel(handle);
  }
  const handle = host.setTimeout(fn, IDLE_FALLBACK_MS);
  return () => host.clearTimeout(handle);
}

export interface ChunkPendingOptions {
  /** Erst nach dieser Zeit erscheinen Spinner und Text (kein Flackern bei schnellem Laden). */
  delayMs: number;
  retry(): void;
  back(): void;
}

export interface ChunkPending {
  /** Zeigt Fehlermeldung mit "Erneut versuchen" und "Zum Menue". */
  fail(): void;
  dispose(): void;
}

function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `btn ${cls}`;
  node.textContent = text;
  node.addEventListener('click', onClick);
  return node;
}

/**
 * Platzhalter, solange ein Chunk laedt: sofort eine leere Flaeche, nach `delayMs` Spinner und
 * Statusmeldung (role=status). Bei Fehler Meldung und Knoepfe; der Fokus geht auf "Erneut versuchen".
 */
export function mountChunkPending(root: HTMLElement, opts: ChunkPendingOptions): ChunkPending {
  const layer = document.createElement('div');
  layer.className = 'loading-layer';
  layer.setAttribute('data-testid', 'chunk-loading');
  layer.setAttribute('role', 'status');
  root.replaceChildren(layer);
  const timer = setTimeout(() => {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    layer.replaceChildren(spinner, t('loading'));
  }, opts.delayMs);

  return {
    fail() {
      clearTimeout(timer);
      layer.removeAttribute('role');
      layer.setAttribute('data-testid', 'chunk-error');
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = t('gameLoadFailed');
      const retry = button('btn-primary', t('retry'), opts.retry);
      retry.setAttribute('data-testid', 'retry');
      layer.replaceChildren(message, retry, button('btn-secondary', t('toMenu'), opts.back));
      retry.focus();
    },
    dispose() {
      clearTimeout(timer);
      layer.remove();
    },
  };
}
