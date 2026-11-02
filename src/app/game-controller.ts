import type { Level, ResolvedRules } from '../schema';
import type { Action, GameEvent, GameState } from '../engine/types';
import type { EngineApi } from './engine-port';
import { makeSimilarLevel } from './similar-level';

export interface ControllerUpdate {
  /** 'new': frisch aufgebautes Spiel (Start, Neustart, naechstes Level); 'step': Ergebnis einer Aktion. */
  kind: 'new' | 'step';
  state: GameState;
  level: Level;
  events: GameEvent[];
}

export type ControllerListener = (update: ControllerUpdate) => void;

export interface ControllerOptions {
  engine: EngineApi;
  /** Reihenfolge der spielbaren Level; "Weiter" geht zum naechsten, nach dem letzten zu einer Variante. */
  levels: Level[];
  rules: ResolvedRules;
  startIndex?: number;
}

export class GameController {
  private readonly engine: EngineApi;
  private readonly levels: Level[];
  private readonly rules: ResolvedRules;
  private readonly listeners = new Set<ControllerListener>();
  private index: number;
  private level: Level;
  private state: GameState;
  private variant = 0;

  constructor(opts: ControllerOptions) {
    const first = opts.levels[opts.startIndex ?? 0];
    if (!first) throw new Error('Keine Level vorhanden');
    this.engine = opts.engine;
    this.levels = opts.levels;
    this.rules = opts.rules;
    this.index = opts.startIndex ?? 0;
    this.level = first;
    this.state = this.engine.createGame(first, this.rules);
  }

  getState(): GameState {
    return this.state;
  }

  getLevel(): Level {
    return this.level;
  }

  getRules(): ResolvedRules {
    return this.rules;
  }

  /** Meldet den Listener an. Gibt die Abmeldefunktion zurueck. */
  subscribe(listener: ControllerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sendet den aktuellen Zustand als 'new' an alle Listener (Initialaufbau). */
  start(): void {
    this.emit({ kind: 'new', state: this.state, level: this.level, events: [] });
  }

  dispatch(action: Action): GameEvent[] {
    const result = this.engine.step(this.state, action, this.rules);
    this.state = result.state;
    this.emit({ kind: 'step', state: this.state, level: this.level, events: result.events });
    return result.events;
  }

  restart(): void {
    this.load(this.level);
  }

  /** Naechstes Level der Liste, nach dem letzten eine Variante des aktuellen. */
  next(): void {
    if (this.index + 1 < this.levels.length) {
      this.index += 1;
      const lvl = this.levels[this.index];
      if (lvl) this.load(lvl);
    } else {
      this.similar();
    }
  }

  similar(): void {
    this.variant += 1;
    this.load(makeSimilarLevel(this.level, this.rules.vehicles.colors, this.variant));
  }

  private load(level: Level): void {
    this.level = level;
    this.state = this.engine.createGame(level, this.rules);
    this.emit({ kind: 'new', state: this.state, level, events: [] });
  }

  private emit(update: ControllerUpdate): void {
    for (const l of [...this.listeners]) l(update);
  }
}
