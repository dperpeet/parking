import type { GameEvent, GameState } from '../engine/types';
import type { Dir } from '../schema';

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
  /** Optional: ein Mystery-Fahrzeug deckt seine Farbe auf (Animation vor dem Abgleich mit dem Zustand). */
  reveal?(vehicleId: string): Promise<void>;
  /** Optional: der Blocker gleitet von Kopfzelle `from` nach `to`. */
  yield?(vehicleId: string, from: [number, number], to: [number, number]): Promise<void>;
  /**
   * Faehrt das Fahrzeug entlang `path` vom Brett und entfernt es. `exitDir` (nur bei Abbiegepfeilen): Richtung,
   * in der es das Raster verlaesst; fehlt sie, faehrt es geradeaus.
   */
  exit(vehicleId: string, path: Array<[number, number]>, exitDir?: Dir): Promise<void>;
  /** Gleicht die sichtbaren Fahrzeuge mit dem Zustand ab (z. B. nach Undo). */
  sync(state: GameState): void;
}

/** Was der Event-Player vom DOM-HUD braucht. */
export interface HudSink {
  onEvent(event: GameEvent, state: GameState): void;
  render(state: GameState): void;
}

/** Optionaler Ton: bekommt jedes Event in dem Moment, in dem es abgespielt wird. */
export interface SoundSink {
  cue(event: GameEvent): void;
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
    private readonly sound?: SoundSink,
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
      this.sound?.cue(event);
      switch (event.type) {
        case 'vehicleBlocked':
          this.hud.onEvent(event, state);
          if (event.reason === 'locked') this.board.previewKey?.(event.vehicleId);
          else this.board.previewLane?.(event.vehicleId, event.blockerId);
          await this.board.shake(event.vehicleId);
          break;
        case 'invalidAction':
          this.hud.onEvent(event, state);
          // Ungueltige Aktion an einem Fahrzeug auf dem Feld (z. B. Hupe ohne Wirkung): wackeln.
          if (
            event.vehicleId !== undefined &&
            state.vehicles.some((v) => v.id === event.vehicleId && v.status === 'parked')
          ) {
            await this.board.shake(event.vehicleId);
          }
          break;
        case 'vehicleExited':
          if (event.exitDir === undefined) await this.board.exit(event.vehicleId, event.path);
          else await this.board.exit(event.vehicleId, event.path, event.exitDir);
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
        case 'vehicleRevealed':
          this.hud.onEvent(event, state);
          await this.board.reveal?.(event.vehicleId);
          break;
        default:
          this.hud.onEvent(event, state);
      }
    }
    this.board.sync(state);
    this.hud.render(state);
  }
}
