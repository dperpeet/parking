import type { GameState, PowerUpId } from '../../engine/types';
import { h, icon } from '../dom';
import type { IconName } from '../dom';
import { de } from '../strings';

export interface PowerUpCallbacks {
  onPowerUp(id: PowerUpId): void;
  onRestart(): void;
}

export interface PowerUpView {
  update(state: GameState): void;
}

const BUTTONS: Array<{ id: PowerUpId; icon: IconName }> = [
  { id: 'undo', icon: 'undo' },
  { id: 'shuffle', icon: 'shuffle' },
  { id: 'extraSlot', icon: 'plus' },
];

export function createPowerUps(parent: HTMLElement, cb: PowerUpCallbacks): PowerUpView {
  const nav = h('nav', { class: 'powerups', 'aria-label': de.powerUps });
  const badges = new Map<PowerUpId, HTMLElement>();
  const buttons = new Map<PowerUpId, HTMLButtonElement>();

  for (const b of BUTTONS) {
    const badge = h('span', { class: 'badge', 'aria-hidden': 'true' });
    const btn = h(
      'button',
      { type: 'button', class: 'pu-btn', 'data-testid': `powerup-${b.id}` },
      h('span', { class: 'pu-icon' }, icon(b.icon), badge),
      h('span', { class: 'pu-label' }, de.powerUpLabel[b.id]),
    );
    btn.addEventListener('click', () => cb.onPowerUp(b.id));
    badges.set(b.id, badge);
    buttons.set(b.id, btn);
    nav.append(btn);
  }
  const restart = h(
    'button',
    { type: 'button', class: 'pu-btn', 'data-testid': 'restart' },
    h('span', { class: 'pu-icon' }, icon('restart')),
    h('span', { class: 'pu-label' }, de.restart),
  );
  restart.addEventListener('click', () => cb.onRestart());
  nav.append(restart);
  parent.append(nav);

  return {
    update(state) {
      for (const b of BUTTONS) {
        const left = state.powerUps[b.id];
        const btn = buttons.get(b.id);
        const badge = badges.get(b.id);
        if (!btn || !badge) continue;
        badge.textContent = String(left);
        const noHistory = b.id !== 'shuffle' && b.id !== 'extraSlot' && state.history.length === 0;
        const over = state.status === 'won' || (state.status === 'lost' && b.id !== 'undo');
        btn.disabled = left <= 0 || over || noHistory;
        btn.setAttribute('aria-label', `${de.powerUpLabel[b.id]}, ${left} übrig`);
      }
    },
  };
}
