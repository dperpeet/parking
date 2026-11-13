// Unsichtbare Beschreibung der Abbiegepfeile fuer Screenreader (das Pixi-Brett selbst ist stumm).
import type { GameState } from '../engine/types';
import { h } from './dom';
import { oneWayNote } from './strings';

export interface ArrowNote {
  update(state: GameState): void;
}

const NOTE_ID = 'board-arrows';

/** Haengt die Beschreibung an `host` (Spielfeld) und verknuepft sie per aria-describedby; ohne Pfeile nichts. */
export function createArrowNote(host: HTMLElement): ArrowNote {
  let note: HTMLElement | null = null;
  let shown: string | null = null;
  return {
    update(state) {
      const text = oneWayNote(state.grid.cells);
      if (text === shown) return;
      shown = text;
      if (text === null) {
        note?.remove();
        note = null;
        host.removeAttribute('aria-describedby');
        return;
      }
      if (!note) {
        note = h('p', { id: NOTE_ID, class: 'sr-only', 'data-testid': 'arrow-note' });
        host.append(note);
      }
      note.textContent = text;
      host.setAttribute('aria-describedby', NOTE_ID);
    },
  };
}
