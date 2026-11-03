// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, GameEvent, GameState } from '../../../src/engine/types';
import type { ResolvedRules } from '../../../src/schema';
import { setLanguage } from '../../../src/i18n';
import { mountShell } from '../../../src/ui/shell';
import type { Shell } from '../../../src/ui/shell';
import { createHud } from '../../../src/ui/hud';
import type { Hud, HudActions } from '../../../src/ui/hud';
import { bindKeyboard } from '../../../src/ui/keyboard';
import { announce, hintAnnouncement, honkErrorText } from '../../../src/ui/strings';
import { setup, v } from '../engine/helpers';

const HONK = { powerups: { honk: { enabled: true, uses: 1 } } };

/** V (blau) schaut nach Osten, der gruene Blocker B steht quer auf seinem Weg. */
function game(overrides: object = HONK) {
  return setup({
    vehicles: [v('V', 1, 2, 'E', 's', 'blue'), v('B', 3, 2, 'S', 's', 'green')],
    passengers: ['blue', 'blue', 'green', 'green'],
    overrides,
  });
}

interface Setup {
  shell: Shell;
  hud: Hud;
  actions: Action[];
  notes: string[];
  state: GameState;
  rules: ResolvedRules;
}

function mount(overrides: object = HONK, patch: Partial<GameState> = {}): Setup {
  const { state: initial, rules } = game(overrides);
  const state = { ...initial, ...patch };
  const shell = mountShell(document.body);
  const actions: Action[] = [];
  const notes: string[] = [];
  const handlers: HudActions = {
    dispatch: (a) => actions.push(a),
    restart: () => undefined,
    again: () => undefined,
    next: () => undefined,
    similar: () => undefined,
    hint: () => undefined,
    notify: (text) => notes.push(text),
    share: () => Promise.resolve('cancelled'),
    back: () => undefined,
    info: () => ({
      title: { world: 'W', level: 'L' },
      dialog: { stars: 3, nextLabel: 'Weiter', showSimilar: false, endless: null },
      hint: { left: 3, busy: false },
      share: null,
    }),
  };
  const hud = createHud(shell, () => rules, handlers);
  hud.render(state);
  return { shell, hud, actions, notes, state, rules };
}

const byId = (id: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  return el;
};
const honkBtn = (): HTMLButtonElement => byId('powerup-honk') as HTMLButtonElement;
const key = (k: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

let unbind: (() => void) | undefined;
beforeEach(() => {
  setLanguage('de');
  document.body.replaceChildren();
});
afterEach(() => {
  unbind?.();
  unbind = undefined;
});

describe('Hupen-Knopf', () => {
  it('ist nur sichtbar, wenn das Ruleset die Hupe aktiviert', () => {
    mount({});
    expect(honkBtn().hidden).toBe(true);
    document.body.replaceChildren();
    mount(HONK);
    expect(honkBtn().hidden).toBe(false);
    expect(honkBtn().querySelector('.badge')?.textContent).toBe('1');
  });

  it('ist bei Sieg, Niederlage (ausser noMoves) und ohne Nutzungen deaktiviert', () => {
    mount(HONK, { status: 'won' });
    expect(honkBtn().disabled).toBe(true);
    document.body.replaceChildren();
    mount(HONK, { status: 'lost', loseReason: 'queueFull' });
    expect(honkBtn().disabled).toBe(true);
    document.body.replaceChildren();
    const { state } = game();
    mount(HONK, { powerUps: { ...state.powerUps, honk: 0 } });
    expect(honkBtn().disabled).toBe(true);
  });

  it('bleibt bei Niederlage durch noMoves aktiv', () => {
    mount(HONK, { status: 'lost', loseReason: 'noMoves' });
    expect(honkBtn().disabled).toBe(false);
  });
});

describe('Zielmodus', () => {
  it('Klick schaltet den Modus ein, der naechste Fahrzeug-Tipp sendet honk', () => {
    const { actions } = mount();
    honkBtn().click();
    expect(honkBtn().getAttribute('aria-pressed')).toBe('true');
    expect(byId('honk-hint').textContent).toBe('Tippe das Fahrzeug, das hupen soll');
    byId('vehicle-V').click();
    expect(actions).toEqual([{ type: 'usePowerUp', powerUp: 'honk', vehicleId: 'V' }]);
    expect(honkBtn().getAttribute('aria-pressed')).toBe('false');
    expect(byId('honk-hint').textContent).toBe('');
    // Der Modus ist verbraucht: der naechste Tipp ist wieder ein normaler Zug.
    byId('vehicle-B').click();
    expect(actions[1]).toEqual({ type: 'tapVehicle', vehicleId: 'B' });
  });

  it('ohne Modus tippt ein Fahrzeug normal', () => {
    const { actions } = mount();
    byId('vehicle-B').click();
    expect(actions).toEqual([{ type: 'tapVehicle', vehicleId: 'B' }]);
  });

  it('erneuter Klick bricht ab', () => {
    const { actions } = mount();
    honkBtn().click();
    honkBtn().click();
    expect(honkBtn().getAttribute('aria-pressed')).toBe('false');
    byId('vehicle-B').click();
    expect(actions).toEqual([{ type: 'tapVehicle', vehicleId: 'B' }]);
  });

  it('Esc bricht ab, H schaltet um', () => {
    const { hud } = mount();
    unbind = bindKeyboard({
      moveFocus: hud.moveFocus,
      undo: () => undefined,
      restart: () => undefined,
      honk: hud.toggleHonk,
      cancel: hud.cancelHonk,
      isDialogOpen: hud.isDialogOpen,
    });
    key('h');
    expect(honkBtn().getAttribute('aria-pressed')).toBe('true');
    key('Escape');
    expect(honkBtn().getAttribute('aria-pressed')).toBe('false');
    key('H');
    expect(honkBtn().getAttribute('aria-pressed')).toBe('true');
    key('h');
    expect(honkBtn().getAttribute('aria-pressed')).toBe('false');
  });

  it('Esc ohne Modus wird nicht verbraucht', () => {
    const { hud } = mount();
    expect(hud.cancelHonk()).toBe(false);
    const cancelled = vi.fn(() => false);
    unbind = bindKeyboard({
      moveFocus: hud.moveFocus,
      undo: () => undefined,
      restart: () => undefined,
      honk: hud.toggleHonk,
      cancel: cancelled,
      isDialogOpen: () => false,
    });
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(event);
    expect(cancelled).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('H schaltet nichts ein, wenn die Hupe nicht nutzbar ist', () => {
    const { hud } = mount(HONK, { status: 'won' });
    hud.toggleHonk();
    expect(honkBtn().getAttribute('aria-pressed')).toBe('false');
  });

  it('endet, wenn die Hupe unbenutzbar wird', () => {
    const { hud, state } = mount();
    honkBtn().click();
    hud.render({ ...state, status: 'won' });
    expect(honkBtn().getAttribute('aria-pressed')).toBe('false');
    expect(byId('honk-hint').textContent).toBe('');
  });
});

describe('Tipp mit Hupe', () => {
  it('hebt Fahrzeug und Hupen-Knopf hervor, null entfernt beides', () => {
    const { hud } = mount();
    hud.setHint('V', 'honk');
    expect(byId('vehicle-V').hasAttribute('data-hint')).toBe(true);
    expect(honkBtn().hasAttribute('data-hint')).toBe(true);
    hud.setHint(null);
    expect(byId('vehicle-V').hasAttribute('data-hint')).toBe(false);
    expect(honkBtn().hasAttribute('data-hint')).toBe(false);
  });

  it('ein normaler Tipp laesst den Hupen-Knopf in Ruhe', () => {
    const { hud } = mount();
    hud.setHint('B', 'tap');
    expect(byId('vehicle-B').hasAttribute('data-hint')).toBe(true);
    expect(honkBtn().hasAttribute('data-hint')).toBe(false);
  });

  it('Ansage nennt die Farbe', () => {
    expect(hintAnnouncement('blue', 'honk')).toBe('Tipp: mit dem blauen Fahrzeug hupen');
    expect(hintAnnouncement('blue')).toBe('Tipp: das blaue Fahrzeug');
    expect(hintAnnouncement('purple', 'honk')).toBe('Tipp: mit dem lila Fahrzeug hupen');
    setLanguage('en');
    expect(hintAnnouncement('blue', 'honk')).toBe('Hint: honk with the blue vehicle');
  });
});

describe('Meldungen', () => {
  it('abgelehntes Hupen: Meldung per Toast und Ansage', () => {
    const { hud, notes, shell, state } = mount();
    hud.onEvent({ type: 'invalidAction', reason: 'notBlocked' }, state);
    hud.render(state);
    expect(notes).toEqual(['Der Weg ist frei – Hupen ist nicht nötig.']);
    expect(shell.live.textContent).toBe('Der Weg ist frei – Hupen ist nicht nötig.');
  });

  it('andere ungueltige Aktionen bleiben still', () => {
    const { hud, notes, state } = mount();
    hud.onEvent({ type: 'invalidAction', reason: 'noHistory' }, state);
    expect(notes).toEqual([]);
  });

  it('jeder neue Grund hat einen Text, beide Sprachen', () => {
    for (const lang of ['de', 'en'] as const) {
      setLanguage(lang);
      for (const reason of [
        'notBlocked',
        'blockedByBollard',
        'blockerLocked',
        'cannotYield',
        'noTarget',
      ]) {
        expect(honkErrorText(reason), `${lang} ${reason}`).toBeTruthy();
      }
    }
    expect(honkErrorText('noHistory')).toBeNull();
  });

  it('vehicleYielded wird angesagt', () => {
    const { state } = game();
    const event: GameEvent = {
      type: 'vehicleYielded',
      vehicleId: 'B',
      byVehicleId: 'V',
      from: [3, 2],
      to: [3, 3],
    };
    expect(announce(event, state)).toBe('Das grüne Fahrzeug weicht aus');
    setLanguage('en');
    expect(announce(event, state)).toBe('The green vehicle moves aside');
  });
});

describe('Verlust-Dialog', () => {
  const lost = { status: 'lost', loseReason: 'noMoves' } as const;

  it('bietet bei noMoves Hupen an; Klick schliesst den Dialog und startet den Zielmodus', () => {
    const { hud, shell } = mount(HONK, lost);
    expect(shell.dialogLayer.querySelector('[data-testid="lose-dialog"]')).not.toBeNull();
    byId('dlg-honk').click();
    expect(shell.dialogLayer.querySelector('[data-testid="lose-dialog"]')).toBeNull();
    expect(honkBtn().getAttribute('aria-pressed')).toBe('true');
    expect(hud.isDialogOpen()).toBe(false);
  });

  it('Abbrechen bringt den Dialog zurueck', () => {
    const { hud, shell } = mount(HONK, lost);
    byId('dlg-honk').click();
    hud.cancelHonk();
    expect(shell.dialogLayer.querySelector('[data-testid="lose-dialog"]')).not.toBeNull();
  });

  it('kein Hupen-Angebot ohne Hupe oder bei anderem Verlustgrund', () => {
    const noHonk = mount({}, lost);
    expect(noHonk.shell.dialogLayer.querySelector('[data-testid="dlg-honk"]')).toBeNull();
    document.body.replaceChildren();
    const full = mount(HONK, { status: 'lost', loseReason: 'queueFull' });
    expect(full.shell.dialogLayer.querySelector('[data-testid="dlg-honk"]')).toBeNull();
  });
});
