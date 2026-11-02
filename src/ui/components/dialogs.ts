import type { GameState } from '../../engine/types';
import { t, tn } from '../../i18n';
import { h, starIcon } from '../dom';
import { loseTitle, starsLabel } from '../strings';

export interface DialogInfo {
  /** Anzuzeigende Sterne (Engine-Sterne, ggf. durch Tipp-Nutzung begrenzt). */
  stars: number;
  nextLabel: string;
  showSimilar: boolean;
  /** Nur im Endlos-Modus: Run-Ergebnis, ersetzt den Niederlage-Dialog. */
  endless: { score: number; record: boolean } | null;
}

export type MaybeAsync = void | Promise<void>;

export interface DialogCallbacks {
  onNext(): MaybeAsync;
  onAgain(): MaybeAsync;
  onSimilar(): MaybeAsync;
  onUndo(): void;
  onMenu(): void;
  info(state: GameState): DialogInfo;
}

export interface DialogView {
  /** Zeigt oder schliesst den Dialog passend zum Spielstatus. */
  update(state: GameState): void;
  isOpen(): boolean;
}

export function createDialogs(
  layer: HTMLElement,
  gameArea: HTMLElement,
  cb: DialogCallbacks,
): DialogView {
  let shownKey: string | null = null;

  const close = (): void => {
    layer.replaceChildren();
    gameArea.inert = false;
    shownKey = null;
  };

  const open = (key: string, dialog: HTMLElement, focusSelector: string): void => {
    layer.replaceChildren(
      h('div', { class: 'overlay' }, h('div', { class: 'overlay-inner' }, dialog)),
    );
    gameArea.inert = true;
    shownKey = key;
    dialog.querySelector<HTMLElement>(focusSelector)?.focus();
  };

  /** Knopf; bei asynchroner Aktion (Generator) zeigt er einen Spinner und sperrt den Dialog. */
  const button = (
    label: string,
    cls: string,
    testid: string,
    onClick: () => MaybeAsync,
  ): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: `btn ${cls}`, 'data-testid': testid }, label);
    b.addEventListener('click', () => {
      const result = onClick();
      if (!(result instanceof Promise)) return;
      const dialog = b.closest('.dialog');
      const all = [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const before = all.map((x) => x.disabled);
      all.forEach((x) => (x.disabled = true));
      b.classList.add('is-busy');
      b.setAttribute('aria-busy', 'true');
      b.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('generating'));
      const done = (): void => {
        if (!b.isConnected) return;
        all.forEach((x, i) => (x.disabled = before[i] ?? false));
        b.classList.remove('is-busy');
        b.removeAttribute('aria-busy');
        b.textContent = label;
      };
      result.then(done, done);
    });
    return b;
  };

  return {
    isOpen: () => shownKey !== null,
    update(state) {
      if (state.status === 'playing') {
        if (shownKey !== null) close();
        return;
      }
      const key = `${state.levelId}:${state.status}:${state.moves}`;
      if (key === shownKey) return;
      const info = cb.info(state);
      if (state.status === 'won') {
        const stars = h('div', {
          class: 'stars',
          role: 'img',
          'aria-label': starsLabel(info.stars),
        });
        for (let i = 0; i < 3; i++) stars.append(starIcon(i < info.stars));
        const row = [button(t('again'), 'btn-secondary', 'dlg-again', cb.onAgain)];
        if (info.showSimilar) {
          row.push(button(t('similar'), 'btn-secondary', 'dlg-similar', cb.onSimilar));
        }
        const dialog = h(
          'div',
          {
            class: 'dialog dialog-win',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'dlg-title',
            'data-testid': 'win-dialog',
          },
          stars,
          h('h2', { id: 'dlg-title', class: 'dlg-title' }, t('winTitle')),
          h('p', { class: 'dlg-sub' }, tn('winSub', state.moves)),
          button(info.nextLabel, 'btn-primary', 'dlg-next', cb.onNext),
          h('div', { class: 'dlg-row' }, ...row),
          // Der Header-Pfeil liegt unter dem Dialog; deshalb gibt es hier einen eigenen Weg zurueck.
          info.nextLabel === t('toMenu')
            ? null
            : button(t('toMenu'), 'btn-link', 'dlg-menu', cb.onMenu),
        );
        open(key, dialog, '.btn-primary');
      } else if (info.endless) {
        const dialog = h(
          'div',
          {
            class: 'dialog dialog-lose dialog-endless',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'dlg-title',
            'data-testid': 'endless-dialog',
          },
          h('h2', { id: 'dlg-title', class: 'dlg-title' }, t('endlessOver')),
          h('p', { class: 'dlg-sub' }, loseTitle(state.loseReason ?? 'queueFull')),
          h('p', { class: 'dlg-score' }, tn('endlessScore', info.endless.score)),
          info.endless.record ? h('p', { class: 'dlg-record' }, t('endlessRecord')) : null,
          button(t('endlessNewRun'), 'btn-primary', 'dlg-again', cb.onAgain),
          button(t('toMenu'), 'btn-secondary', 'dlg-menu', cb.onMenu),
        );
        open(key, dialog, '.btn-primary');
      } else {
        const reason = state.loseReason ?? 'queueFull';
        const undo = button(t('loseUndo'), 'btn-primary', 'dlg-undo', cb.onUndo);
        undo.disabled = state.powerUps.undo <= 0 || state.history.length === 0;
        const dialog = h(
          'div',
          {
            class: 'dialog dialog-lose',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'dlg-title',
            'data-testid': 'lose-dialog',
          },
          h('h2', { id: 'dlg-title', class: 'dlg-title' }, loseTitle(reason)),
          h(
            'div',
            { class: 'dlg-row' },
            undo,
            button(t('again'), 'btn-secondary', 'dlg-again', cb.onAgain),
          ),
        );
        open(key, dialog, undo.disabled ? '.btn-secondary' : '.btn-primary');
      }
    },
  };
}
