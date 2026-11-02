import { t, tn } from '../../i18n';
import { h, icon } from '../dom';

export interface HeaderTitle {
  world: string;
  level: string;
}

export interface HeaderView {
  update(title: HeaderTitle, moves: number): void;
}

export function createHeader(parent: HTMLElement, onBack: () => void): HeaderView {
  const back = h('button', {
    type: 'button',
    class: 'btn-round',
    'aria-label': t('back'),
    'data-testid': 'back',
  });
  back.append(icon('back'));
  back.addEventListener('click', onBack);

  const world = h('div', { class: 'hdr-world' });
  const level = h('h1', { class: 'hdr-level' });
  const moves = h('div', { class: 'chip moves-chip', role: 'status' });
  const movesLabel = h('span', { class: 'chip-label' }, t('moves'));
  const movesValue = h('span', { class: 'chip-value' });
  moves.append(movesLabel, movesValue);

  parent.append(
    h(
      'header',
      { class: 'hud-header' },
      back,
      h('div', { class: 'hdr-title' }, world, level),
      moves,
    ),
  );
  return {
    update(title, n) {
      world.textContent = title.world;
      level.textContent = title.level;
      movesValue.textContent = String(n);
      moves.setAttribute('aria-label', tn('movesAria', n));
    },
  };
}
