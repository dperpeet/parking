import type { Level, ResolvedRules } from '../schema';
import type { Action, GameEvent, GameState } from '../engine/types';
import type { EngineApi } from './engine-port';

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
  level: Level;
  rules: ResolvedRules;
}

/** Haelt Level, Regeln und Engine-Zustand des laufenden Spiels. Welches Level als naechstes kommt, entscheidet die Session. */
export class GameController {
  private readonly engine: EngineApi;
  private readonly listeners = new Set<ControllerListener>();
  private level: Level;
  private rules: ResolvedRules;
  private state: GameState;

  constructor(opts: ControllerOptions) {
    this.engine = opts.engine;
    this.level = opts.level;
    this.rules = opts.rules;
    this.state = this.engine.createGame(opts.level, opts.rules);
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
    this.load(this.level, this.rules);
  }

  /** Startet ein anderes Level (mit seinen Regeln). */
  load(level: Level, rules: ResolvedRules): void {
    this.level = level;
    this.rules = rules;
    this.state = this.engine.createGame(level, rules);
    this.emit({ kind: 'new', state: this.state, level, events: [] });
  }

  private emit(update: ControllerUpdate): void {
    for (const l of [...this.listeners]) l(update);
  }
}
