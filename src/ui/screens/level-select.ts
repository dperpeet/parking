// Levelauswahl: Tageslevel, Endlos, "Stufe halten" und das Level-Raster der Welt.
import { t, tn } from '../../i18n';
import { h, icon, starIcon } from '../dom';

export type TileState = 'locked' | 'open' | 'done';

export interface TileModel {
  key: string;
  number: number;
  state: TileState;
  stars: number;
}

export interface LevelSelectModel {
  dailyDate: string;
  dailyDone: boolean;
  streak: number;
  endlessBest: number;
  holdEnabled: boolean;
  holdStage: number;
  /** Hoechste erreichte Stufe; hoehere Stufen sind gesperrt. */
  reachedStage: number;
  stageCount: number;
  worldTitle: string;
  starsEarned: number;
  starsTotal: number;
  tiles: TileModel[];
  /** false: Speicher nicht verfuegbar, Hinweis anzeigen. */
  persistent: boolean;
}

export interface LevelSelectHandlers {
  onLevel(key: string): void;
  onDaily(): void;
  onEndless(): void;
  onSettings(): void;
  onHold(enabled: boolean): void;
  onHoldStage(stage: number): void;
}

export interface LevelSelectView {
  el: HTMLElement;
  update(model: LevelSelectModel): void;
}

/** Spalten des Level-Rasters. */
export const TILE_COLUMNS = 5;

export function createLevelSelect(handlers: LevelSelectHandlers): LevelSelectView {
  const inner = h('div', { class: 'select-inner' });
  const el = h('main', { class: 'screen select', 'data-testid': 'level-select' }, inner);
  let noticeDismissed = false;

  const button = (
    cls: string,
    fid: string,
    onClick: () => void,
    ...children: Array<Node | string>
  ): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: cls, 'data-fid': fid }, ...children);
    b.addEventListener('click', onClick);
    return b;
  };

  const header = (): HTMLElement => {
    const settings = button('btn-round', 'settings', handlers.onSettings, icon('gear'));
    settings.setAttribute('aria-label', t('settings'));
    settings.setAttribute('data-testid', 'settings');
    return h(
      'header',
      { class: 'sel-head' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, 'P'),
      h('h1', { class: 'sel-title' }, t('appName')),
      settings,
    );
  };

  const modeCards = (m: LevelSelectModel): HTMLElement => {
    const daily = button(
      'card card-mode card-daily',
      'daily',
      handlers.onDaily,
      h('span', { class: 'card-title' }, t('dailyTitle')),
      h('span', { class: 'card-sub' }, m.dailyDate),
      h('span', { class: 'card-meta' }, m.dailyDone ? t('dailyDone') : tn('dailyStreak', m.streak)),
    );
    daily.setAttribute('data-testid', 'card-daily');
    const endless = button(
      'card card-mode card-endless',
      'endless',
      handlers.onEndless,
      h('span', { class: 'card-title' }, t('endlessTitle')),
      h(
        'span',
        { class: 'card-sub' },
        m.holdEnabled ? t('stageLabel', { n: m.holdStage }) : t('endlessRising'),
      ),
      h('span', { class: 'card-meta' }, t('endlessRecordLine', { n: m.endlessBest })),
    );
    endless.setAttribute('data-testid', 'card-endless');
    return h('div', { class: 'sel-modes' }, daily, endless);
  };

  const holdCard = (m: LevelSelectModel): HTMLElement => {
    const sw = button('switch', 'hold-switch', () => handlers.onHold(!m.holdEnabled));
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(m.holdEnabled));
    sw.setAttribute('aria-labelledby', 'hold-title');
    sw.setAttribute('data-testid', 'hold-switch');
    sw.append(h('span', { class: 'switch-knob' }));
    const card = h(
      'section',
      { class: 'card card-hold' },
      h(
        'div',
        { class: 'hold-row' },
        h('h2', { id: 'hold-title', class: 'card-title' }, t('holdTitle')),
        sw,
      ),
    );
    if (m.holdEnabled) {
      const stages = h('div', { class: 'stage-row', role: 'group', 'aria-label': t('holdStages') });
      for (let n = 1; n <= m.stageCount; n++) {
        const b = button('stage-btn', `stage-${n}`, () => handlers.onHoldStage(n), String(n));
        b.setAttribute('aria-pressed', String(n === m.holdStage));
        b.setAttribute('data-testid', `stage-${n}`);
        b.setAttribute('aria-label', t('stageLabel', { n }));
        b.disabled = n > m.reachedStage;
        stages.append(b);
      }
      card.append(stages, h('p', { class: 'hold-text' }, t('holdText', { n: m.holdStage })));
    }
    return card;
  };

  const tile = (tl: TileModel): HTMLElement => {
    const b = button(`tile tile-${tl.state}`, `tile-${tl.key}`, () => handlers.onLevel(tl.key));
    b.setAttribute('data-testid', `tile-${tl.number}`);
    b.setAttribute('data-state', tl.state);
    if (tl.state === 'locked') {
      b.disabled = true;
      b.append(icon('lock'));
      b.setAttribute('aria-label', t('tileLocked', { n: tl.number }));
    } else if (tl.state === 'done') {
      const stars = h('span', { class: 'tile-stars', 'aria-hidden': 'true' });
      for (let i = 0; i < 3; i++) stars.append(starIcon(i < tl.stars));
      b.append(h('span', { class: 'tile-num' }, String(tl.number)), stars);
      b.setAttribute('aria-label', tn('tileDone', tl.stars, { stars: tl.stars, n: tl.number }));
    } else {
      b.append(h('span', { class: 'tile-num' }, String(tl.number)));
      b.setAttribute('aria-label', t('tileOpen', { n: tl.number }));
    }
    return b;
  };

  const world = (m: LevelSelectModel): HTMLElement => {
    const grid = h('div', { class: 'tiles', role: 'group', 'aria-label': t('levelsHeading') });
    grid.style.setProperty('--cols', String(TILE_COLUMNS));
    for (const tl of m.tiles) grid.append(tile(tl));
    return h(
      'section',
      { class: 'world' },
      h(
        'div',
        { class: 'world-head' },
        h('h2', { class: 'world-title' }, m.worldTitle),
        h(
          'span',
          { class: 'world-stars', 'data-testid': 'world-stars' },
          t('starsCount', { n: m.starsEarned, total: m.starsTotal }),
        ),
      ),
      grid,
    );
  };

  const teaser = (): HTMLElement =>
    h(
      'section',
      { class: 'card card-teaser', 'aria-disabled': 'true' },
      icon('lock'),
      h(
        'div',
        {},
        h('h2', { class: 'card-title' }, t('world2')),
        h('span', { class: 'card-sub' }, t('world2Soon')),
      ),
    );

  const notice = (): HTMLElement => {
    const close = h(
      'button',
      { type: 'button', class: 'notice-close', 'aria-label': t('dismiss') },
      '×',
    );
    const box = h(
      'div',
      { class: 'notice', role: 'status', 'data-testid': 'storage-notice' },
      h('span', {}, t('noStorage')),
      close,
    );
    close.addEventListener('click', () => {
      noticeDismissed = true;
      box.remove();
    });
    return box;
  };

  return {
    el,
    update(m) {
      const fid =
        document.activeElement instanceof HTMLElement ? document.activeElement.dataset.fid : null;
      const top = el.scrollTop;
      inner.replaceChildren(header(), modeCards(m), holdCard(m), world(m), teaser());
      el.querySelector('.notice')?.remove();
      if (!m.persistent && !noticeDismissed) el.append(notice());
      el.scrollTop = top;
      if (fid) el.querySelector<HTMLElement>(`[data-fid="${fid}"]`)?.focus();
    },
  };
}
