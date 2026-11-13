// Editor-Screen: verbindet Modell, Live-Solver, Fortschritt, Router und Share-Codec mit der Editor-UI.
import { getLanguage, t } from '../i18n';
import type { StringKey } from '../i18n';
import { createEditorView } from '../ui/editor';
import type {
  EditorCellVm,
  EditorTool,
  EditorView,
  EditorViewModel,
  StatusTone,
} from '../ui/editor';
import { colorName } from '../ui/strings';
import { SHARE_TEXT_MAX, resolveRules } from '../schema';
import type { Dir, ResolvedRules, Ruleset } from '../schema';
import { createLiveCheck } from './editor-check';
import type { CheckStatus, LiveCheck } from './editor-check';
import {
  EDITOR_LIMITS,
  SHUFFLE_WINDOW_MAX,
  checkLevel,
  fromLevel,
  moveVehicle,
  newEditorState,
  placeVehicle,
  regeneratePassengers,
  removeVehicle,
  resizeGrid,
  rotateVehicle,
  rulesOfState,
  setKey,
  setMystery,
  setShuffle,
  swapPassengers,
  toLevel,
  toggleFixed,
  vehicleCellsOf,
} from './editor-model';
import type { EditError, EditResult, EditorIssue, EditorState } from './editor-model';
import { EDITOR_DEFAULT_RULESET } from './editor-rulesets';
import { encodeLevel, decodeLevel } from './share';
import type { RulesLookup } from './share';
import type { Progress } from './progress';
import type { Router } from './router';
import type { SolverPort } from './solver-port';

/** Browser-Funktionen zum Teilen; in Tests ersetzbar. */
export interface EditorEnv {
  /** Basis der Share-URL: origin + pathname. */
  baseUrl(): string;
  share?(data: { title: string; url: string }): Promise<void>;
  writeText?(text: string): Promise<void>;
}

export interface EditorCodec {
  encode: typeof encodeLevel;
  decode: typeof decodeLevel;
}

export interface EditorScreenDeps {
  progress: Progress;
  solver: Pick<SolverPort, 'analyze'>;
  router: Router;
  rulesets: Ruleset[];
  /** Code des zu bearbeitenden Levels oder null fuer ein neues. */
  code: string | null;
  /** Level im Spiel testen; die App sorgt dafuer, dass "Zurueck" hierher fuehrt. */
  testPlay(code: string): void;
  codec?: EditorCodec;
  env?: EditorEnv;
}

export interface EditorScreen {
  dispose(): void;
}

const DIR_KEYS: Record<Dir, StringKey> = { N: 'dirN', E: 'dirE', S: 'dirS', W: 'dirW' };
const ERROR_KEYS: Record<EditError, StringKey> = {
  outOfBounds: 'edErrOutOfBounds',
  overlap: 'edErrOverlap',
  keyCycle: 'edErrKeyCycle',
  keySelf: 'edErrKeySelf',
  unknownType: 'edErrOther',
  unknownColor: 'edErrOther',
  unknownVehicle: 'edErrOther',
  badIndex: 'edErrOther',
};
const ISSUE_KEYS: Record<EditorIssue['code'], StringKey> = {
  empty: 'edStatusEmpty',
  schema: 'edIssueSchema',
  outOfBounds: 'edIssueBounds',
  overlap: 'edIssueOverlap',
  passengerMismatch: 'edIssuePassengers',
  unknownKey: 'edIssueKey',
  keyCycle: 'edIssueKey',
  unknownVehicleType: 'edIssueOther',
  unknownColor: 'edIssueOther',
  duplicateId: 'edIssueOther',
  mysteryDisabled: 'edIssueMystery',
  oneWayDisabled: 'edIssueOther',
  oneWayInvalid: 'edIssueOther',
  unsupportedRule: 'edIssueOther',
};
/** Nachkommastellen der angezeigten Schwierigkeit. */
const DIFFICULTY_DIGITS = 1;

export function browserEnv(win: Window = window): EditorEnv {
  const nav = win.navigator;
  return {
    baseUrl: () => win.location.origin + win.location.pathname,
    share: typeof nav.share === 'function' ? (data) => nav.share(data) : undefined,
    writeText:
      typeof nav.clipboard?.writeText === 'function'
        ? (text) => nav.clipboard.writeText(text)
        : undefined,
  };
}

export function mountEditorScreen(root: HTMLElement, deps: EditorScreenDeps): EditorScreen {
  const { progress, router, rulesets } = deps;
  const codec: EditorCodec = deps.codec ?? { encode: encodeLevel, decode: decodeLevel };
  const env = deps.env ?? browserEnv();
  const rulesetById = (id: string): Ruleset | undefined => rulesets.find((r) => r.id === id);
  const fallbackRuleset = rulesetById(EDITOR_DEFAULT_RULESET) ?? (rulesets[0] as Ruleset);

  const rulesOf: RulesLookup = (id, overrides) => {
    const ruleset = rulesetById(id);
    if (!ruleset) return null;
    try {
      return resolveRules(ruleset, overrides);
    } catch {
      return null;
    }
  };

  // --- Zustand ---
  let state: EditorState = newEditorState(fallbackRuleset.id);
  let savedId: string | null = null;
  let message = '';
  let shareUrl: string | null = null;
  let newArmed = false;
  let swapIndex: number | null = null;
  let selectedId: string | null = null;
  let tool: EditorTool = 'place';
  let dir: Dir = 'E';
  let check: CheckStatus = { kind: 'idle' };
  let lastSignature = '';

  const rulesetOf = (): Ruleset => rulesetById(state.rulesetId) ?? fallbackRuleset;
  const rules = (): ResolvedRules => rulesOfState(state, rulesetOf());
  const firstType = (r: ResolvedRules): string => Object.keys(r.vehicles.types)[0] ?? '';
  let type = firstType(rules());
  let color = rules().vehicles.colors[0] ?? '';

  const loadFromCode = (code: string): void => {
    try {
      const res = codec.decode(code, rulesOf);
      const ruleset = res.ok ? rulesetById(res.level.ruleset) : undefined;
      if (!res.ok || !ruleset) {
        message = t('edLoadFailed');
        return;
      }
      state = { ...fromLevel(res.level, ruleset), title: res.title ?? '' };
      savedId = progress.customLevels().find((e) => e.code === code)?.id ?? null;
    } catch {
      message = t('edLoadFailed');
    }
  };
  if (deps.code) loadFromCode(deps.code);
  type = firstType(rules());
  color = rules().vehicles.colors[0] ?? '';

  // --- Ableitungen ---
  const vehicleAt = (x: number, y: number): string | undefined => {
    const r = rules();
    return state.vehicles.find((v) => vehicleCellsOf(v, r).some(([cx, cy]) => cx === x && cy === y))
      ?.id;
  };

  const issues = (): EditorIssue[] => checkLevel(state, rulesetOf());

  const checkText = (): { text: string; tone: StatusTone } => {
    const found = issues();
    const first = found[0];
    if (first)
      return { text: t(ISSUE_KEYS[first.code]), tone: first.code === 'empty' ? 'idle' : 'bad' };
    switch (check.kind) {
      case 'solvable': {
        const difficulty = check.difficulty.toFixed(DIFFICULTY_DIGITS);
        const text =
          check.par === null
            ? t('edSolvableNoPar', { difficulty })
            : t('edSolvable', { par: check.par, difficulty });
        return { text, tone: 'ok' };
      }
      case 'unsolvable':
        return { text: t('edUnsolvable'), tone: 'bad' };
      case 'truncated':
        return { text: t('edTruncated'), tone: 'warn' };
      case 'error':
        return { text: t('edCheckError'), tone: 'warn' };
      default:
        return { text: t('edChecking'), tone: 'busy' };
    }
  };

  const cellVm = (x: number, y: number): EditorCellVm => {
    const row = y + 1;
    const col = x + 1;
    if (state.fixed.some(([fx, fy]) => fx === x && fy === y)) {
      return {
        x,
        y,
        kind: 'fixed',
        head: false,
        selected: false,
        locked: false,
        isKey: false,
        label: t('edCellFixed', { row, col }),
      };
    }
    const id = vehicleAt(x, y);
    const v = state.vehicles.find((o) => o.id === id);
    if (!v) {
      return {
        x,
        y,
        kind: 'empty',
        head: false,
        selected: false,
        locked: false,
        isKey: false,
        label: t('edCellEmpty', { row, col }),
      };
    }
    const head = v.x === x && v.y === y;
    const extra =
      (head ? t('edHeadCell') : '') +
      (v.keyId !== undefined ? t('edLockedExtra') : '') +
      (v.mystery ? t('edMysteryExtra') : '');
    const what = t('edVehicleWhat', {
      color: colorName(v.color),
      type: v.type.toUpperCase(),
      dir: t(DIR_KEYS[v.dir]),
      extra,
    });
    return {
      x,
      y,
      kind: 'vehicle',
      color: v.color,
      vehicleId: v.id,
      head,
      dir: v.dir,
      selected: v.id === selectedId,
      locked: v.keyId !== undefined,
      isKey: state.vehicles.some((o) => o.keyId === v.id),
      mystery: v.mystery === true,
      label: t('edCellVehicle', { row, col, what }),
    };
  };

  const stepper = (
    value: number,
    min: number,
    max: number,
  ): { value: number; min: number; max: number } => ({ value, min, max });

  const buildVm = (): EditorViewModel => {
    const r = rules();
    const cells: EditorCellVm[] = [];
    for (let y = 0; y < state.height; y++)
      for (let x = 0; x < state.width; x++) cells.push(cellVm(x, y));
    const selectedVehicle = state.vehicles.find((v) => v.id === selectedId);
    const status = checkText();
    const noIssues = issues().length === 0;
    const { grid, slots, visible } = EDITOR_LIMITS;
    return {
      width: state.width,
      height: state.height,
      cells,
      tool,
      types: Object.entries(r.vehicles.types).map(([id, vt]) => ({
        id,
        label: t('edTypeLabel', { type: id.toUpperCase(), len: vt.length, cap: vt.capacity }),
      })),
      colors: r.vehicles.colors.map((id) => ({ id, label: colorName(id) })),
      type,
      color,
      dir,
      selected: selectedVehicle
        ? {
            id: selectedVehicle.id,
            keyId: selectedVehicle.keyId ?? null,
            canKey: state.vehicles.length > 1,
            mystery: selectedVehicle.mystery === true,
            // Ohne Ruleset-Flag nur zum Entfernen einer vorhandenen Markierung.
            canMystery: r.special.mysteryVehicles || selectedVehicle.mystery === true,
            keyOptions: state.vehicles
              .filter(
                (o) => o.id !== selectedVehicle.id && setKey(state, r, selectedVehicle.id, o.id).ok,
              )
              .map((o) => ({
                id: o.id,
                label: t('edKeyOption', { color: colorName(o.color), row: o.y + 1, col: o.x + 1 }),
              })),
          }
        : null,
      rulesets: rulesets.map((rs) => ({
        id: rs.id,
        name: typeof rs.name === 'string' ? rs.name : rs.name[getLanguage()],
      })),
      rulesetId: state.rulesetId,
      size: {
        width: stepper(state.width, grid.min, grid.max),
        height: stepper(state.height, grid.min, grid.max),
      },
      slots: stepper(r.queue.slots, slots.min, slots.max),
      visible: stepper(r.passengers.visible, visible.min, visible.max),
      passengers: {
        colors: state.passengers,
        labels: state.passengers.map((c, i) =>
          t('edPassengerChip', { n: i + 1, color: colorName(c) }),
        ),
        manual: state.manual,
        swapIndex,
        shuffleEnabled: state.shuffle.enabled,
        shuffleWindow: stepper(state.shuffle.window, 1, SHUFFLE_WINDOW_MAX),
      },
      title: state.title,
      titleMax: SHARE_TEXT_MAX,
      status,
      message,
      shareUrl,
      canTest: noIssues,
      canSave: noIssues,
      canShare: noIssues,
      newArmed,
    };
  };

  const render = (): void => view.update(buildVm());

  const liveCheck: LiveCheck = createLiveCheck(deps.solver, (s) => {
    check = s;
    render();
  });

  /** Nach jeder Aenderung: Anzeige neu, Solver nur bei geaendertem Level starten. */
  const changed = (): void => {
    if (issues().length > 0) {
      lastSignature = '';
      liveCheck.cancel();
      return;
    }
    const level = toLevel(state, rulesetOf());
    const signature = JSON.stringify(level);
    if (signature === lastSignature) {
      render();
      return;
    }
    lastSignature = signature;
    liveCheck.schedule(level, rules());
  };

  const apply = (result: EditResult): boolean => {
    newArmed = false;
    shareUrl = null;
    if (!result.ok) {
      message = t(ERROR_KEYS[result.error]);
      render();
      return false;
    }
    message = '';
    state = result.state;
    swapIndex = null;
    if (selectedId !== null && !state.vehicles.some((v) => v.id === selectedId)) selectedId = null;
    changed();
    return true;
  };

  const encodeNow = (): { code: string; verified: boolean } | null => {
    if (issues().length > 0) {
      message = t('edNotValid');
      render();
      return null;
    }
    const verified = check.kind === 'solvable';
    const title = state.title.trim();
    let res: ReturnType<typeof encodeLevel>;
    try {
      res = codec.encode(toLevel(state, rulesetOf()), {
        unchecked: !verified,
        ...(title === '' ? {} : { title }),
      });
    } catch {
      message = t('edErrOther');
      render();
      return null;
    }
    if (!res.ok) {
      message = t('edTooLong');
      render();
      return null;
    }
    return { code: res.code, verified };
  };

  const displayTitle = (): string => state.title.trim() || t('edDefaultTitle');

  const view: EditorView = createEditorView({
    onBack: () => router.navigate({ name: 'select' }),
    onCell(x, y) {
      newArmed = false;
      const hit = vehicleAt(x, y);
      if (tool === 'fixed') {
        apply(toggleFixed(state, rules(), x, y));
        return;
      }
      if (hit !== undefined) {
        selectedId = hit === selectedId && tool === 'select' ? null : hit;
        message = '';
        render();
        return;
      }
      if (tool === 'select') {
        const id = selectedId;
        if (id !== null) apply(moveVehicle(state, rules(), id, x, y));
        return;
      }
      const nextId = `v${state.nextId}`;
      if (apply(placeVehicle(state, rules(), { x, y, dir, type, color }))) {
        selectedId = nextId;
        render();
      }
    },
    onTool(next) {
      tool = next;
      newArmed = false;
      render();
    },
    onType(id) {
      type = id;
      render();
    },
    onColor(id) {
      color = id;
      render();
    },
    onDir(next) {
      dir = next;
      render();
    },
    onRotate() {
      const id = selectedId;
      if (id !== null) apply(rotateVehicle(state, rules(), id));
    },
    onDelete() {
      const id = selectedId;
      if (id !== null) apply(removeVehicle(state, rules(), id));
    },
    onMove(dx, dy) {
      const v = state.vehicles.find((o) => o.id === selectedId);
      if (v) apply(moveVehicle(state, rules(), v.id, v.x + dx, v.y + dy));
    },
    onKey(keyId) {
      const id = selectedId;
      if (id !== null) apply(setKey(state, rules(), id, keyId));
    },
    onMystery(on) {
      const id = selectedId;
      if (id !== null) apply(setMystery(state, id, on));
    },
    onSize: (w, hgt) => apply(resizeGrid(state, rules(), w, hgt)),
    onRuleset(id) {
      const ruleset = rulesetById(id);
      if (!ruleset) return;
      state = {
        ...state,
        rulesetId: id,
        slots: null,
        visible: null,
        powerups: undefined,
        mysteryRule: undefined,
      };
      const r = rules();
      if (!(type in r.vehicles.types)) type = firstType(r);
      if (!r.vehicles.colors.includes(color)) color = r.vehicles.colors[0] ?? '';
      apply({ ok: true, state: state.manual ? state : regeneratePassengers(state, r) });
    },
    onSlots(n) {
      const value = Math.min(Math.max(n, EDITOR_LIMITS.slots.min), EDITOR_LIMITS.slots.max);
      apply({
        ok: true,
        state: { ...state, slots: value === rulesetOf().queue.slots ? null : value },
      });
    },
    onVisible(n) {
      const value = Math.min(Math.max(n, EDITOR_LIMITS.visible.min), EDITOR_LIMITS.visible.max);
      apply({
        ok: true,
        state: { ...state, visible: value === rulesetOf().passengers.visible ? null : value },
      });
    },
    onShuffle: (enabled) => apply({ ok: true, state: setShuffle(state, rules(), { enabled }) }),
    onShuffleWindow: (n) => apply({ ok: true, state: setShuffle(state, rules(), { window: n }) }),
    onReseed: () =>
      apply({ ok: true, state: setShuffle(state, rules(), { seed: state.shuffle.seed + 1 }) }),
    onRegenerate: () => apply({ ok: true, state: regeneratePassengers(state, rules()) }),
    onPassenger(i) {
      if (swapIndex === null) {
        swapIndex = i;
        render();
      } else if (swapIndex === i) {
        swapIndex = null;
        render();
      } else {
        apply(swapPassengers(state, swapIndex, i));
      }
    },
    onTitle(text) {
      state = { ...state, title: text.slice(0, SHARE_TEXT_MAX) };
      lastSignature = '';
    },
    onTest() {
      const enc = encodeNow();
      if (!enc) return;
      // Verlaufseintrag des Editors aktualisieren, damit "Zurueck" das aktuelle Level zeigt.
      router.replace({ name: 'editor', code: enc.code });
      deps.testPlay(enc.code);
    },
    onSave() {
      const enc = encodeNow();
      if (!enc) return;
      savedId = progress.saveCustom(
        { code: enc.code, title: displayTitle(), verified: enc.verified },
        savedId ?? undefined,
      );
      router.replace({ name: 'editor', code: enc.code });
      message = enc.verified ? t('edSaved') : t('edSavedUnchecked');
      render();
    },
    onShare() {
      const enc = encodeNow();
      if (!enc) return;
      const url = `${env.baseUrl()}#/play?l=${enc.code}`;
      const note = enc.verified ? '' : t('edSharedUnchecked');
      void share(url, note);
    },
    onNew() {
      if (!newArmed && state.vehicles.length + state.fixed.length > 0) {
        newArmed = true;
        render();
        return;
      }
      state = newEditorState(state.rulesetId);
      savedId = null;
      selectedId = null;
      swapIndex = null;
      shareUrl = null;
      newArmed = false;
      message = '';
      router.replace({ name: 'editor', code: null });
      changed();
    },
  });

  /** Teilen: Web Share, sonst Zwischenablage, sonst markierbares Textfeld. */
  async function share(url: string, note: string): Promise<void> {
    const title = displayTitle();
    shareUrl = null;
    try {
      if (env.share) {
        await env.share({ title, url });
        message = note.trim();
        render();
        return;
      }
    } catch (err) {
      // Abbruch durch den Nutzer ist kein Fehler.
      if (err instanceof Error && err.name === 'AbortError') return;
    }
    try {
      if (env.writeText) {
        await env.writeText(url);
        message = t('edCopied') + note;
        render();
        return;
      }
    } catch {
      // weiter mit dem Textfeld
    }
    shareUrl = url;
    message = note.trim();
    render();
  }

  root.replaceChildren(view.el);
  if (issues().length === 0) changed();
  else render();

  return {
    dispose() {
      liveCheck.dispose();
      root.replaceChildren();
    },
  };
}
