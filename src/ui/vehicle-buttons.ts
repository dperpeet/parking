// Transparente, echte <button>-Elemente ueber den Fahrzeugen im Pixi-Canvas: Tippen, Tastatur, Screenreader.
import type { GameState } from '../engine/types';
import { computeBoardLayout, vehicleRect } from '../render/layout';
import { computeLockMarks } from '../render/lock-marks';
import { h, icon } from './dom';
import { vehicleLabel } from './strings';

export interface VehicleButtons {
  update(state: GameState): void;
  /** Fokus per Pfeiltaste in Richtung (dx,dy) verschieben. */
  moveFocus(dx: number, dy: number): void;
  /** Markiert ein Fahrzeug als Tipp (data-hint); null entfernt die Markierung. Bei `honk` traegt es eine Hupen-Blase. */
  setHint(vehicleId: string | null, action?: 'tap' | 'honk'): void;
  /** Zielmodus: markiert gueltige Hupen-Ziele (data-honk-target yes/no); null entfernt die Markierung. */
  setHonkTargets(ids: ReadonlySet<string> | null): void;
}

export function createVehicleButtons(
  layer: HTMLElement,
  onTap: (vehicleId: string) => void,
): VehicleButtons {
  const buttons = new Map<string, HTMLButtonElement>();
  let lastLevel = '';
  let targets: ReadonlySet<string> | null = null;

  const markTarget = (id: string, btn: HTMLElement): void => {
    if (targets === null) btn.removeAttribute('data-honk-target');
    else btn.setAttribute('data-honk-target', targets.has(id) ? 'yes' : 'no');
  };

  const center = (b: HTMLElement): [number, number] => [
    b.offsetLeft + b.offsetWidth / 2,
    b.offsetTop + b.offsetHeight / 2,
  ];

  const nearestTo = (x: number, y: number): HTMLButtonElement | undefined => {
    let best: HTMLButtonElement | undefined;
    let bestD = Infinity;
    for (const b of buttons.values()) {
      const [cx, cy] = center(b);
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  };

  return {
    setHonkTargets(ids) {
      targets = ids;
      for (const [id, btn] of buttons) markTarget(id, btn);
    },
    setHint(vehicleId, action = 'tap') {
      for (const [id, btn] of buttons) {
        btn.querySelector('.hint-bubble')?.remove();
        if (id !== vehicleId) {
          btn.removeAttribute('data-hint');
          continue;
        }
        btn.setAttribute('data-hint', action === 'honk' ? 'honk' : 'true');
        if (action === 'honk') {
          btn.append(h('span', { class: 'hint-bubble', 'aria-hidden': 'true' }, icon('horn')));
        }
      }
    },
    update(state) {
      if (state.levelId !== lastLevel) {
        layer.replaceChildren();
        buttons.clear();
        lastLevel = state.levelId;
      }
      const layout = computeBoardLayout(
        state.grid.width,
        state.grid.height,
        layer.clientWidth,
        layer.clientHeight,
      );
      const marks = computeLockMarks(state.vehicles);
      const active = document.activeElement;
      let lostFocusAt: [number, number] | null = null;
      for (const [id, btn] of buttons) {
        const v = state.vehicles.find((o) => o.id === id);
        if (!v || v.status !== 'parked') {
          if (btn === active) lostFocusAt = center(btn);
          btn.remove();
          buttons.delete(id);
        }
      }
      for (const v of state.vehicles) {
        if (v.status !== 'parked') continue;
        let btn = buttons.get(v.id);
        if (!btn) {
          btn = h('button', {
            type: 'button',
            class: 'vehicle-btn',
            'data-testid': `vehicle-${v.id}`,
            'data-vehicle': v.id,
          });
          const id = v.id;
          btn.addEventListener('click', () => onTap(id));
          buttons.set(v.id, btn);
          layer.append(btn);
        }
        markTarget(v.id, btn);
        // Mystery-Fahrzeug: nur "verdeckt" markieren, die Farbe steht nie im DOM.
        if (v.hidden) btn.setAttribute('data-hidden', 'true');
        else btn.removeAttribute('data-hidden');
        const r = vehicleRect(layout, v);
        btn.style.left = `${r.x}px`;
        btn.style.top = `${r.y}px`;
        btn.style.width = `${r.w}px`;
        btn.style.height = `${r.h}px`;
        btn.setAttribute(
          'aria-label',
          vehicleLabel(v, { mark: marks.of(v.id), count: marks.count }),
        );
      }
      if (lostFocusAt) nearestTo(lostFocusAt[0], lostFocusAt[1])?.focus();
    },
    moveFocus(dx, dy) {
      const active = document.activeElement;
      const current = active instanceof HTMLButtonElement && layer.contains(active) ? active : null;
      if (!current) {
        const first = [...buttons.values()].sort(
          (a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft,
        )[0];
        first?.focus();
        return;
      }
      const [cx, cy] = center(current);
      let best: HTMLButtonElement | undefined;
      let bestScore = Infinity;
      for (const b of buttons.values()) {
        if (b === current) continue;
        const [x, y] = center(b);
        const along = (x - cx) * dx + (y - cy) * dy;
        if (along <= 0) continue;
        const across = Math.abs((x - cx) * dy) + Math.abs((y - cy) * dx);
        const score = along + 2 * across;
        if (score < bestScore) {
          bestScore = score;
          best = b;
        }
      }
      best?.focus();
    },
  };
}
