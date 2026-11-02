import { h, icon } from '../dom';
import { de, worldLabel } from '../strings';

export interface HeaderView {
  update(levelId: string, moves: number): void;
}

export function createHeader(parent: HTMLElement, onBack: () => void): HeaderView {
  const back = h('button', { type: 'button', class: 'btn-round', 'aria-label': de.back });
  back.append(icon('back'));
  back.disabled = true; // Menue folgt in einem spaeteren Meilenstein
  back.addEventListener('click', onBack);

  const world = h('div', { class: 'hdr-world' });
  const level = h('h1', { class: 'hdr-level' });
  const moves = h('div', { class: 'chip moves-chip', role: 'status' });
  const movesLabel = h('span', { class: 'chip-label' }, de.moves);
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
    update(levelId, n) {
      const l = worldLabel(levelId);
      world.textContent = l.world;
      level.textContent = l.level;
      movesValue.textContent = String(n);
      moves.setAttribute('aria-label', de.movesAria(n));
    },
  };
}
