// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, GameEvent, GameState, Snapshot } from '../../../src/engine/types';
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
  cleared: { count: number };
  state: GameState;
  rules: ResolvedRules;
}

/** Ziele, die die Fake-Engine im Test als gueltig meldet. */
let targets: string[] = ['V'];

function mount(overrides: object = HONK, patch: Partial<GameState> = {}): Setup {
  const { state: initial, rules } = game(overrides);
  const state = { ...initial, ...patch };
  const shell = mountShell(document.body);
  const actions: Action[] = [];
  const notes: string[] = [];
  const cleared = { count: 0 };
  const handlers: HudActions = {
    dispatch: (a) => actions.push(a),
    restart: () => undefined,
    again: () => undefined,
    next: () => undefined,
    similar: () => undefined,
    hint: () => undefined,
    honkTargets: () => targets,
    notify: (text) => notes.push(text),
    clearToast: () => void (cleared.count += 1),
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
  return { shell, hud, actions, notes, cleared, state, rules };
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
  targets = ['V'];
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
    expect(byId('honk-hint').textContent).toBe('Welches Auto steckt fest? Tippe es an.');
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
    expect(byId('vehicle-V').querySelector('.hint-bubble')).not.toBeNull();
    expect(honkBtn().hasAttribute('data-hint')).toBe(true);
    hud.setHint(null);
    expect(byId('vehicle-V').hasAttribute('data-hint')).toBe(false);
    expect(byId('vehicle-V').querySelector('.hint-bubble')).toBeNull();
    expect(honkBtn().hasAttribute('data-hint')).toBe(false);
  });

  it('ein normaler Tipp laesst den Hupen-Knopf in Ruhe', () => {
    const { hud } = mount();
    hud.setHint('B', 'tap');
    expect(byId('vehicle-B').hasAttribute('data-hint')).toBe(true);
    expect(byId('vehicle-B').querySelector('.hint-bubble')).toBeNull();
    expect(honkBtn().hasAttribute('data-hint')).toBe(false);
  });

  it('Ansage nennt die Farbe', () => {
    expect(hintAnnouncement({ color: 'blue' }, 'honk')).toBe('Tipp: mit dem blauen Fahrzeug hupen');
    expect(hintAnnouncement({ color: 'blue' })).toBe('Tipp: das blaue Fahrzeug');
    expect(hintAnnouncement({ color: 'purple' }, 'honk')).toBe('Tipp: mit dem lila Fahrzeug hupen');
    setLanguage('en');
    expect(hintAnnouncement({ color: 'blue' }, 'honk')).toBe('Hint: honk with the blue vehicle');
  });
});

describe('Meldungen', () => {
  it('abgelehntes Hupen: Meldung per Toast und Ansage', () => {
    const { hud, notes, shell, state } = mount();
    hud.onEvent({ type: 'invalidAction', reason: 'notBlocked' }, state);
    hud.render(state);
    expect(notes).toEqual(['Das Auto kann doch fahren!']);
    expect(shell.live.textContent).toBe('Das Auto kann doch fahren!');
  });

  it('andere ungueltige Aktionen bleiben still', () => {
    const { hud, notes, state } = mount();
    hud.onEvent({ type: 'invalidAction', reason: 'noHistory' }, state);
    expect(notes).toEqual([]);
  });

  it('Fehlertexte sind kurz und kindgerecht (de und en)', () => {
    const expected = {
      de: {
        notBlocked: 'Das Auto kann doch fahren!',
        blockedByBollard: 'Der Poller bleibt stehen.',
        blockerLocked: 'Das Auto davor ist abgeschlossen.',
        cannotYield: 'Hier hilft Hupen nicht.',
        noTarget: 'Tippe ein Auto an.',
      },
      en: {
        notBlocked: 'This car can already drive!',
        blockedByBollard: 'The post won’t move.',
        blockerLocked: 'The car in front is locked.',
        cannotYield: 'Honking won’t help here.',
        noTarget: 'Tap a car.',
      },
    } as const;
    for (const lang of ['de', 'en'] as const) {
      setLanguage(lang);
      for (const [reason, text] of Object.entries(expected[lang])) {
        expect(honkErrorText(reason), `${lang} ${reason}`).toBe(text);
        expect(text.split(' ').length).toBeLessThanOrEqual(7);
      }
    }
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

describe('Sackgasse', () => {
  const lost = { status: 'lost', loseReason: 'noMoves' } as const;
  const card = (): HTMLElement | null => document.querySelector('[data-testid="stuck-card"]');

  it('zeigt mit Hupe uebrig eine nicht-modale Karte statt des Verlust-Dialogs', () => {
    const { hud, shell } = mount(HONK, lost);
    expect(shell.dialogLayer.querySelector('[data-testid="lose-dialog"]')).toBeNull();
    expect(hud.isDialogOpen()).toBe(false);
    expect(shell.game.inert).toBeFalsy();
    expect(card()?.textContent).toContain('Hier klemmt es!');
    expect(card()?.textContent).toContain('Lass ein Auto hupen.');
    expect(document.activeElement).toBe(byId('stuck-honk'));
    // Das Brett bleibt sichtbar: kein abdunkelnder Overlay.
    expect(shell.dialogLayer.querySelector('.overlay')).toBeNull();
  });

  it('Englisch: Titel und Satz', () => {
    setLanguage('en');
    mount(HONK, lost);
    expect(card()?.textContent).toContain('Stuck!');
    expect(card()?.textContent).toContain('Let a car honk.');
    expect(byId('stuck-honk').textContent).toBe('Honk');
  });

  it('Hupen startet den Zielmodus und blendet die Karte aus; Abbrechen bringt sie zurueck', () => {
    const { hud } = mount(HONK, lost);
    byId('stuck-honk').click();
    expect(card()).toBeNull();
    expect(honkBtn().getAttribute('aria-pressed')).toBe('true');
    hud.cancelHonk();
    expect(card()).not.toBeNull();
    expect(document.querySelector('[data-testid="lose-dialog"]')).toBeNull();
  });

  it('Abbrechen-Knopf im Banner hat mindestens 44 px und bringt die Karte zurueck', () => {
    mount(HONK, lost);
    byId('stuck-honk').click();
    const cancel = byId('honk-cancel');
    expect(cancel.getAttribute('aria-label')).toBe('Abbrechen');
    cancel.click();
    expect(card()).not.toBeNull();
  });

  it('Zurueck und Nochmal sind kleine Nebenknoepfe', () => {
    const { actions } = mount(HONK, lost);
    expect(byId('stuck-undo').classList.contains('btn-small')).toBe(true);
    expect(byId('stuck-again').classList.contains('btn-small')).toBe(true);
    // Level ohne Verlauf: nichts zum Zuruecknehmen.
    expect((byId('stuck-undo') as HTMLButtonElement).disabled).toBe(true);
    expect(actions).toEqual([]);
  });

  it('Tipp-Knopf ist in der Sackgasse aktiv, sonst bei Niederlage nicht', () => {
    mount(HONK, lost);
    expect((byId('hint') as HTMLButtonElement).disabled).toBe(false);
    document.body.replaceChildren();
    mount(HONK, { status: 'lost', loseReason: 'queueFull' });
    expect((byId('hint') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Fallback: ohne Hupe uebrig oder bei anderem Verlustgrund bleibt der Dialog', () => {
    const noHonk = mount({}, lost);
    expect(noHonk.shell.dialogLayer.querySelector('[data-testid="lose-dialog"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="stuck-card"]')).toBeNull();
    document.body.replaceChildren();
    const { state } = game();
    const empty = mount(HONK, { ...lost, powerUps: { ...state.powerUps, honk: 0 } });
    expect(empty.shell.dialogLayer.querySelector('[data-testid="lose-dialog"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="stuck-card"]')).toBeNull();
    document.body.replaceChildren();
    const full = mount(HONK, { status: 'lost', loseReason: 'queueFull' });
    expect(full.shell.dialogLayer.querySelector('[data-testid="lose-dialog"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="stuck-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="dlg-honk"]')).toBeNull();
  });
});

describe('Zielmodus mit Fuehrung', () => {
  it('markiert nur gueltige Ziele, die anderen sind gedimmt', () => {
    mount();
    honkBtn().click();
    expect(byId('vehicle-V').getAttribute('data-honk-target')).toBe('yes');
    expect(byId('vehicle-B').getAttribute('data-honk-target')).toBe('no');
    honkBtn().click();
    expect(byId('vehicle-V').hasAttribute('data-honk-target')).toBe(false);
  });

  it('Fehlgriff sendet die Hupe (Engine lehnt ab), der Modus bleibt aktiv', () => {
    const { actions } = mount();
    honkBtn().click();
    byId('vehicle-B').click();
    expect(actions).toEqual([{ type: 'usePowerUp', powerUp: 'honk', vehicleId: 'B' }]);
    expect(honkBtn().getAttribute('aria-pressed')).toBe('true');
    expect(byId('honk-hint').textContent).not.toBe('');
  });

  it('Banner hat einen Abbrechen-Knopf', () => {
    mount();
    honkBtn().click();
    byId('honk-cancel').click();
    expect(honkBtn().getAttribute('aria-pressed')).toBe('false');
    expect(byId('honk-hint').textContent).toBe('');
  });
});

describe('Rueckmeldung', () => {
  it('neutrale Meldung nach erfolgreicher Hupe, beide Sprachen (Lob kommt vom Guide)', () => {
    const { hud, notes, state } = mount();
    const event: GameEvent = {
      type: 'vehicleYielded',
      vehicleId: 'B',
      byVehicleId: 'V',
      from: [3, 2],
      to: [3, 3],
    };
    hud.onEvent(event, state);
    setLanguage('en');
    hud.onEvent(event, state);
    expect(notes).toEqual(['Das Auto macht Platz!', 'The car makes room!']);
  });

  it('proaktiver Hinweis laesst den Hupen-Knopf pulsieren, unabhaengig vom Fahrzeug-Tipp', () => {
    const { hud } = mount();
    hud.nudgeHonk(true);
    expect(honkBtn().hasAttribute('data-hint')).toBe(true);
    expect(honkBtn().querySelector('.hint-bubble')?.textContent).toBe('HUP!');
    hud.setHint('V', 'honk');
    hud.setHint(null);
    expect(honkBtn().hasAttribute('data-hint')).toBe(true);
    hud.nudgeHonk(false);
    expect(honkBtn().hasAttribute('data-hint')).toBe(false);
    expect(honkBtn().querySelector('.hint-bubble')).toBeNull();
  });
});

describe('Blockiertes Auto bei pulsierender Hupe', () => {
  const blocked = (reason: 'path' | 'locked' | 'queueFull'): GameEvent => ({
    type: 'vehicleBlocked',
    vehicleId: 'B',
    reason,
    blockerId: reason === 'path' ? 'V' : null,
  });

  it('Toast, solange die Hupe pulsiert (Nudge oder Hupen-Tipp), beide Sprachen', () => {
    const { hud, notes, state } = mount();
    hud.nudgeHonk(true);
    hud.onEvent(blocked('path'), state);
    setLanguage('en');
    hud.onEvent(blocked('path'), state);
    hud.nudgeHonk(false);
    hud.setHint('V', 'honk');
    hud.onEvent(blocked('path'), state);
    expect(notes).toEqual([
      'Blockiert – die Hupe hilft!',
      'Blocked – try the horn!',
      'Blocked – try the horn!',
    ]);
  });

  it('ohne pulsierende Hupe oder bei anderem Grund bleibt es still', () => {
    const { hud, notes, state } = mount();
    hud.onEvent(blocked('path'), state);
    hud.nudgeHonk(true);
    hud.onEvent(blocked('locked'), state);
    hud.onEvent(blocked('queueFull'), state);
    expect(notes).toEqual([]);
  });
});

describe('Toast-Reste und Undo-Puls', () => {
  const lost = { status: 'lost', loseReason: 'noMoves' } as const;

  it('beim Erscheinen der Sackgassen-Karte wird der Toast entfernt (einmal)', () => {
    const { hud, cleared, state } = mount();
    expect(cleared.count).toBe(0);
    hud.render({ ...state, ...lost });
    expect(cleared.count).toBe(1);
    hud.refresh();
    expect(cleared.count).toBe(1);
  });

  it('nudgeUndo laesst den Undo-Knopf pulsieren', () => {
    const { hud } = mount();
    const undo = byId('powerup-undo');
    hud.nudgeUndo(true);
    expect(undo.hasAttribute('data-hint')).toBe(true);
    expect(honkBtn().hasAttribute('data-hint')).toBe(false);
    hud.nudgeUndo(false);
    expect(undo.hasAttribute('data-hint')).toBe(false);
  });
});

describe('Verlust-Dialog nach sinnloser Hupe', () => {
  const snap = (honk: boolean): Snapshot => ({
    ...(game().state as unknown as Snapshot),
    ...(honk ? { honk: true } : {}),
  });
  const noHonk = (): Partial<GameState> => ({
    status: 'lost',
    loseReason: 'noMoves',
    powerUps: { ...game().state.powerUps, honk: 0 },
  });

  it('zeigt den Zusatzsatz, wenn Undo geht und der letzte Eintrag eine Hupe war', () => {
    const { shell } = mount(HONK, { ...noHonk(), history: [snap(false), snap(true)] });
    expect(shell.dialogLayer.textContent).toContain(
      'Hoppla, das hilft nicht. Mit Zurück bekommst du die Hupe wieder.',
    );
    setLanguage('en');
    document.body.replaceChildren();
    const en = mount(HONK, { ...noHonk(), history: [snap(true)] });
    expect(en.shell.dialogLayer.textContent).toContain(
      'Oops, that didn’t help. Undo gives the horn back.',
    );
  });

  it('kein Zusatzsatz ohne Hupe im Verlauf, ohne Undo oder bei anderem Grund', () => {
    const text = (patch: Partial<GameState>): string => {
      document.body.replaceChildren();
      return mount(HONK, { ...noHonk(), ...patch }).shell.dialogLayer.textContent ?? '';
    };
    expect(text({ history: [snap(true), snap(false)] })).not.toContain('Hoppla');
    expect(text({ history: [] })).not.toContain('Hoppla');
    const { state } = game();
    expect(
      text({ history: [snap(true)], powerUps: { ...state.powerUps, honk: 0, undo: 0 } }),
    ).not.toContain('Hoppla');
    expect(text({ history: [snap(true)], loseReason: 'queueFull' })).not.toContain('Hoppla');
  });
});

describe('Fokus', () => {
  const lost = { status: 'lost', loseReason: 'noMoves' } as const;
  const history = [game().state as unknown as Snapshot];

  it('schliesst die Karte per Zurueck, landet der Fokus auf dem Undo-Knopf', () => {
    const { hud, state } = mount(HONK, { ...lost, history });
    byId('stuck-undo').focus();
    expect(document.activeElement).toBe(byId('stuck-undo'));
    hud.render({ ...state, status: 'playing', history });
    expect(document.querySelector('[data-testid="stuck-card"]')).toBeNull();
    expect(document.activeElement).toBe(byId('powerup-undo'));
  });

  it('ohne Verlauf (Neustart) landet der Fokus auf einem Fahrzeug', () => {
    const { hud, state } = mount(HONK, { ...lost, history });
    byId('stuck-again').focus();
    hud.render({ ...state, status: 'playing', history: [] });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.getAttribute('data-testid')).toMatch(/^vehicle-/);
  });

  it('nach dem Verlust-Dialog-Zurueck faellt der Fokus nicht auf BODY', () => {
    const { hud, state } = mount(HONK, {
      status: 'lost',
      loseReason: 'queueFull',
      history,
    });
    expect(document.activeElement).toBe(byId('dlg-undo'));
    hud.render({ ...state, status: 'playing', history });
    expect(document.activeElement).toBe(byId('powerup-undo'));
  });

  it('klaut keinen Fokus, wenn er ausserhalb des Spiels liegt', () => {
    const { hud, state } = mount();
    expect(document.activeElement).toBe(document.body);
    hud.render({ ...state });
    expect(document.activeElement).toBe(document.body);
  });
});
