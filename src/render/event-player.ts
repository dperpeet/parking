import type { GameEvent, GameState } from '../engine/types';

/** Was der Event-Player vom Pixi-Brett braucht (in Tests ersetzbar). */
export interface BoardAnimator {
  shake(vehicleId: string): Promise<void>;
  /** Optional: zeigt Fahrspur und Blocker (Geometrie; die Ursache kommt aus dem Event). */
  previewLane?(vehicleId: string, blockerId: string | null): void;
  /** Optional: hebt zu einem gesperrten Fahrzeug das Schluessel-Fahrzeug hervor. */
  previewKey?(vehicleId: string): void;
  /** Optional: Schloss springt auf (Animation vor dem Abgleich mit dem Zustand). */
  unlock?(vehicleId: string): Promise<void>;
  /** Optional: Hupe am hupenden Fahrzeug (Schallzacken mit kleinem Ruck). */
  honk?(vehicleId: string): Promise<void>;
  /** Optional: der Blocker gleitet von Kopfzelle `from` nach `to`. */
  yield?(vehicleId: string, from: [number, number], to: [number, number]): Promise<void>;
  /** Faehrt das Fahrzeug entlang `path` vom Brett und entfernt es. */
  exit(vehicleId: string, path: Array<[number, number]>): Promise<void>;
  /** Gleicht die sichtbaren Fahrzeuge mit dem Zustand ab (z. B. nach Undo). */
  sync(state: GameState): void;
}

/** Was der Event-Player vom DOM-HUD braucht. */
export interface HudSink {
  onEvent(event: GameEvent, state: GameState): void;
  render(state: GameState): void;
}

/**
 * Spielt GameEvent[] nacheinander ab. Brett-Events werden animiert, alle anderen gehen ans HUD.
 * Mehrere play()-Aufrufe werden hintereinander gereiht.
 */
export class EventPlayer {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly board: BoardAnimator,
    private readonly hud: HudSink,
  ) {}

  play(events: GameEvent[], state: GameState): Promise<void> {
    this.chain = this.chain.then(() => this.run(events, state));
    return this.chain;
  }

  /** Setzt Brett und HUD ohne Animation auf den Zustand (Start, Neustart). */
  reset(state: GameState): Promise<void> {
    this.chain = this.chain.then(() => {
      this.board.sync(state);
      this.hud.render(state);
    });
    return this.chain;
  }

  private async run(events: GameEvent[], state: GameState): Promise<void> {
    for (const event of events) {
      switch (event.type) {
        case 'vehicleBlocked':
          this.hud.onEvent(event, state);
          if (event.reason === 'locked') this.board.previewKey?.(event.vehicleId);
          else this.board.previewLane?.(event.vehicleId, event.blockerId);
          await this.board.shake(event.vehicleId);
          break;
        case 'vehicleExited':
          await this.board.exit(event.vehicleId, event.path);
          this.hud.onEvent(event, state);
          break;
        case 'vehicleYielded':
          this.hud.onEvent(event, state);
          await this.board.honk?.(event.byVehicleId);
          await this.board.yield?.(event.vehicleId, event.from, event.to);
          break;
        case 'vehicleUnlocked':
          this.hud.onEvent(event, state);
          await this.board.unlock?.(event.vehicleId);
          break;
        default:
          this.hud.onEvent(event, state);
      }
    }
    this.board.sync(state);
    this.hud.render(state);
  }
}
