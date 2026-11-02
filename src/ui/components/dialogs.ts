import type { GameState } from '../../engine/types';
import { h, starIcon } from '../dom';
import { de } from '../strings';

export interface DialogCallbacks {
  onNext(): void;
  onAgain(): void;
  onSimilar(): void;
  onUndo(): void;
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
    layer.replaceChildren(h('div', { class: 'overlay' }, dialog));
    gameArea.inert = true;
    shownKey = key;
    dialog.querySelector<HTMLElement>(focusSelector)?.focus();
  };

  const button = (label: string, cls: string, testid: string, onClick: () => void): HTMLElement => {
    const b = h('button', { type: 'button', class: `btn ${cls}`, 'data-testid': testid }, label);
    b.addEventListener('click', onClick);
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
      if (state.status === 'won') {
        const stars = h('div', {
          class: 'stars',
          role: 'img',
          'aria-label': de.stars(state.stars),
        });
        for (let i = 0; i < 3; i++) stars.append(starIcon(i < state.stars));
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
          h('h2', { id: 'dlg-title', class: 'dlg-title' }, de.winTitle),
          h('p', { class: 'dlg-sub' }, de.winSub(state.moves)),
          button(de.next, 'btn-primary', 'dlg-next', cb.onNext),
          h(
            'div',
            { class: 'dlg-row' },
            button(de.again, 'btn-secondary', 'dlg-again', cb.onAgain),
            button(de.similar, 'btn-secondary', 'dlg-similar', cb.onSimilar),
          ),
        );
        open(key, dialog, '.btn-primary');
      } else {
        const reason = state.loseReason ?? 'queueFull';
        const undo = button(de.loseUndo, 'btn-primary', 'dlg-undo', cb.onUndo) as HTMLButtonElement;
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
          h('h2', { id: 'dlg-title', class: 'dlg-title' }, de.loseTitle[reason]),
          h(
            'div',
            { class: 'dlg-row' },
            undo,
            button(de.again, 'btn-secondary', 'dlg-again', cb.onAgain),
          ),
        );
        open(key, dialog, undo.disabled ? '.btn-secondary' : '.btn-primary');
      }
    },
  };
}
