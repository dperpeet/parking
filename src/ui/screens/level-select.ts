// Levelauswahl: Tageslevel, Endlos, "Stufe halten" und das Level-Raster der Welt.
import { t, tn } from '../../i18n';
import type { Mechanic } from '../../schema';
import { mechanicTitle } from '../components/intro-card';
import { h, icon, starIcon } from '../dom';

export type TileState = 'locked' | 'open' | 'done';

export interface TileModel {
  key: string;
  /** Weltnummer ab 1; `number` zaehlt je Welt. */
  world: number;
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
  worlds: WorldModel[];
  /** false: Speicher nicht verfuegbar, Hinweis anzeigen. */
  persistent: boolean;
  /** Eigene Level aus dem Editor (optional, Standard: keine). */
  customLevels?: CustomLevelModel[];
}

export interface WorldModel {
  world: number;
  title: string;
  /** Gesperrte Welt: nur Titel und Hinweis, keine Kacheln. */
  locked: boolean;
  lockedHint: string;
  starsEarned: number;
  starsTotal: number;
  tiles: TileModel[];
  /** Mechaniken mit Intro-Karte in dieser Welt (zum erneuten Abrufen). */
  intros: Mechanic[];
}

export interface CustomLevelModel {
  id: string;
  title: string;
  verified: boolean;
}

export interface LevelSelectHandlers {
  onLevel(key: string): void;
  onDaily(): void;
  onEndless(): void;
  onSettings(): void;
  onHold(enabled: boolean): void;
  onHoldStage(stage: number): void;
  onIntro(mechanic: Mechanic): void;
  onEditor?(): void;
  onCustomPlay?(id: string): void;
  onCustomEdit?(id: string): void;
  onCustomDelete?(id: string): void;
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
  /** Eigenes Level, dessen Loeschen gerade bestaetigt werden soll. */
  let pendingDelete: string | null = null;
  let lastModel: LevelSelectModel | null = null;
  const rerender = (): void => {
    if (lastModel) view.update(lastModel);
  };

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
    b.setAttribute('data-testid', `tile-${tl.world}-${tl.number}`);
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

  const world = (w: WorldModel): HTMLElement => {
    if (w.locked) {
      const card = h(
        'section',
        {
          class: 'card card-teaser world-locked',
          'aria-disabled': 'true',
          'data-testid': `world-${w.world}`,
          'data-state': 'locked',
        },
        icon('lock'),
        h(
          'div',
          {},
          h('h2', { class: 'card-title' }, w.title),
          h('span', { class: 'card-sub', 'data-testid': `world-hint-${w.world}` }, w.lockedHint),
        ),
      );
      return card;
    }
    const grid = h('div', { class: 'tiles', role: 'group', 'aria-label': w.title });
    grid.style.setProperty('--cols', String(TILE_COLUMNS));
    for (const tl of w.tiles) grid.append(tile(tl));
    const intros = w.intros.map((mechanic) => {
      const name = mechanicTitle(mechanic);
      const b = button('intro-btn', `intro-${w.world}-${mechanic}`, () =>
        handlers.onIntro(mechanic),
      );
      b.append(h('span', { class: 'intro-q', 'aria-hidden': 'true' }, '?'), name);
      b.setAttribute('aria-label', t('introReplay', { name }));
      b.setAttribute('data-testid', `intro-${mechanic}`);
      return b;
    });
    return h(
      'section',
      { class: 'world', 'data-testid': `world-${w.world}`, 'data-state': 'open' },
      h(
        'div',
        { class: 'world-head' },
        h('h2', { class: 'world-title' }, w.title),
        h(
          'span',
          { class: 'world-stars', 'data-testid': `world-stars-${w.world}` },
          t('starsCount', { n: w.starsEarned, total: w.starsTotal }),
        ),
      ),
      intros.length > 0 ? h('div', { class: 'intro-row' }, ...intros) : null,
      grid,
    );
  };

  const customList = (m: LevelSelectModel): HTMLElement => {
    const list = m.customLevels ?? [];
    const editor = button(
      'card card-editor',
      'editor',
      () => handlers.onEditor?.(),
      h('span', { class: 'card-title' }, t('editorTitle')),
      h('span', { class: 'card-sub' }, t('editorOpenSub')),
    );
    editor.setAttribute('data-testid', 'card-editor');
    const rows = h('ul', { class: 'custom-list', 'data-testid': 'custom-list' });
    for (const c of list) {
      const row = h('li', { class: 'custom-row', 'data-testid': `custom-${c.id}` });
      // Titel stammt aus Nutzereingaben/Share-Codes: nur als Text einfuegen.
      const name = h(
        'span',
        { class: 'custom-title' },
        c.title || t('edDefaultTitle'),
        h(
          'span',
          { class: 'custom-tag' },
          c.verified ? t('customVerified') : t('customUnverified'),
        ),
      );
      const act = (fid: string, label: string, fn: () => void): HTMLButtonElement =>
        button('custom-btn', `${fid}-${c.id}`, fn, label);
      if (pendingDelete === c.id) {
        const yes = act('del-yes', t('customDelete'), () => {
          pendingDelete = null;
          handlers.onCustomDelete?.(c.id);
        });
        yes.setAttribute('data-testid', `custom-delete-yes-${c.id}`);
        const no = act('del-no', t('cancel'), () => {
          pendingDelete = null;
          rerender();
          el.querySelector<HTMLElement>(`[data-fid="del-${c.id}"]`)?.focus();
        });
        row.append(
          h(
            'span',
            { class: 'custom-title', role: 'alert' },
            t('customDeleteAsk', { title: c.title || t('edDefaultTitle') }),
          ),
          yes,
          no,
        );
      } else {
        const play = act('play', t('customPlay'), () => handlers.onCustomPlay?.(c.id));
        play.setAttribute('data-testid', `custom-play-${c.id}`);
        const edit = act('edit', t('customEdit'), () => handlers.onCustomEdit?.(c.id));
        edit.setAttribute('data-testid', `custom-edit-${c.id}`);
        const del = act('del', t('customDelete'), () => {
          pendingDelete = c.id;
          rerender();
          el.querySelector<HTMLElement>(`[data-fid="del-no-${c.id}"]`)?.focus();
        });
        del.setAttribute('data-testid', `custom-delete-${c.id}`);
        row.append(name, play, edit, del);
      }
      rows.append(row);
    }
    return h(
      'section',
      { class: 'custom' },
      editor,
      h('h2', { class: 'world-title' }, t('customHeading')),
      list.length === 0 ? h('p', { class: 'hold-text' }, t('customEmpty')) : rows,
    );
  };

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

  const view: LevelSelectView = {
    el,
    update(m) {
      lastModel = m;
      const fid =
        document.activeElement instanceof HTMLElement ? document.activeElement.dataset.fid : null;
      const top = el.scrollTop;
      inner.replaceChildren(
        header(),
        modeCards(m),
        holdCard(m),
        ...m.worlds.map(world),
        customList(m),
      );
      el.querySelector('.notice')?.remove();
      if (!m.persistent && !noticeDismissed) el.append(notice());
      el.scrollTop = top;
      if (fid) el.querySelector<HTMLElement>(`[data-fid="${fid}"]`)?.focus();
    },
  };
  return view;
}
