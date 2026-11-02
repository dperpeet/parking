import { PALETTE } from '../../render/theme';
import type { GameState } from '../../engine/types';
import { h } from '../dom';
import { colorName, de } from '../strings';

/** Darstellungsgrenze der Fahrgast-Kreise (Layoutbreite), unabhaengig von passengers.visible. */
const MAX_CHIPS = 6;

export interface PassengerView {
  update(state: GameState, visible: number): void;
}

export function createPassengers(parent: HTMLElement): PassengerView {
  const row = h('div', { class: 'pax-row' });
  const count = h('div', { class: 'pax-count' });
  const panel = h(
    'section',
    { class: 'panel pax-panel', 'aria-label': de.nextPassengers },
    row,
    count,
  );
  parent.append(panel);

  return {
    update(state, visible) {
      const remaining = state.passengers.length - state.passengerIndex;
      const shown = Math.min(remaining, visible, MAX_CHIPS);
      row.replaceChildren();
      for (let i = 0; i < shown; i++) {
        const color = state.passengers[state.passengerIndex + i] ?? '';
        const style = PALETTE[color];
        const chip = h(
          'span',
          {
            class: i === 0 ? 'pax pax-first' : 'pax',
            style: style ? `background:${style.fill};color:${style.ink}` : undefined,
            title: colorName(color),
          },
          style?.glyph ?? '?',
        );
        row.append(chip);
      }
      if (remaining > shown) row.append(h('span', { class: 'pax-more' }, `+${remaining - shown}`));
      count.textContent = de.waiting(remaining);
    },
  };
}
