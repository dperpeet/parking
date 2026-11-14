// Spiel-Session: verbindet Controller, Modus (Kampagne, Tageslevel, Endlos, Aehnliches Level),
// Fortschritt, Tipps und Level-Generierung. Kennt kein DOM und keinen Renderer.
import type { Level, Mechanic, ResolvedRules, RulesetOverrides, ShareError } from '../schema';
import type { GameState } from '../engine/types';
import { getLanguage, t } from '../i18n';
import type { GeneratorOptions } from '../solver/types';
import type { EngineApi } from './engine-port';
import { formatDay, localizedText } from './format';
import { GameController } from './game-controller';
import { HintTracker, displayStars } from './hints';
import { HonkGuide } from './honk-guide';
import type { Campaign, CampaignLevel } from './levels';
import { Progress, localDateKey } from './progress';
import type { PlayRoute, Route } from './router';
import type { DailyShareData } from './daily-share';
import { dailySeed, endlessSeed, hashString, similarSeed } from './seed';
import { decodeLevel } from './share';
import { makeSimilarLevel } from './similar-level';
import type { SolverPort } from './solver-port';
import {
  GENERATE_MAX_ATTEMPTS,
  SIMILAR_DIFFICULTY_TOLERANCE,
  STAGE_KEY_CHAIN_DEPTH,
  clampStage,
  dailyStage,
  endlessStage,
  stageParams,
  stageShape,
} from './stages';
import { nextCampaignLevel } from './unlock';

/** Hoechste Schwierigkeit auf der 0-10-Skala. */
const MAX_DIFFICULTY = 10;
const RUN_SEED_MASK = 0xffffff;

export type SessionStatus = 'loading' | 'ready' | 'error' | 'notFound';

export interface SessionDeps {
  engine: EngineApi;
  solver: SolverPort;
  progress: Progress;
  campaign: Campaign;
  now: () => Date;
  /** Passt die Adresse an, wenn die Session von selbst das Level wechselt (kein Verlaufseintrag). */
  syncRoute: (route: Route) => void;
  /** Zurueck zur Levelauswahl. */
  exit: () => void;
}

interface EndlessRun {
  seed: number;
  number: number;
  score: number;
  stage: number;
  previousBest: number;
}

type Mode =
  | { kind: 'campaign'; entry: CampaignLevel }
  | { kind: 'similar'; origin: CampaignLevel | null }
  | { kind: 'daily'; date: string }
  | { kind: 'endless'; run: EndlessRun }
  | { kind: 'shared'; info: SharedInfo };

/** Fehlerursache eines geteilten Levels. */
export type SharedError = ShareError | 'unsolvable';

export interface SharedInfo {
  /** Mit `u: 1` geteilt, also vom Absender nicht als loesbar bestaetigt. */
  unchecked: boolean;
  /** Die Analyse hat ihr Zustandslimit erreicht, Loesbarkeit unbekannt. */
  truncated: boolean;
  author: string | null;
}

export interface SessionTitle {
  world: string;
  level: string;
}

export interface SessionDialogInfo {
  stars: number;
  nextLabel: string;
  showSimilar: boolean;
  endless: { score: number; record: boolean } | null;
}

/** Id-Teile eines Levels ohne Varianten-Suffix ("w1-07-s3" -> "w1-07"). */
function baseId(id: string): string {
  return id.replace(/(-s\d+)+$/, '');
}

function localized(text: Level['title']): string {
  return typeof text === 'string' ? text : text[getLanguage()];
}

function distinctColors(level: Level): string[] {
  return [...new Set(level.vehicles.map((v) => v.color))];
}

/** Laenge der laengsten Schluesselkette (Schloss -> Schluessel -> ...), mindestens 1. */
function keyChainDepth(level: Level): number {
  const keyOf = new Map(
    level.vehicles.filter((v) => v.locked && v.keyId).map((v) => [v.id, v.keyId]),
  );
  let max = STAGE_KEY_CHAIN_DEPTH;
  for (const id of keyOf.keys()) {
    let depth = 0;
    const seen = new Set<string>();
    for (let cur: string | undefined = id; cur && keyOf.has(cur) && !seen.has(cur);) {
      seen.add(cur);
      depth += 1;
      cur = keyOf.get(cur);
    }
    max = Math.max(max, depth);
  }
  return max;
}

/**
 * Mechaniken, die ein Level einsetzt (Poller als `fixed`-Zellen, Schluessel als gesperrte Fahrzeuge,
 * Mystery als Fahrzeuge mit `mystery`, Abbiegepfeile als `oneWay`-Zellen).
 */
export function mechanicsOf(level: Level): Mechanic[] {
  const out: Mechanic[] = [];
  if (level.grid.cells.some((c) => c.type === 'fixed')) out.push('bollards');
  if (level.vehicles.some((v) => v.locked)) out.push('keys');
  if (level.vehicles.some((v) => v.mystery === true)) out.push('mystery');
  if (level.grid.cells.some((c) => c.type === 'oneWay')) out.push('oneWay');
  return out;
}

export class GameSession {
  readonly hints: HintTracker;
  /** Proaktiver Hupen-Hinweis (kein Tipp, zaehlt nicht). */
  readonly honkGuide: HonkGuide;
  private controllerRef: GameController | null = null;
  private mode: Mode | null = null;
  private status: SessionStatus = 'loading';
  private recorded = false;
  private shareError: SharedError | null = null;
  private disposed = false;
  private readonly abort = new AbortController();
  private readonly statusListeners = new Set<(s: SessionStatus) => void>();
  private runCounter = 0;

  constructor(
    private readonly deps: SessionDeps,
    private readonly route: PlayRoute,
  ) {
    this.hints = new HintTracker(deps.solver);
    this.honkGuide = new HonkGuide(deps.solver);
  }

  get controller(): GameController {
    if (!this.controllerRef) throw new Error('Session ist noch nicht gestartet');
    return this.controllerRef;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  onStatus(cb: (s: SessionStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
  }

  private setStatus(s: SessionStatus): void {
    this.status = s;
    for (const cb of [...this.statusListeners]) cb(s);
  }

  /** Laedt das erste Level. Kampagne sofort, Tageslevel und Endlos ueber den Generator. */
  async start(): Promise<SessionStatus> {
    this.setStatus('loading');
    try {
      switch (this.route.name) {
        case 'level': {
          const entry = this.deps.campaign.find(this.route.pack, this.route.id);
          if (!entry) {
            this.setStatus('notFound');
            return this.status;
          }
          this.mode = { kind: 'campaign', entry };
          this.install(entry.level, entry.rules, true);
          break;
        }
        case 'daily': {
          const date = localDateKey(this.deps.now());
          this.mode = { kind: 'daily', date };
          const { level, rules } = await this.generateDaily(date);
          this.install(level, rules, true);
          break;
        }
        case 'endless':
          await this.startRun();
          break;
        case 'shared':
          await this.startShared(this.route.code);
          break;
      }
    } catch {
      if (!this.disposed) this.setStatus('error');
      return this.status;
    }
    if (!this.disposed) this.setStatus(this.shareError ? 'error' : 'ready');
    return this.status;
  }

  // --- Geteiltes Level ---

  /** Dekodiert den Code und laesst den Solver die Loesbarkeit pruefen. Fehler stehen in `errorReason()`. */
  private async startShared(code: string): Promise<void> {
    const res = decodeLevel(code, (id, overrides) => this.rulesWithOverrides(id, overrides));
    if (!res.ok) {
      this.shareError = res.error;
      return;
    }
    const analysis = await this.deps.solver.analyze(res.level, res.rules, {
      signal: this.abort.signal,
    });
    if (this.disposed) return;
    if (!analysis.solvable && !analysis.truncated) {
      this.shareError = 'unsolvable';
      return;
    }
    this.mode = {
      kind: 'shared',
      info: { unchecked: res.unchecked, truncated: analysis.truncated, author: res.author },
    };
    this.install(res.level, res.rules, true);
  }

  /** Regeln eines Rulesets mit Overrides; null bei unbekanntem Ruleset. */
  private rulesWithOverrides(id: string, overrides?: RulesetOverrides): ResolvedRules | null {
    try {
      return this.deps.campaign.rulesOf(id, overrides);
    } catch {
      return null;
    }
  }

  /** Warum das geteilte Level nicht gespielt werden kann (Status `error`); sonst null. */
  errorReason(): SharedError | null {
    return this.shareError;
  }

  /** Hinweise zum geteilten Level (null in allen anderen Modi). */
  sharedInfo(): SharedInfo | null {
    return this.mode?.kind === 'shared' ? this.mode.info : null;
  }

  // --- Level installieren ---

  private install(level: Level, rules: ResolvedRules, fresh: boolean): void {
    this.recorded = false;
    this.hints.begin(level.id, fresh);
    this.honkGuide.begin(level.id);
    if (this.controllerRef) {
      this.controllerRef.load(level, rules);
    } else {
      this.controllerRef = new GameController({ engine: this.deps.engine, level, rules });
      this.controllerRef.subscribe((u) => {
        if (u.kind === 'step') this.onStep(u.state);
      });
    }
  }

  private onStep(state: GameState): void {
    if (state.status !== 'won' || this.recorded || !this.mode) return;
    this.recorded = true;
    const stars = displayStars(state.stars, this.hints.used());
    const { progress } = this.deps;
    const mode = this.mode;
    switch (mode.kind) {
      case 'campaign':
        progress.recordLevel(mode.entry.key, {
          stars,
          moves: state.moves,
          stage: mode.entry.stage,
        });
        break;
      case 'daily':
        progress.recordDaily(mode.date, { stars, moves: state.moves });
        break;
      case 'endless':
        mode.run.score += 1;
        progress.recordEndless(mode.run.score, mode.run.stage);
        break;
      case 'similar':
        break; // Generierte Level zaehlen nicht zum Kampagnenfortschritt.
      case 'shared':
        break; // Geteilte Level zaehlen nicht zum Fortschritt.
    }
  }

  // --- Aktionen aus dem HUD ---

  restart(): void {
    const fresh = this.controller.getState().status === 'won';
    this.recorded = false;
    this.hints.begin(this.controller.getLevel().id, fresh);
    this.honkGuide.begin(this.controller.getLevel().id);
    this.controller.restart();
  }

  /** "Nochmal": im Endlos-Run nach der Niederlage ein neuer Run, sonst das Level wiederholen. */
  again(): Promise<void> | void {
    if (this.mode?.kind === 'endless' && this.controller.getState().status === 'lost') {
      return this.startRun().catch(() => this.setStatus('error'));
    }
    this.restart();
  }

  /** "Weiter". Gibt ein Promise zurueck, solange ein Level erzeugt wird. */
  next(): Promise<void> | void {
    const mode = this.mode;
    if (!mode) return;
    switch (mode.kind) {
      case 'campaign':
        return this.goCampaign(this.successor(mode.entry));
      case 'similar':
        return this.goCampaign(mode.origin ? this.successor(mode.origin) : undefined);
      case 'daily':
      case 'shared':
        this.deps.exit();
        return;
      case 'endless':
        return this.nextEndless(mode.run);
    }
  }

  /** Naechstes Level; nach dem letzten Level einer Welt Level 1 der naechsten, sofern freigeschaltet. */
  private successor(entry: CampaignLevel): CampaignLevel | undefined {
    return nextCampaignLevel(this.deps.campaign, this.deps.progress.get().levels, entry);
  }

  // --- Intro-Karten ---

  /** Mechanik, deren Intro-Karte vor dem aktuellen Level noch nicht gezeigt wurde. */
  pendingIntro(): Mechanic | null {
    const mode = this.mode;
    if (mode?.kind === 'campaign') {
      const intro = mode.entry.intro;
      return intro && !this.deps.progress.hasSeenIntro(intro) ? intro : null;
    }
    // Generierte Level (Tageslevel, Endlos, Aehnliches Level) zeigen die Karte bei der ersten Mechanik.
    if (mode?.kind === 'daily' || mode?.kind === 'endless' || mode?.kind === 'similar') {
      const level = this.controllerRef?.getLevel();
      return level
        ? (mechanicsOf(level).find((m) => !this.deps.progress.hasSeenIntro(m)) ?? null)
        : null;
    }
    return null;
  }

  /** Das Level fuehrt die Hupe ein (Intro `honk`): der Hupen-Tipp erscheint dort von selbst. */
  guidedHonk(): boolean {
    return this.mode?.kind === 'campaign' && this.mode.entry.intro === 'honk';
  }

  /** Fahrzeuge, deren Hupe die Engine annehmen wuerde (Probe auf dem unveraenderten Zustand). */
  honkTargets(state: GameState): string[] {
    const rules = this.controller.getRules();
    return state.vehicles
      .filter((v) => v.status === 'parked')
      .filter((v) => {
        const action = { type: 'usePowerUp', powerUp: 'honk', vehicleId: v.id } as const;
        const { events } = this.deps.engine.step(state, action, rules);
        return !events.some((e) => e.type === 'invalidAction');
      })
      .map((v) => v.id);
  }

  markIntroSeen(mechanic: Mechanic): void {
    this.deps.progress.markIntroSeen(mechanic);
  }

  private goCampaign(entry: CampaignLevel | undefined): void {
    if (!entry) {
      this.deps.exit();
      return;
    }
    this.mode = { kind: 'campaign', entry };
    this.install(entry.level, entry.rules, true);
    this.deps.syncRoute({ name: 'level', pack: entry.pack, id: entry.fileId });
  }

  // --- Aehnliches Level ---

  /** Erzeugt ein Level mit gleicher Form und Schwierigkeit; bei Fehler/Zeitueberschreitung eine Variante. */
  async similar(): Promise<void> {
    const mode = this.mode;
    if (!mode || (mode.kind !== 'campaign' && mode.kind !== 'similar')) return;
    const cur = this.controller.getLevel();
    const { progress } = this.deps;
    const counter = progress.nextSimilarCounter();
    const hold = progress.get().hold;

    const difficulty = cur.meta?.difficulty ?? 0;
    let params: GeneratorOptions;
    let rules = this.controller.getRules();
    let overrides = cur.overrides;
    if (hold.enabled) {
      const shape = stageShape(hold.stage);
      // Wechselt die Stufe das Ruleset, gelten dessen Regeln ohne die Overrides des Ausgangslevels.
      if (shape.ruleset !== cur.ruleset) {
        rules = this.deps.campaign.rulesOf(shape.ruleset);
        overrides = undefined;
      }
      params = this.stageParams(clampStage(hold.stage), rules, {
        seed: similarSeed(cur.id, counter),
        id: `${baseId(cur.id)}-s${counter}`,
        title: cur.title,
      });
    } else {
      // Mechanik und Ruleset des Ausgangslevels bleiben erhalten (Anzahl Poller/Schluessel wie dort).
      const bollards = cur.grid.cells.filter((c) => c.type === 'fixed').length;
      const keys = cur.vehicles.filter((v) => v.locked).length;
      params = {
        seed: similarSeed(cur.id, counter),
        width: cur.grid.width,
        height: cur.grid.height,
        vehicleCount: cur.vehicles.length,
        colors: distinctColors(cur),
        targetDifficulty: [
          Math.max(0, difficulty - SIMILAR_DIFFICULTY_TOLERANCE),
          Math.min(MAX_DIFFICULTY, difficulty + SIMILAR_DIFFICULTY_TOLERANCE),
        ],
        maxAttempts: GENERATE_MAX_ATTEMPTS,
        id: `${baseId(cur.id)}-s${counter}`,
        ruleset: cur.ruleset,
        title: cur.title,
        bollards,
        keys,
        ...(keys > 0 ? { keyChainDepth: keyChainDepth(cur) } : {}),
      };
    }
    let level: Level;
    try {
      const res = await this.deps.solver.generate(params, rules, { signal: this.abort.signal });
      level = overrides ? { ...res.level, overrides } : res.level;
    } catch {
      if (this.disposed) return;
      rules = this.controller.getRules();
      level = makeSimilarLevel(cur, rules.vehicles.colors, counter);
    }
    if (this.disposed) return;
    const origin = mode.kind === 'campaign' ? mode.entry : mode.origin;
    this.mode = { kind: 'similar', origin };
    this.install(level, rules, true);
  }

  // --- Tageslevel ---

  /** Generator-Parameter einer Stufe (Grundvariante): Form, Zielbereich, Ruleset, Poller und Schluessel. */
  private stageParams(
    stage: number,
    rules: ResolvedRules,
    extra: { seed: number; id: string; title: Level['title'] },
  ): GeneratorOptions {
    return stageParams(stage, stageShape(stage), rules.vehicles.colors, extra);
  }

  // --- Tageslevel ---

  private async generateDaily(date: string): Promise<{ level: Level; rules: ResolvedRules }> {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const stage = dailyStage(new Date(y, m - 1, d));
    const rules = this.deps.campaign.rulesOf(stageShape(stage).ruleset);
    const res = await this.deps.solver.generate(
      this.stageParams(stage, rules, {
        seed: dailySeed(date),
        id: `daily-${date.replaceAll('-', '')}`,
        title: { de: `Tageslevel ${date}`, en: `Daily level ${date}` },
      }),
      rules,
      { signal: this.abort.signal },
    );
    return { level: res.level, rules };
  }

  // --- Endlos ---

  private async startRun(): Promise<void> {
    const runSeed = (hashString(String(this.deps.now().getTime())) ^ this.runCounter++) >>> 0;
    const run: EndlessRun = {
      seed: runSeed & RUN_SEED_MASK,
      number: 1,
      score: 0,
      stage: 1,
      previousBest: this.deps.progress.get().endless.best,
    };
    this.mode = { kind: 'endless', run };
    const { level, rules } = await this.generateEndless(run, null);
    if (this.disposed) return;
    this.install(level, rules, true);
  }

  private async nextEndless(run: EndlessRun): Promise<void> {
    run.number += 1;
    const { level, rules } = await this.generateEndless(run, {
      level: this.controller.getLevel(),
      rules: this.controller.getRules(),
    });
    if (this.disposed) return;
    this.install(level, rules, true);
  }

  /**
   * Das Ruleset folgt der Stufe. Ohne `fallbackFrom` wirft ein Fehler; sonst wird eine Variante des
   * Vorgaengers (mit dessen Regeln) gespielt.
   */
  private async generateEndless(
    run: EndlessRun,
    fallbackFrom: { level: Level; rules: ResolvedRules } | null,
  ): Promise<{ level: Level; rules: ResolvedRules }> {
    const hold = this.deps.progress.get().hold;
    const stage = hold.enabled ? clampStage(hold.stage) : endlessStage(run.number);
    run.stage = stage;
    const rules = this.deps.campaign.rulesOf(stageShape(stage).ruleset);
    try {
      const res = await this.deps.solver.generate(
        this.stageParams(stage, rules, {
          seed: endlessSeed(run.seed, run.number),
          id: `e-${run.seed.toString(36)}-${run.number}`,
          title: { de: `Endlos ${run.number}`, en: `Endless ${run.number}` },
        }),
        rules,
        { signal: this.abort.signal },
      );
      return { level: res.level, rules };
    } catch (err) {
      if (!fallbackFrom || this.disposed) throw err;
      return {
        level: makeSimilarLevel(fallbackFrom.level, fallbackFrom.rules.vehicles.colors, run.number),
        rules: fallbackFrom.rules,
      };
    }
  }

  // --- Anzeige ---

  title(): SessionTitle {
    const mode = this.mode;
    const level = this.controllerRef?.getLevel();
    if (!mode || !level) return { world: '', level: '' };
    switch (mode.kind) {
      case 'campaign':
        return {
          world: this.worldTitle(mode.entry),
          level: t('levelLabel', { n: mode.entry.number }),
        };
      case 'similar':
        return {
          world: mode.origin ? this.worldTitle(mode.origin) : t('similar'),
          level: mode.origin ? t('titleSimilar', { n: mode.origin.number }) : t('similar'),
        };
      case 'daily':
        return { world: t('titleDaily'), level: formatDay(mode.date, getLanguage()) };
      case 'endless':
        return {
          world: `${t('titleEndless')} · ${t('stageLabel', { n: mode.run.stage })}`,
          level: t('titleEndlessLevel', { n: mode.run.number }),
        };
      case 'shared':
        return {
          world: mode.info.author
            ? t('titleSharedBy', { author: mode.info.author })
            : t('titleShared'),
          level: localized(level.title),
        };
    }
  }

  private worldTitle(entry: CampaignLevel): string {
    const world = this.deps.campaign.worlds.find((w) => w.pack === entry.pack);
    return t('worldLabel', {
      n: entry.world,
      name: world ? localizedText(world.name, getLanguage()) : '',
    }).replace(/ · $/, '');
  }

  /** Daten fuer "Ergebnis teilen": nur nach einem Sieg im Tageslevel. */
  dailyShare(state: GameState): DailyShareData | null {
    const mode = this.mode;
    if (mode?.kind !== 'daily' || state.status !== 'won') return null;
    return {
      date: mode.date,
      stars: displayStars(state.stars, this.hints.used()),
      moves: state.moves,
      streak: this.deps.progress.currentStreak(mode.date),
    };
  }

  dialogInfo(state: GameState): SessionDialogInfo {
    const mode = this.mode;
    const stars = displayStars(state.stars, this.hints.used());
    let hasNext = true;
    if (mode?.kind === 'campaign') hasNext = this.successor(mode.entry) !== undefined;
    else if (mode?.kind === 'similar') hasNext = !!mode.origin && !!this.successor(mode.origin);
    else if (mode?.kind === 'daily' || mode?.kind === 'shared') hasNext = false;
    return {
      stars,
      nextLabel: hasNext ? t('next') : t('toMenu'),
      showSimilar: mode?.kind === 'campaign' || mode?.kind === 'similar',
      endless:
        mode?.kind === 'endless' && state.status === 'lost'
          ? { score: mode.run.score, record: mode.run.score > mode.run.previousBest }
          : null,
    };
  }
}
