// Sackgasse als Hilfe-Moment: nicht-modale Karte statt Verlust-Dialog. Sie nutzt die freie Flaeche ueber (Titel)
// und unter dem Brett (Knoepfe); das Brett wird dafuer nicht skaliert und verdeckt nichts.
import type { GameState } from '../../engine/types';
import { t } from '../../i18n';
import { h, icon } from '../dom';

export interface StuckCardCallbacks {
  onHonk(): void;
  onUndo(): void;
  onAgain(): void;
}

export interface StuckCard {
  /** Zeigt oder versteckt die Karte; beim Erscheinen bekommt der Hupen-Knopf den Fokus. */
  update(state: GameState, visible: boolean): void;
  isVisible(): boolean;
}

/** `parent`: der Brett-Rahmen; Titel und Knopfreihe haengen ueber bzw. unter dem Brett. */
export function createStuckCard(parent: HTMLElement, cb: StuckCardCallbacks): StuckCard {
  let card: HTMLElement | null = null;

  const small = (label: string, testid: string, onClick: () => void): HTMLButtonElement => {
    const b = h(
      'button',
      { type: 'button', class: 'btn btn-secondary btn-small', 'data-testid': testid },
      label,
    );
    b.addEventListener('click', onClick);
    return b;
  };

  const build = (): HTMLElement => {
    const honk = h(
      'button',
      { type: 'button', class: 'btn btn-primary stuck-honk', 'data-testid': 'stuck-honk' },
      icon('horn'),
      t('loseHonk'),
    );
    honk.addEventListener('click', cb.onHonk);
    return h(
      'div',
      {
        class: 'stuck-card',
        role: 'region',
        'aria-labelledby': 'stuck-title',
        'data-testid': 'stuck-card',
      },
      h(
        'div',
        { class: 'stuck-text panel' },
        h('h2', { id: 'stuck-title', class: 'stuck-title' }, t('stuckTitle')),
        h('p', { class: 'stuck-sub' }, t('stuckText')),
      ),
      h(
        'div',
        { class: 'stuck-row' },
        honk,
        small(t('loseUndo'), 'stuck-undo', cb.onUndo),
        small(t('again'), 'stuck-again', cb.onAgain),
      ),
    );
  };

  return {
    isVisible: () => card !== null,
    update(state, visible) {
      if (!visible) {
        card?.remove();
        card = null;
        return;
      }
      if (!card) {
        card = build();
        parent.append(card);
        card.querySelector<HTMLElement>('.stuck-honk')?.focus();
      }
      const undo = card.querySelector<HTMLButtonElement>('[data-testid="stuck-undo"]');
      if (undo) undo.disabled = state.powerUps.undo <= 0 || state.history.length === 0;
    },
  };
}
