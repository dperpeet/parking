// Level-Editor (DOM): Raster als CSS-Grid aus Buttons, Paletten, Regeln, Fahrgaeste und Aktionen.
// Alle Texte gehen ueber textContent bzw. setAttribute, nie ueber innerHTML.
import './editor.css';
import { t } from '../../i18n';
import { PALETTE } from '../../render/theme';
import type { Dir } from '../../schema';
import { h, icon } from '../dom';
import type {
  EditorCellVm,
  EditorHandlers,
  EditorTool,
  EditorView,
  EditorViewModel,
  StepperVm,
} from './types';

export const DIR_ARROWS: Record<Dir, string> = { N: '↑', E: '→', S: '↓', W: '←' };
const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
const DIR_KEYS = { N: 'dirN', E: 'dirE', S: 'dirS', W: 'dirW' } as const;
const TOOLS: Array<[EditorTool, 'edToolPlace' | 'edToolSelect' | 'edToolFixed']> = [
  ['place', 'edToolPlace'],
  ['select', 'edToolSelect'],
  ['fixed', 'edToolFixed'],
];
const TOOL_HINTS = {
  place: 'edHintPlace',
  select: 'edHintSelect',
  fixed: 'edHintFixed',
} as const;
const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
/** Symbol fuer Poller-Zellen und gesperrte Fahrzeuge. */
const FIXED_GLYPH = '▮';
const LOCK_GLYPH = '🔒';
const KEY_GLYPH = '🔑';
/** Markierung fuer Mystery-Fahrzeuge (unten links, damit sie Schloss/Schluessel nicht verdeckt). */
const MYSTERY_GLYPH = '?';

const glyphOf = (color: string): string => PALETTE[color]?.glyph ?? '?';

export function createEditorView(handlers: EditorHandlers): EditorView {
  const statusEl = h('p', {
    class: 'ed-status',
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'editor-status',
  });
  const messageEl = h('p', {
    class: 'ed-message',
    role: 'status',
    'aria-live': 'polite',
    'data-testid': 'editor-message',
  });
  const board = h('div', { class: 'ed-board' });
  const controls = h('div', { class: 'ed-controls' });
  const shareBox = h('div', { class: 'ed-share' });

  // Titel-Eingabe bleibt bestehen, damit Fokus und Cursor beim Aktualisieren erhalten bleiben.
  const titleInput = h('input', {
    type: 'text',
    class: 'ed-input',
    id: 'ed-title',
    'data-testid': 'editor-title',
    autocomplete: 'off',
  });
  titleInput.addEventListener('input', () => handlers.onTitle(titleInput.value));
  const titleRow = h(
    'div',
    { class: 'ed-field' },
    h('label', { for: 'ed-title' }, t('edTitleLabel')),
    titleInput,
  );

  const actionsEl = h('div', { class: 'ed-actions' });
  const backBtn = h(
    'button',
    { type: 'button', class: 'btn-round', 'data-testid': 'editor-back', 'aria-label': t('back') },
    icon('back'),
  );
  backBtn.addEventListener('click', () => handlers.onBack());
  const heading = h('h1', { class: 'ed-heading' }, t('editorTitle'));
  const head = h('header', { class: 'ed-head' }, backBtn, heading);

  const el = h(
    'main',
    { class: 'screen editor', 'data-testid': 'editor' },
    h(
      'div',
      { class: 'ed-inner' },
      head,
      statusEl,
      board,
      messageEl,
      controls,
      titleRow,
      actionsEl,
      shareBox,
    ),
  );

  const button = (
    cls: string,
    fid: string,
    label: string,
    onClick: () => void,
    ...children: Array<Node | string>
  ): HTMLButtonElement => {
    const b = h(
      'button',
      { type: 'button', class: cls, 'data-fid': fid, 'data-testid': fid },
      ...children,
    );
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  };

  const stepper = (
    name: string,
    fid: string,
    s: StepperVm,
    onChange: (n: number) => void,
  ): HTMLElement => {
    const dec = button(
      'ed-btn ed-step',
      `${fid}-dec`,
      t('edDec', { name }),
      () => onChange(s.value - 1),
      '−',
    );
    const inc = button(
      'ed-btn ed-step',
      `${fid}-inc`,
      t('edInc', { name }),
      () => onChange(s.value + 1),
      '+',
    );
    dec.disabled = s.value <= s.min;
    inc.disabled = s.value >= s.max;
    const value = h(
      'output',
      { class: 'ed-value', 'data-testid': `${fid}-value` },
      String(s.value),
    );
    return h(
      'div',
      { class: 'ed-stepper', role: 'group', 'aria-label': name },
      h('span', { class: 'ed-label' }, name),
      dec,
      value,
      inc,
    );
  };

  const section = (title: string, ...children: Array<Node | null>): HTMLElement =>
    h('section', { class: 'ed-section' }, h('h2', { class: 'ed-h2' }, title), ...children);

  const choiceRow = <T extends string>(
    label: string,
    items: Array<{ id: T; text: string; aria: string; style?: string; glyph?: string }>,
    current: T,
    fidPrefix: string,
    onPick: (id: T) => void,
  ): HTMLElement => {
    const row = h('div', { class: 'ed-choices', role: 'group', 'aria-label': label });
    for (const it of items) {
      const b = button(
        'ed-btn ed-choice',
        `${fidPrefix}-${it.id}`,
        it.aria,
        () => onPick(it.id),
        it.text,
      );
      b.setAttribute('aria-pressed', String(it.id === current));
      if (it.style) b.style.setProperty('--fill', it.style);
      row.append(b);
    }
    return row;
  };

  // --- Raster ---

  const cellButton = (c: EditorCellVm): HTMLButtonElement => {
    const b = h('button', {
      type: 'button',
      class: `ed-cell ed-cell-${c.kind}`,
      'data-fid': `cell-${c.x}-${c.y}`,
      'data-testid': `cell-${c.x}-${c.y}`,
      'data-x': c.x,
      'data-y': c.y,
      'aria-label': c.label,
      tabindex: -1,
    });
    if (c.kind === 'vehicle' && c.color) {
      b.dataset.vehicle = c.vehicleId ?? '';
      b.dataset.color = c.color;
      b.style.setProperty('--fill', `var(--c-${c.color}-fill, var(--t-panel))`);
      b.style.setProperty('--ink', `var(--c-${c.color}-ink, var(--t-ink))`);
      const text = c.head && c.dir ? `${glyphOf(c.color)}${DIR_ARROWS[c.dir]}` : glyphOf(c.color);
      b.append(text);
      if (c.head) b.classList.add('ed-head-cell');
      if (c.locked) b.append(h('span', { class: 'ed-badge', 'aria-hidden': 'true' }, LOCK_GLYPH));
      else if (c.isKey)
        b.append(h('span', { class: 'ed-badge', 'aria-hidden': 'true' }, KEY_GLYPH));
      if (c.mystery) {
        b.classList.add('ed-mystery');
        b.append(
          h('span', { class: 'ed-badge ed-badge-mystery', 'aria-hidden': 'true' }, MYSTERY_GLYPH),
        );
      }
    } else if (c.kind === 'fixed') {
      b.append(FIXED_GLYPH);
    }
    if (c.selected) b.classList.add('ed-selected');
    b.setAttribute('aria-pressed', String(c.selected));
    b.addEventListener('click', () => handlers.onCell(c.x, c.y));
    return b;
  };

  let gridCols = 0;
  let gridRows = 0;

  const grid = h('div', {
    class: 'ed-grid',
    role: 'group',
    'aria-label': t('edBoard'),
    'data-testid': 'editor-grid',
  });
  grid.addEventListener('keydown', (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement) || !target.dataset.x) return;
    const x = Number(target.dataset.x);
    const y = Number(target.dataset.y);
    const step = ARROW_STEPS[ev.key];
    if (step) {
      ev.preventDefault();
      // Mit Umschalt verschiebt der Pfeil das ausgewaehlte Fahrzeug, sonst den Fokus.
      if (ev.shiftKey) {
        handlers.onMove(step[0], step[1]);
        return;
      }
      const nx = Math.min(Math.max(x + step[0], 0), gridCols - 1);
      const ny = Math.min(Math.max(y + step[1], 0), gridRows - 1);
      focusCell(nx, ny);
    } else if (ev.key === 'r' || ev.key === 'R') {
      handlers.onRotate();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      handlers.onDelete();
    }
  });
  // Roving tabindex: nur die zuletzt fokussierte Zelle ist per Tab erreichbar.
  let rover: [number, number] = [0, 0];
  const focusCell = (x: number, y: number): void => {
    rover = [x, y];
    grid.querySelectorAll<HTMLElement>('.ed-cell').forEach((c) => c.setAttribute('tabindex', '-1'));
    const next = grid.querySelector<HTMLElement>(`[data-fid="cell-${x}-${y}"]`);
    next?.setAttribute('tabindex', '0');
    next?.focus();
  };
  grid.addEventListener('focusin', (ev) => {
    const target = ev.target;
    if (target instanceof HTMLElement && target.dataset.x) {
      rover = [Number(target.dataset.x), Number(target.dataset.y)];
    }
  });

  const renderBoard = (vm: EditorViewModel): void => {
    gridCols = vm.width;
    gridRows = vm.height;
    grid.style.setProperty('--cols', String(vm.width));
    grid.replaceChildren(...vm.cells.map(cellButton));
    const [rx, ry] = [Math.min(rover[0], vm.width - 1), Math.min(rover[1], vm.height - 1)];
    rover = [rx, ry];
    grid.querySelector(`[data-fid="cell-${rx}-${ry}"]`)?.setAttribute('tabindex', '0');
    board.replaceChildren(grid);
  };

  // --- Steuerung ---

  const renderControls = (vm: EditorViewModel): void => {
    const tools = choiceRow(
      t('edToolsLabel'),
      TOOLS.map(([id, key]) => ({ id, text: t(key), aria: t(key) })),
      vm.tool,
      'tool',
      handlers.onTool,
    );
    const hint = h('p', { class: 'ed-hint' }, t(TOOL_HINTS[vm.tool]));

    const palette = h(
      'div',
      { class: 'ed-palette' },
      choiceRow(
        t('edType'),
        vm.types.map((it) => ({ id: it.id, text: it.id.toUpperCase(), aria: it.label })),
        vm.type,
        'type',
        handlers.onType,
      ),
      choiceRow(
        t('edColor'),
        vm.colors.map((it) => ({
          id: it.id,
          text: glyphOf(it.id),
          aria: it.label,
          style: `var(--c-${it.id}-fill, var(--t-panel))`,
        })),
        vm.color,
        'color',
        handlers.onColor,
      ),
      choiceRow(
        t('edDir'),
        DIRS.map((d) => ({ id: d, text: DIR_ARROWS[d], aria: t(DIR_KEYS[d]) })),
        vm.dir,
        'dir',
        handlers.onDir,
      ),
    );

    const sel = vm.selected;
    let selection: HTMLElement;
    if (sel) {
      const rotate = button('ed-btn', 'rotate', t('edRotate'), handlers.onRotate, t('edRotate'));
      const del = button(
        'ed-btn ed-danger',
        'delete',
        t('edDelete'),
        handlers.onDelete,
        t('edDelete'),
      );
      const parts: Node[] = [h('div', { class: 'ed-row' }, rotate, del)];
      if (sel.canKey) {
        const select = h('select', {
          class: 'ed-input',
          id: 'ed-key',
          'data-testid': 'key-select',
          'data-fid': 'key',
        });
        select.append(h('option', { value: '' }, t('edKeyNone')));
        for (const o of sel.keyOptions) {
          const opt = h('option', { value: o.id }, o.label);
          if (o.id === sel.keyId) opt.selected = true;
          select.append(opt);
        }
        select.addEventListener('change', () =>
          handlers.onKey(select.value === '' ? null : select.value),
        );
        parts.push(
          h('div', { class: 'ed-field' }, h('label', { for: 'ed-key' }, t('edKey')), select),
        );
      }
      if (sel.canMystery) {
        const mystery = button(
          'ed-btn',
          'mystery',
          t('edMystery'),
          () => handlers.onMystery(!sel.mystery),
          t('edMystery'),
        );
        mystery.setAttribute('aria-pressed', String(sel.mystery));
        parts.push(h('div', { class: 'ed-row' }, mystery));
      }
      selection = h('div', { class: 'ed-selection' }, ...parts);
    } else {
      selection = h('p', { class: 'ed-hint', 'data-testid': 'no-selection' }, t('edNoSelection'));
    }

    const rulesetSelect = h('select', {
      class: 'ed-input',
      id: 'ed-ruleset',
      'data-testid': 'ruleset-select',
      'data-fid': 'ruleset',
    });
    for (const r of vm.rulesets) {
      const opt = h('option', { value: r.id }, r.name);
      if (r.id === vm.rulesetId) opt.selected = true;
      rulesetSelect.append(opt);
    }
    rulesetSelect.addEventListener('change', () => handlers.onRuleset(rulesetSelect.value));

    const p = vm.passengers;
    const chips = h('div', {
      class: 'ed-pax',
      role: 'group',
      'aria-label': t('edPassengers', { n: p.colors.length }),
    });
    p.colors.forEach((color, i) => {
      const chip = button(
        'ed-chip',
        `pax-${i}`,
        p.labels[i] ?? '',
        () => handlers.onPassenger(i),
        glyphOf(color),
      );
      chip.style.setProperty('--fill', `var(--c-${color}-fill, var(--t-panel))`);
      chip.style.setProperty('--ink', `var(--c-${color}-ink, var(--t-ink))`);
      chip.setAttribute('aria-pressed', String(p.swapIndex === i));
      chips.append(chip);
    });
    const shuffle = button(
      'ed-btn',
      'shuffle',
      t('edShuffleOn'),
      () => handlers.onShuffle(!p.shuffleEnabled),
      t('edShuffleOn'),
    );
    shuffle.setAttribute('aria-pressed', String(p.shuffleEnabled));
    const shuffleRow = h('div', { class: 'ed-row' }, shuffle);
    if (p.shuffleEnabled) {
      shuffleRow.append(
        stepper(t('edShuffleWindow'), 'shuffle-window', p.shuffleWindow, handlers.onShuffleWindow),
        button('ed-btn', 'reseed', t('edReseed'), handlers.onReseed, t('edReseed')),
      );
    }

    const fid = (document.activeElement as HTMLElement | null)?.dataset?.fid ?? null;
    controls.replaceChildren(
      section(t('edToolsLabel'), tools, hint, palette),
      section(t('edSelected'), selection),
      section(
        t('edSize'),
        stepper(t('edWidth'), 'width', vm.size.width, (n) =>
          handlers.onSize(n, vm.size.height.value),
        ),
        stepper(t('edHeight'), 'height', vm.size.height, (n) =>
          handlers.onSize(vm.size.width.value, n),
        ),
      ),
      section(
        t('edRules'),
        h(
          'div',
          { class: 'ed-field' },
          h('label', { for: 'ed-ruleset' }, t('edRuleset')),
          rulesetSelect,
        ),
        stepper(t('edSlots'), 'slots', vm.slots, handlers.onSlots),
        stepper(t('edVisible'), 'visible', vm.visible, handlers.onVisible),
      ),
      section(
        t('edPassengers', { n: p.colors.length }),
        h(
          'p',
          { class: 'ed-hint', 'data-testid': 'passenger-note' },
          p.manual ? t('edPassengersManual') : t('edPassengersAuto'),
        ),
        chips,
        h('p', { class: 'ed-hint' }, t('edSwapHint')),
        h(
          'div',
          { class: 'ed-row' },
          button(
            'ed-btn',
            'regenerate',
            t('edRegenerate'),
            handlers.onRegenerate,
            t('edRegenerate'),
          ),
        ),
        shuffleRow,
      ),
    );
    if (fid && !fid.startsWith('cell-'))
      controls.querySelector<HTMLElement>(`[data-fid="${fid}"]`)?.focus();
  };

  const renderActions = (vm: EditorViewModel): void => {
    const fid = (document.activeElement as HTMLElement | null)?.dataset?.fid ?? null;
    const test = button('ed-btn ed-primary', 'test', t('edTest'), handlers.onTest, t('edTest'));
    const save = button('ed-btn', 'save', t('edSave'), handlers.onSave, t('edSave'));
    const share = button('ed-btn', 'share', t('edShare'), handlers.onShare, t('edShare'));
    const reset = button(
      vm.newArmed ? 'ed-btn ed-danger' : 'ed-btn',
      'new',
      '',
      handlers.onNew,
      vm.newArmed ? t('edNewConfirm') : t('edNew'),
    );
    test.disabled = !vm.canTest;
    save.disabled = !vm.canSave;
    share.disabled = !vm.canShare;
    actionsEl.replaceChildren(test, save, share, reset);
    if (fid) actionsEl.querySelector<HTMLElement>(`[data-fid="${fid}"]`)?.focus();
  };

  const renderShare = (vm: EditorViewModel): void => {
    if (vm.shareUrl === null) {
      shareBox.replaceChildren();
      return;
    }
    const input = h('input', {
      type: 'text',
      class: 'ed-input',
      readonly: true,
      value: vm.shareUrl,
      'data-testid': 'share-url',
      'aria-label': t('edShareManual'),
    });
    input.addEventListener('focus', () => input.select());
    shareBox.replaceChildren(h('p', { class: 'ed-hint' }, t('edShareManual')), input);
  };

  return {
    el,
    update(vm) {
      statusEl.textContent = vm.status.text;
      statusEl.dataset.tone = vm.status.tone;
      messageEl.textContent = vm.message;
      const fid = (document.activeElement as HTMLElement | null)?.dataset?.fid ?? null;
      renderBoard(vm);
      renderControls(vm);
      renderActions(vm);
      renderShare(vm);
      if (fid?.startsWith('cell-')) grid.querySelector<HTMLElement>(`[data-fid="${fid}"]`)?.focus();
      titleInput.maxLength = vm.titleMax;
      if (document.activeElement !== titleInput && titleInput.value !== vm.title)
        titleInput.value = vm.title;
    },
  };
}
