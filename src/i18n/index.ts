// Uebersetzungen (de/en) mit typisierten Keys. Platzhalter: {name}.
// Plural: Keys mit Endung `_one` gelten fuer genau 1 (siehe tn()); alle anderen Zahlen nutzen den Basis-Key.

export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];
/** Fallback, wenn weder Einstellung noch Browser-Sprache passen. */
export const DEFAULT_LANG: Lang = 'de';

const de = {
  // Spielfeld / HUD
  back: 'Zurück zum Menü',
  moves: 'Züge',
  movesAria: '{n} Züge',
  movesAria_one: '1 Zug',
  waiting: '{n} warten',
  nextPassengers: 'Nächste Fahrgäste',
  passengers: 'Fahrgäste',
  slotsTitle: 'Halteplätze {used} / {total} belegt',
  slotEmpty: 'frei',
  slotLocked: 'gesperrt',
  slotFilled: 'Halteposition {i}: {color}, {filled} von {cap}',
  slotState: 'Halteposition {i}: {state}',
  board: 'Spielfeld',
  vehicles: 'Fahrzeuge',
  powerUps: 'Hilfen',
  puUndo: 'Zurück',
  puShuffle: 'Mischen',
  puExtraSlot: '+1 Platz',
  puHonk: 'Hupe',
  puHint: 'Tipp',
  puLeft: '{label}, {n} übrig',
  restart: 'Neustart',
  // Dialoge
  winTitle: 'Geschafft!',
  winSub: 'In {n} Zügen',
  winSub_one: 'In 1 Zug',
  next: 'Weiter',
  toMenu: 'Zum Menü',
  again: 'Nochmal',
  similar: 'Ähnliches Level',
  generating: 'Wird erstellt …',
  loseQueueFull: 'Kein Platz mehr',
  loseNoMoves: 'Keine Züge mehr',
  loseMovesLimit: 'Keine Züge übrig',
  loseTimeUp: 'Zeit abgelaufen',
  loseUndo: 'Zurück',
  stars: '{n} von 3 Sternen',
  stars_one: '1 von 3 Sternen',
  endlessOver: 'Run beendet',
  endlessScore: '{n} Level geschafft',
  endlessScore_one: '1 Level geschafft',
  endlessRecord: 'Neuer Rekord!',
  endlessNewRun: 'Neuer Run',
  // Titel im Spiel
  worldName1: 'Werkstatt',
  worldLabel: 'Welt {n} · {name}',
  levelLabel: 'Level {n}',
  titleSimilar: 'Ähnlich zu Level {n}',
  titleDaily: 'Tageslevel',
  titleShared: 'Geteiltes Level',
  titleSharedBy: 'Geteilt von {author}',
  sharedUnchecked: 'Ungeprüftes Level – ob es lösbar ist, steht nicht fest.',
  shareErrBroken: 'Der Link ist kaputt oder unvollständig.',
  shareErrTooLong: 'Der Link ist zu lang für ein geteiltes Level.',
  shareErrVersion: 'Dieser Link stammt aus einer unbekannten Version des Spiels.',
  shareErrInvalid: 'Das geteilte Level ist ungültig.',
  shareErrUnsolvable: 'Dieses Level ist nicht lösbar.',
  titleEndless: 'Endlos',
  titleEndlessLevel: 'Level {n}',
  endlessRising: 'Steigend',
  stageLabel: 'Stufe {n}',
  // Laden / Fehler
  loading: 'Level wird erstellt …',
  loadFailed: 'Das Level konnte nicht erstellt werden.',
  retry: 'Erneut versuchen',
  // Tipps
  hintVehicle: 'Tipp: das {color} Fahrzeug',
  hintNone: 'Kein Weg mehr zum Sieg – nimm einen Zug zurück.',
  hintBusy: 'Tipp wird berechnet …',
  hintFailed: 'Tipp nicht verfügbar.',
  // Ansagen
  annBlockedQueue: 'Keine freie Halteposition',
  annBlockedLocked: '{vehicle} ist gesperrt',
  annBlockedPath: '{vehicle} ist blockiert',
  annExited: '{vehicle} fährt zur Halteposition {n}',
  annBoarded: '{passenger} steigt in Halteposition {n} ein',
  annDeparted: '{vehicle} ist voll und fährt ab',
  annUnlocked: '{vehicle} ist entsperrt',
  annRestored: 'Zug zurückgenommen',
  annShuffled: 'Fahrgäste gemischt',
  annSlotAdded: 'Zusätzlicher Halteplatz',
  annWon: 'Geschafft! {stars} von 3 Sternen in {moves} Zügen',
  annVehicleGeneric: 'Fahrzeug',
  vehicleLabel: '{vehicle}, Reihe {row}, Spalte {col}, fährt nach {dir}',
  dirN: 'oben',
  dirS: 'unten',
  dirE: 'rechts',
  dirW: 'links',
  // Levelauswahl
  appName: 'ParKing',
  settings: 'Einstellungen',
  dailyTitle: 'Tageslevel',
  dailyDone: 'Heute geschafft',
  dailyStreak: 'Serie: {n} Tage',
  dailyStreak_one: 'Serie: 1 Tag',
  endlessTitle: 'Endlos',
  endlessRecordLine: 'Rekord: {n}',
  holdTitle: 'Stufe halten',
  holdText: 'Endlos & „Ähnliches Level“ bleiben auf Stufe {n}.',
  holdStages: 'Stufe wählen',
  starsCount: '{n} / {total} Sterne',
  tileOpen: 'Level {n}',
  tileDone: 'Level {n}, {stars} von 3 Sternen',
  tileDone_one: 'Level {n}, 1 von 3 Sternen',
  tileLocked: 'Level {n}, gesperrt',
  levelsHeading: 'Level',
  world2: 'Welt 2',
  world2Soon: 'Bald verfügbar',
  noStorage: 'Fortschritt wird in diesem Browser nicht gespeichert',
  dismiss: 'Schließen',
  // Einstellungen
  settingsTitle: 'Einstellungen',
  language: 'Sprache',
  langDe: 'Deutsch',
  langEn: 'English',
  sound: 'Ton',
  soundSoon: 'bald',
  motion: 'Bewegung reduzieren',
  motionSystem: 'System',
  motionOn: 'An',
  motionOff: 'Aus',
  exportProgress: 'Fortschritt exportieren',
  importProgress: 'Fortschritt importieren',
  importOk: 'Fortschritt importiert.',
  importFail: 'Datei ist kein gültiger Spielstand.',
  resetProgress: 'Fortschritt zurücksetzen',
  resetConfirm: 'Wirklich alles zurücksetzen? Das kann nicht rückgängig gemacht werden.',
  resetDo: 'Zurücksetzen',
  cancel: 'Abbrechen',
  close: 'Schließen',
  importChoose: 'Wie soll die Datei eingespielt werden?',
  importMerge: 'Zusammenführen',
  importReplace: 'Ersetzen',
  importReplaceWarn:
    'Achtung: „Ersetzen“ überschreibt deinen aktuellen Fortschritt. Er geht verloren.',
  shareResult: 'Ergebnis teilen',
  shareCopied: 'Kopiert',
  shareManual: 'Zum Kopieren markieren:',
  shareDaily: 'ParKing {date}: {stars} in {n} Zügen',
  shareDaily_one: 'ParKing {date}: {stars} in 1 Zug',
  shareStreak: 'Serie {streak}',
} as const;

export type StringKey = keyof typeof de;

const en: Record<StringKey, string> = {
  back: 'Back to menu',
  moves: 'Moves',
  movesAria: '{n} moves',
  movesAria_one: '1 move',
  waiting: '{n} waiting',
  nextPassengers: 'Next passengers',
  passengers: 'Passengers',
  slotsTitle: 'Parking spots {used} / {total} taken',
  slotEmpty: 'free',
  slotLocked: 'locked',
  slotFilled: 'Spot {i}: {color}, {filled} of {cap}',
  slotState: 'Spot {i}: {state}',
  board: 'Board',
  vehicles: 'Vehicles',
  powerUps: 'Helpers',
  puUndo: 'Undo',
  puShuffle: 'Shuffle',
  puExtraSlot: '+1 Spot',
  puHonk: 'Horn',
  puHint: 'Hint',
  puLeft: '{label}, {n} left',
  restart: 'Restart',
  winTitle: 'Well done!',
  winSub: 'In {n} moves',
  winSub_one: 'In 1 move',
  next: 'Next',
  toMenu: 'To menu',
  again: 'Retry',
  similar: 'Similar level',
  generating: 'Creating …',
  loseQueueFull: 'No room left',
  loseNoMoves: 'No moves left',
  loseMovesLimit: 'Out of moves',
  loseTimeUp: 'Time is up',
  loseUndo: 'Undo',
  stars: '{n} of 3 stars',
  stars_one: '1 of 3 stars',
  endlessOver: 'Run over',
  endlessScore: '{n} levels cleared',
  endlessScore_one: '1 level cleared',
  endlessRecord: 'New record!',
  endlessNewRun: 'New run',
  worldName1: 'Workshop',
  worldLabel: 'World {n} · {name}',
  levelLabel: 'Level {n}',
  titleSimilar: 'Similar to level {n}',
  titleDaily: 'Daily level',
  titleShared: 'Shared level',
  titleSharedBy: 'Shared by {author}',
  sharedUnchecked: 'Unchecked level – it may not be solvable.',
  shareErrBroken: 'The link is broken or incomplete.',
  shareErrTooLong: 'The link is too long for a shared level.',
  shareErrVersion: 'This link comes from an unknown version of the game.',
  shareErrInvalid: 'The shared level is invalid.',
  shareErrUnsolvable: 'This level cannot be solved.',
  titleEndless: 'Endless',
  titleEndlessLevel: 'Level {n}',
  endlessRising: 'Rising',
  stageLabel: 'Stage {n}',
  loading: 'Creating level …',
  loadFailed: 'The level could not be created.',
  retry: 'Try again',
  hintVehicle: 'Hint: the {color} vehicle',
  hintNone: 'No way to win any more – take back a move.',
  hintBusy: 'Working out a hint …',
  hintFailed: 'Hint not available.',
  annBlockedQueue: 'No free parking spot',
  annBlockedLocked: '{vehicle} is locked',
  annBlockedPath: '{vehicle} is blocked',
  annExited: '{vehicle} drives to spot {n}',
  annBoarded: '{passenger} boards at spot {n}',
  annDeparted: '{vehicle} is full and leaves',
  annUnlocked: '{vehicle} is unlocked',
  annRestored: 'Move taken back',
  annShuffled: 'Passengers shuffled',
  annSlotAdded: 'Extra parking spot',
  annWon: 'Well done! {stars} of 3 stars in {moves} moves',
  annVehicleGeneric: 'Vehicle',
  vehicleLabel: '{vehicle}, row {row}, column {col}, heading {dir}',
  dirN: 'up',
  dirS: 'down',
  dirE: 'right',
  dirW: 'left',
  appName: 'ParKing',
  settings: 'Settings',
  dailyTitle: 'Daily level',
  dailyDone: 'Done today',
  dailyStreak: 'Streak: {n} days',
  dailyStreak_one: 'Streak: 1 day',
  endlessTitle: 'Endless',
  endlessRecordLine: 'Record: {n}',
  holdTitle: 'Hold stage',
  holdText: 'Endless & “Similar level” stay on stage {n}.',
  holdStages: 'Choose stage',
  starsCount: '{n} / {total} stars',
  tileOpen: 'Level {n}',
  tileDone: 'Level {n}, {stars} of 3 stars',
  tileDone_one: 'Level {n}, 1 of 3 stars',
  tileLocked: 'Level {n}, locked',
  levelsHeading: 'Levels',
  world2: 'World 2',
  world2Soon: 'Coming soon',
  noStorage: 'Progress is not saved in this browser',
  dismiss: 'Dismiss',
  settingsTitle: 'Settings',
  language: 'Language',
  langDe: 'Deutsch',
  langEn: 'English',
  sound: 'Sound',
  soundSoon: 'soon',
  motion: 'Reduce motion',
  motionSystem: 'System',
  motionOn: 'On',
  motionOff: 'Off',
  exportProgress: 'Export progress',
  importProgress: 'Import progress',
  importOk: 'Progress imported.',
  importFail: 'That file is not a valid save.',
  resetProgress: 'Reset progress',
  resetConfirm: 'Really reset everything? This cannot be undone.',
  resetDo: 'Reset',
  cancel: 'Cancel',
  close: 'Close',
  importChoose: 'How should the file be imported?',
  importMerge: 'Merge',
  importReplace: 'Replace',
  importReplaceWarn: 'Warning: "Replace" overwrites your current progress. It will be lost.',
  shareResult: 'Share result',
  shareCopied: 'Copied',
  shareManual: 'Select to copy:',
  shareDaily: 'ParKing {date}: {stars} in {n} moves',
  shareDaily_one: 'ParKing {date}: {stars} in 1 move',
  shareStreak: 'streak {streak}',
};

const DICTS: Record<Lang, Record<StringKey, string>> = { de, en };

type OneKey = Extract<StringKey, `${string}_one`>;
export type PluralKey = OneKey extends `${infer B}_one` ? Extract<B, StringKey> : never;
export type Vars = Record<string, string | number>;

let current: Lang = DEFAULT_LANG;
const listeners = new Set<(lang: Lang) => void>();

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  for (const l of [...listeners]) l(lang);
}

/** Meldet einen Listener fuer Sprachwechsel an; gibt die Abmeldefunktion zurueck. */
export function onLanguageChange(cb: (lang: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Browser-Sprache ("de-AT", "en-US" ...) auf eine unterstuetzte Sprache abbilden. */
export function detectLanguage(navigatorLanguage: string | undefined): Lang {
  const base = (navigatorLanguage ?? '').slice(0, 2).toLowerCase();
  return LANGS.find((l) => l === base) ?? DEFAULT_LANG;
}

/** Override aus den Einstellungen ('auto' = Browser-Sprache). */
export function resolveLanguage(override: Lang | 'auto', navigatorLanguage?: string): Lang {
  return override === 'auto' ? detectLanguage(navigatorLanguage) : override;
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name];
    return v === undefined ? m : String(v);
  });
}

export function t(key: StringKey, vars?: Vars): string {
  return fill(DICTS[current][key], vars);
}

/** Zahlform: `${key}_one` bei n === 1, sonst `key`. `{n}` wird automatisch gesetzt. */
export function tn(key: PluralKey, n: number, vars?: Vars): string {
  const one = `${key}_one` as StringKey;
  return t(n === 1 ? one : key, { n, ...vars });
}

/** Alle Keys einer Sprache (fuer Tests auf Vollstaendigkeit). */
export function dictionary(lang: Lang): Readonly<Record<StringKey, string>> {
  return DICTS[lang];
}
