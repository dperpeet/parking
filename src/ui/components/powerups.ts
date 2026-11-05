import type { GameState, PowerUpId } from '../../engine/types';
import { t } from '../../i18n';
import { h, icon } from '../dom';
import type { IconName } from '../dom';
import { powerUpLabel } from '../strings';

export interface PowerUpCallbacks {
  onPowerUp(id: PowerUpId): void;
  /** Hupe: schaltet den Zielmodus um (statt das Power-Up sofort zu nutzen). */
  onHonk(): void;
  onHint(): void;
  onRestart(): void;
}

export interface HintStatus {
  /** Verbleibende Tipps in diesem Level. */
  left: number;
  /** Eine Tipp-Berechnung laeuft. */
  busy: boolean;
}

export interface HonkStatus {
  /** Das Ruleset hat die Hupe aktiviert: nur dann gibt es den Knopf. */
  enabled: boolean;
  /** Hupe jetzt nutzbar (Zaehler, Spielstatus). */
  usable: boolean;
  /** Zielmodus ist an. */
  active: boolean;
}

export interface PowerUpView {
  update(state: GameState, hint: HintStatus, honk: HonkStatus): void;
  /** Hebt den Hupen-Knopf als Tipp hervor (data-hint, pulsiert, kleine Sprechblase). */
  setHonkHint(on: boolean): void;
}

const BUTTONS: Array<{ id: PowerUpId; icon: IconName }> = [
  { id: 'undo', icon: 'undo' },
  { id: 'shuffle', icon: 'shuffle' },
  { id: 'extraSlot', icon: 'plus' },
  { id: 'honk', icon: 'horn' },
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
    btn.addEventListener('click', () => (b.id === 'honk' ? cb.onHonk() : cb.onPowerUp(b.id)));
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
    setHonkHint(on) {
      const btn = buttons.get('honk');
      const bubble = btn?.querySelector('.hint-bubble');
      if (!on) {
        btn?.removeAttribute('data-hint');
        bubble?.remove();
        return;
      }
      btn?.setAttribute('data-hint', 'true');
      if (!bubble) {
        btn
          ?.querySelector('.pu-icon')
          ?.append(h('span', { class: 'hint-bubble', 'aria-hidden': 'true' }, t('honkBubble')));
      }
    },
    update(state, hint, honk) {
      for (const b of BUTTONS) {
        const left = state.powerUps[b.id];
        const btn = buttons.get(b.id);
        const badge = badges.get(b.id);
        if (!btn || !badge) continue;
        badge.textContent = String(left);
        if (b.id === 'honk') {
          btn.hidden = !honk.enabled;
          btn.disabled = !honk.usable;
          btn.setAttribute('aria-pressed', String(honk.active));
          btn.setAttribute('aria-label', t('puLeft', { label: powerUpLabel('honk'), n: left }));
          continue;
        }
        const noHistory = b.id !== 'shuffle' && b.id !== 'extraSlot' && state.history.length === 0;
        const over = state.status === 'won' || (state.status === 'lost' && b.id !== 'undo');
        btn.disabled = left <= 0 || over || noHistory;
        btn.setAttribute('aria-label', t('puLeft', { label: powerUpLabel(b.id), n: left }));
      }
      hintBadge.textContent = String(hint.left);
      // Auch in der Sackgasse (verloren durch noMoves, Hupe uebrig) gibt es noch einen Tipp.
      const canHint = state.status === 'playing' || (state.status === 'lost' && honk.usable);
      hintBtn.disabled = hint.left <= 0 || !canHint || hint.busy;
      hintBtn.setAttribute('aria-busy', String(hint.busy));
      hintBtn.setAttribute('aria-label', t('puLeft', { label: t('puHint'), n: hint.left }));
    },
  };
}
