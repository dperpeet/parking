import { t } from '../i18n';
import { h } from './dom';

export const DESIGN_WIDTH = 390;
export const DESIGN_HEIGHT = 844;
/** Maximale Vergroesserung des 390x844-Layouts auf grossen Bildschirmen. */
const MAX_SCALE = 1.6;

export interface Shell {
  wrap: HTMLElement;
  stage: HTMLElement;
  game: HTMLElement;
  header: HTMLElement;
  passengers: HTMLElement;
  queue: HTMLElement;
  boardWrap: HTMLElement;
  boardHost: HTMLElement;
  vehicleLayer: HTMLElement;
  powerUps: HTMLElement;
  dialogLayer: HTMLElement;
  live: HTMLElement;
  /** Skaliert die Buehne auf das Fenster und ruft danach die Listener. */
  onFit(cb: () => void): void;
  /** Entfernt globale Listener (Resize). */
  dispose(): void;
}

export function mountShell(root: HTMLElement): Shell {
  const header = h('div', { class: 'slot-header' });
  const passengers = h('div', { class: 'slot-pax' });
  const queue = h('div', { class: 'slot-queue' });
  const boardHost = h('div', { class: 'board-host' });
  const vehicleLayer = h('div', {
    class: 'vehicle-layer',
    role: 'group',
    'aria-label': t('vehicles'),
  });
  const boardWrap = h(
    'section',
    { class: 'board-wrap', 'aria-label': t('board') },
    boardHost,
    vehicleLayer,
  );
  const powerUps = h('div', { class: 'slot-powerups' });
  const game = h('main', { class: 'game' }, header, passengers, queue, boardWrap, powerUps);
  const dialogLayer = h('div', { class: 'dialog-layer' });
  const live = h('div', {
    class: 'sr-only',
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'live',
  });
  const stage = h('div', { class: 'stage' }, game, live);
  // Die Dialogebene liegt ausserhalb der skalierten Buehne und deckt so das ganze Fenster ab (auch den Letterbox-Rand).
  const wrap = h('div', { class: 'stage-wrap' }, stage, dialogLayer);
  root.replaceChildren(wrap);

  const listeners: Array<() => void> = [];
  const fit = (): void => {
    const scale = Math.min(
      MAX_SCALE,
      window.innerWidth / DESIGN_WIDTH,
      window.innerHeight / DESIGN_HEIGHT,
    );
    stage.style.transform = `scale(${scale})`;
    wrap.style.setProperty('--stage-scale', String(scale));
    listeners.forEach((cb) => cb());
  };
  window.addEventListener('resize', fit);
  fit();

  return {
    wrap,
    stage,
    game,
    header,
    passengers,
    queue,
    boardWrap,
    boardHost,
    vehicleLayer,
    powerUps,
    dialogLayer,
    live,
    onFit: (cb) => listeners.push(cb),
    dispose: () => window.removeEventListener('resize', fit),
  };
}
