import type { GameState, PowerUpId } from '../../engine/types';
import { t } from '../../i18n';
import { h, icon } from '../dom';
import type { IconName } from '../dom';
import { powerUpLabel } from '../strings';

export interface PowerUpCallbacks {
  onPowerUp(id: PowerUpId): void;
  onHint(): void;
  onRestart(): void;
}

export interface HintStatus {
  /** Verbleibende Tipps in diesem Level. */
  left: number;
  /** Eine Tipp-Berechnung laeuft. */
  busy: boolean;
}

export interface PowerUpView {
  update(state: GameState, hint: HintStatus): void;
}

const BUTTONS: Array<{ id: PowerUpId; icon: IconName }> = [
  { id: 'undo', icon: 'undo' },
  { id: 'shuffle', icon: 'shuffle' },
  { id: 'extraSlot', icon: 'plus' },
];

export function createPowerUps(parent: HTMLElement, cb: PowerUpCallbacks): PowerUpView {
  const nav = h('nav', { class: 'powerups', 'aria-label': t('powerUps') });
  const badges = new Map<PowerUpId, HTMLElement>();
  const buttons = new Map<PowerUpId, HTMLButtonElement>();

  const makeButton = (
    testid: string,
    iconName: IconName,
    label: string,
    badge: HTMLElement,
  ): HTMLButtonElement =>
    h(
      'button',
      { type: 'button', class: 'pu-btn', 'data-testid': testid },
      h('span', { class: 'pu-icon' }, icon(iconName), badge),
      h('span', { class: 'pu-label' }, label),
    );

  for (const b of BUTTONS) {
    const badge = h('span', { class: 'badge', 'aria-hidden': 'true' });
    const btn = makeButton(`powerup-${b.id}`, b.icon, powerUpLabel(b.id), badge);
    btn.addEventListener('click', () => cb.onPowerUp(b.id));
    badges.set(b.id, badge);
    buttons.set(b.id, btn);
    nav.append(btn);
  }

  const hintBadge = h('span', { class: 'badge', 'aria-hidden': 'true' });
  const hintBtn = makeButton('hint', 'bulb', t('puHint'), hintBadge);
  hintBtn.addEventListener('click', () => cb.onHint());
  nav.append(hintBtn);

  const restart = makeButton('restart', 'restart', t('restart'), h('span'));
  restart.addEventListener('click', () => cb.onRestart());
  nav.append(restart);
  parent.append(nav);

  return {
    update(state, hint) {
      for (const b of BUTTONS) {
        const left = state.powerUps[b.id];
        const btn = buttons.get(b.id);
        const badge = badges.get(b.id);
        if (!btn || !badge) continue;
        badge.textContent = String(left);
        const noHistory = b.id !== 'shuffle' && b.id !== 'extraSlot' && state.history.length === 0;
        const over = state.status === 'won' || (state.status === 'lost' && b.id !== 'undo');
        btn.disabled = left <= 0 || over || noHistory;
        btn.setAttribute('aria-label', t('puLeft', { label: powerUpLabel(b.id), n: left }));
      }
      hintBadge.textContent = String(hint.left);
      hintBtn.disabled = hint.left <= 0 || state.status !== 'playing' || hint.busy;
      hintBtn.setAttribute('aria-busy', String(hint.busy));
      hintBtn.setAttribute('aria-label', t('puLeft', { label: t('puHint'), n: hint.left }));
    },
  };
}
