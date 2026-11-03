// Spiel-Session: verbindet Controller, Modus (Kampagne, Tageslevel, Endlos, Aehnliches Level),
// Fortschritt, Tipps und Level-Generierung. Kennt kein DOM und keinen Renderer.
import { resolveRules } from '../schema';
import type { Level, ResolvedRules, RulesetOverrides, ShareError } from '../schema';
import type { GameState } from '../engine/types';
import { getLanguage, t } from '../i18n';
import type { GeneratorParams } from '../solver/types';
import type { EngineApi } from './engine-port';
import { formatDay } from './format';
import { GameController } from './game-controller';
import { HintTracker, displayStars } from './hints';
import type { Campaign, CampaignLevel } from './levels';
import { Progress, localDateKey } from './progress';
import type { PlayRoute, Route } from './router';
import { dailySeed, endlessSeed, hashString, similarSeed } from './seed';
import { decodeLevel } from './share';
import { makeSimilarLevel } from './similar-level';
import type { SolverPort } from './solver-port';
import {
  GENERATE_MAX_ATTEMPTS,
  SIMILAR_DIFFICULTY_TOLERANCE,
  clampStage,
  dailyStage,
  difficultyRange,
  endlessStage,
  stageShape,
} from './stages';

const DEFAULT_RULESET = 'classic';
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

export class GameSession {
  readonly hints: HintTracker;
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
          const rules = this.deps.campaign.rulesOf(DEFAULT_RULESET);
          const level = await this.generateDaily(date, rules);
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
    let base: ResolvedRules;
    try {
      base = this.deps.campaign.rulesOf(id);
    } catch {
      return null;
    }
    if (!overrides) return base;
    return resolveRules({ ...base, schema: 'parking.ruleset/1', id, name: id }, overrides);
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
        return this.goCampaign(this.deps.campaign.after(mode.entry));
      case 'similar':
        return this.goCampaign(mode.origin ? this.deps.campaign.after(mode.origin) : undefined);
      case 'daily':
      case 'shared':
        this.deps.exit();
        return;
      case 'endless':
        return this.nextEndless(mode.run);
    }
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
    const rules = this.controller.getRules();
    const { progress } = this.deps;
    const counter = progress.nextSimilarCounter();
    const hold = progress.get().hold;

    const difficulty = cur.meta?.difficulty ?? 0;
    const shape = hold.enabled
      ? stageShape(hold.stage)
      : {
          width: cur.grid.width,
          height: cur.grid.height,
          vehicleCount: cur.vehicles.length,
          colorCount: distinctColors(cur).length,
        };
    const colors = hold.enabled
      ? rules.vehicles.colors.slice(0, shape.colorCount)
      : distinctColors(cur);
    const target: [number, number] = hold.enabled
      ? difficultyRange(hold.stage)
      : [
          Math.max(0, difficulty - SIMILAR_DIFFICULTY_TOLERANCE),
          Math.min(MAX_DIFFICULTY, difficulty + SIMILAR_DIFFICULTY_TOLERANCE),
        ];
    const params: GeneratorParams = {
      seed: similarSeed(cur.id, counter),
      width: shape.width,
      height: shape.height,
      vehicleCount: shape.vehicleCount,
      colors,
      targetDifficulty: target,
      maxAttempts: GENERATE_MAX_ATTEMPTS,
      id: `${baseId(cur.id)}-s${counter}`,
      ruleset: cur.ruleset,
      title: cur.title,
    };

    let level: Level;
    try {
      const res = await this.deps.solver.generate(params, rules, { signal: this.abort.signal });
      level = cur.overrides ? { ...res.level, overrides: cur.overrides } : res.level;
    } catch {
      if (this.disposed) return;
      level = makeSimilarLevel(cur, rules.vehicles.colors, counter);
    }
    if (this.disposed) return;
    const origin = mode.kind === 'campaign' ? mode.entry : mode.origin;
    this.mode = { kind: 'similar', origin };
    this.install(level, rules, true);
  }

  // --- Tageslevel ---

  private async generateDaily(date: string, rules: ResolvedRules): Promise<Level> {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const stage = dailyStage(new Date(y, m - 1, d));
    const shape = stageShape(stage);
    const res = await this.deps.solver.generate(
      {
        seed: dailySeed(date),
        width: shape.width,
        height: shape.height,
        vehicleCount: shape.vehicleCount,
        colors: rules.vehicles.colors.slice(0, shape.colorCount),
        targetDifficulty: difficultyRange(stage),
        maxAttempts: GENERATE_MAX_ATTEMPTS,
        id: `daily-${date.replaceAll('-', '')}`,
        ruleset: DEFAULT_RULESET,
        title: { de: `Tageslevel ${date}`, en: `Daily level ${date}` },
      },
      rules,
      { signal: this.abort.signal },
    );
    return res.level;
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
    const rules = this.deps.campaign.rulesOf(DEFAULT_RULESET);
    const level = await this.generateEndless(run, rules, null);
    if (this.disposed) return;
    this.install(level, rules, true);
  }

  private async nextEndless(run: EndlessRun): Promise<void> {
    run.number += 1;
    const prev = this.controller.getLevel();
    const rules = this.controller.getRules();
    const level = await this.generateEndless(run, rules, prev);
    if (this.disposed) return;
    this.install(level, rules, true);
  }

  /** Ohne `fallbackFrom` wirft ein Fehler; sonst wird eine Variante des Vorgaengers gespielt. */
  private async generateEndless(
    run: EndlessRun,
    rules: ResolvedRules,
    fallbackFrom: Level | null,
  ): Promise<Level> {
    const hold = this.deps.progress.get().hold;
    const stage = hold.enabled ? clampStage(hold.stage) : endlessStage(run.number);
    run.stage = stage;
    const shape = stageShape(stage);
    try {
      const res = await this.deps.solver.generate(
        {
          seed: endlessSeed(run.seed, run.number),
          width: shape.width,
          height: shape.height,
          vehicleCount: shape.vehicleCount,
          colors: rules.vehicles.colors.slice(0, shape.colorCount),
          targetDifficulty: difficultyRange(stage),
          maxAttempts: GENERATE_MAX_ATTEMPTS,
          id: `e-${run.seed.toString(36)}-${run.number}`,
          ruleset: DEFAULT_RULESET,
          title: { de: `Endlos ${run.number}`, en: `Endless ${run.number}` },
        },
        rules,
        { signal: this.abort.signal },
      );
      return res.level;
    } catch (err) {
      if (!fallbackFrom || this.disposed) throw err;
      return makeSimilarLevel(fallbackFrom, rules.vehicles.colors, run.number);
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
          world: worldTitle(mode.entry.pack),
          level: t('levelLabel', { n: mode.entry.number }),
        };
      case 'similar':
        return {
          world: mode.origin ? worldTitle(mode.origin.pack) : t('similar'),
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

  dialogInfo(state: GameState): SessionDialogInfo {
    const mode = this.mode;
    const { campaign } = this.deps;
    const stars = displayStars(state.stars, this.hints.used());
    let hasNext = true;
    if (mode?.kind === 'campaign') hasNext = campaign.after(mode.entry) !== undefined;
    else if (mode?.kind === 'similar') hasNext = !!mode.origin && !!campaign.after(mode.origin);
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

function worldTitle(pack: string): string {
  const n = Number(pack) || 1;
  return t('worldLabel', { n, name: n === 1 ? t('worldName1') : '' }).replace(/ · $/, '');
}
