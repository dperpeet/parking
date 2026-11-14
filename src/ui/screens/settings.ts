// Einstellungen als Dialog ueber der Levelauswahl.
import { LANGS, t } from '../../i18n';
import type { Lang, StringKey } from '../../i18n';
import { h } from '../dom';

export type MotionChoice = 'system' | 'on' | 'off';

export interface SettingsModel {
  language: Lang;
  motion: MotionChoice;
  sound: boolean;
}

export type ImportMode = 'merge' | 'replace';

export interface SettingsHandlers {
  getModel(): SettingsModel;
  onLanguage(lang: Lang): void;
  onMotion(motion: MotionChoice): void;
  onSound(on: boolean): void;
  onExport(): void;
  /** Prueft, ob der Dateiinhalt ein gueltiger Spielstand ist (ohne etwas zu aendern). */
  validateImport(text: string): boolean;
  /** Spielt den Spielstand ein; gibt zurueck, ob es geklappt hat. */
  onImport(text: string, mode: ImportMode): boolean;
  onReset(): void;
  /** Anleitung bzw. Datenschutzhinweis oeffnen (der Einstellungsdialog schliesst sich dafuer). */
  onGuide(): void;
  onPrivacy(): void;
}

export interface SettingsDialog {
  close(): void;
  /** Baut den Dialog mit der aktuellen Sprache neu auf. */
  refresh(): void;
}

const LANG_KEYS: Record<Lang, StringKey> = { de: 'langDe', en: 'langEn' };
const MOTION_CHOICES: Array<{ value: MotionChoice; key: StringKey }> = [
  { value: 'system', key: 'motionSystem' },
  { value: 'on', key: 'motionOn' },
  { value: 'off', key: 'motionOff' },
];

/** Oeffnet den Dialog in `layer`; `background` wird solange inert gesetzt. */
export function openSettings(
  layer: HTMLElement,
  background: HTMLElement,
  handlers: SettingsHandlers,
  onClosed: () => void,
): SettingsDialog {
  let message = '';
  let confirmingReset = false;
  /** Gueltiger Dateiinhalt, der auf die Wahl Zusammenfuehren/Ersetzen wartet. */
  let pendingImport: string | null = null;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    layer.replaceChildren();
    background.inert = false;
    onClosed();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);

  const segmented = <T extends string>(
    label: string,
    choices: Array<{ value: T; text: string }>,
    selected: T,
    onPick: (value: T) => void,
    testid: string,
  ): HTMLElement => {
    const row = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
    for (const c of choices) {
      const b = h(
        'button',
        {
          type: 'button',
          class: 'seg-btn',
          'aria-pressed': String(c.value === selected),
          'data-testid': `${testid}-${c.value}`,
        },
        c.text,
      );
      b.addEventListener('click', () => onPick(c.value));
      row.append(b);
    }
    return h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label), row);
  };

  const action = (label: string, testid: string, onClick: () => void, cls = 'btn-secondary') => {
    const b = h('button', { type: 'button', class: `btn ${cls}`, 'data-testid': testid }, label);
    b.addEventListener('click', onClick);
    return b;
  };

  const build = (): HTMLElement => {
    const model = handlers.getModel();
    const importInput = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      class: 'sr-only',
      'data-testid': 'import-input',
      tabindex: '-1',
    });
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (!file) return;
      void file.text().then(
        (text) => {
          if (handlers.validateImport(text)) {
            pendingImport = text;
            message = '';
          } else {
            message = t('importFail');
          }
          render();
        },
        () => {
          message = t('importFail');
          render();
        },
      );
    });
    const importLabel = h(
      'label',
      { class: 'btn btn-secondary btn-file' },
      t('importProgress'),
      importInput,
    );

    const soundSwitch = h('button', {
      type: 'button',
      class: 'switch',
      role: 'switch',
      'aria-checked': String(model.sound),
      'aria-label': t('sound'),
      'data-testid': 'sound-switch',
    });
    soundSwitch.append(h('span', { class: 'switch-knob' }));
    soundSwitch.addEventListener('click', () => {
      handlers.onSound(!model.sound);
      render();
    });

    const title = h('h2', { id: 'set-title', class: 'dlg-title set-title' }, t('settingsTitle'));
    const dialog = h('div', {
      class: 'dialog dialog-settings',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'set-title',
      'data-testid': 'settings-dialog',
    });

    if (pendingImport !== null) {
      const finish = (mode: ImportMode): void => {
        const text = pendingImport ?? '';
        pendingImport = null;
        message = handlers.onImport(text, mode) ? t('importOk') : t('importFail');
        render();
      };
      dialog.append(
        title,
        h('p', { class: 'dlg-sub set-confirm' }, t('importChoose')),
        h(
          'p',
          { class: 'set-warn', role: 'alert', 'data-testid': 'import-warning' },
          t('importReplaceWarn'),
        ),
        action(t('importMerge'), 'import-merge', () => finish('merge'), 'btn-primary'),
        action(t('importReplace'), 'import-replace', () => finish('replace')),
        action(t('cancel'), 'import-cancel', () => {
          pendingImport = null;
          render();
        }),
      );
      return dialog;
    }

    if (confirmingReset) {
      dialog.append(
        title,
        h('p', { class: 'dlg-sub set-confirm' }, t('resetConfirm')),
        h(
          'div',
          { class: 'dlg-row' },
          action(t('cancel'), 'reset-cancel', () => {
            confirmingReset = false;
            render();
          }),
          action(
            t('resetDo'),
            'reset-confirm',
            () => {
              confirmingReset = false;
              handlers.onReset();
              message = '';
              render();
            },
            'btn-primary',
          ),
        ),
      );
      return dialog;
    }

    dialog.append(
      title,
      segmented(
        t('language'),
        LANGS.map((l) => ({ value: l, text: t(LANG_KEYS[l]) })),
        model.language,
        (l) => {
          handlers.onLanguage(l);
          render();
        },
        'lang',
      ),
      h(
        'div',
        { class: 'set-row set-row-inline' },
        h('div', { class: 'set-label' }, t('sound')),
        soundSwitch,
      ),
      segmented(
        t('motion'),
        MOTION_CHOICES.map((c) => ({ value: c.value, text: t(c.key) })),
        model.motion,
        (m) => {
          handlers.onMotion(m);
          render();
        },
        'motion',
      ),
      h(
        'div',
        { class: 'set-actions' },
        action(t('exportProgress'), 'export', handlers.onExport),
        importLabel,
        action(t('resetProgress'), 'reset', () => {
          confirmingReset = true;
          render();
        }),
      ),
      h(
        'div',
        { class: 'set-row' },
        h('div', { class: 'set-label', id: 'set-info' }, t('infoHeading')),
        h(
          'div',
          { class: 'dlg-row set-info', role: 'group', 'aria-labelledby': 'set-info' },
          action(t('guideTitle'), 'settings-guide', handlers.onGuide),
          action(t('privacyTitle'), 'settings-privacy', handlers.onPrivacy),
        ),
      ),
      h('p', { class: 'set-message', role: 'status', 'data-testid': 'settings-message' }, message),
      action(t('close'), 'settings-close', close, 'btn-primary'),
    );
    return dialog;
  };

  const render = (): void => {
    if (closed) return;
    const focusId =
      document.activeElement instanceof HTMLElement ? document.activeElement.dataset.testid : null;
    const dialog = build();
    layer.replaceChildren(
      h('div', { class: 'overlay' }, h('div', { class: 'overlay-inner plain' }, dialog)),
    );
    const target = focusId
      ? dialog.querySelector<HTMLElement>(`[data-testid="${focusId}"]`)
      : dialog.querySelector<HTMLElement>('.btn-primary');
    (target ?? dialog.querySelector<HTMLElement>('.btn'))?.focus();
  };

  background.inert = true;
  render();
  return { close, refresh: render };
}
