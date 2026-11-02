import { Container, Graphics } from 'pixi.js';
import type { GameState, VehicleState } from '../engine/types';
import type { BoardAnimator } from './event-player';
import { DIR_VECTOR, cellRect, computeBoardLayout, vehicleRect } from './layout';
import type { BoardLayout } from './layout';
import { THEME } from './theme';
import { Tweener, easings } from './tween';
import { VehicleView } from './vehicle-view';

export interface BoardHost {
  stage: Container;
  tweener: Tweener;
  /** Zeichnet einen Frame, auch wenn der Ticker ruht. */
  requestRender(): void;
  size(): { width: number; height: number };
}

const SHAKE_MS = 320;
const SHAKE_AMPLITUDE = 5;
const SHAKE_CYCLES = 3;
const EXIT_MS_PER_CELL = 70;
const EXIT_MIN_MS = 260;
const HINT_PULSES = 3;
const HINT_ALPHA_MIN = 0.55;

export class BoardView implements BoardAnimator {
  private readonly root = new Container();
  private readonly vehicles = new Map<string, VehicleView>();
  private layout: BoardLayout | null = null;
  private state: GameState | null = null;
  private highlighted: string | null = null;
  private highlightToken = 0;

  constructor(private readonly host: BoardHost) {
    host.stage.addChild(this.root);
  }

  getLayout(): BoardLayout | null {
    return this.layout;
  }

  /** Baut Brett und Fahrzeuge komplett neu auf. */
  build(state: GameState): void {
    this.state = state;
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.vehicles.clear();
    const { width, height } = this.host.size();
    const layout = computeBoardLayout(state.grid.width, state.grid.height, width, height);
    this.layout = layout;
    this.root.addChild(this.drawBoard(layout));
    for (const v of state.vehicles) if (v.status === 'parked') this.addVehicle(v);
    this.host.requestRender();
  }

  /** Nach Groessenaenderung neu aufbauen. */
  resize(): void {
    if (this.state) this.build(this.state);
  }

  sync(state: GameState): void {
    if (!this.layout || state.levelId !== this.state?.levelId || this.vehicles.size === 0) {
      this.build(state);
      return;
    }
    this.state = state;
    const parked = new Set(state.vehicles.filter((v) => v.status === 'parked').map((v) => v.id));
    for (const [id, view] of this.vehicles) {
      if (!parked.has(id)) {
        view.destroy({ children: true });
        this.vehicles.delete(id);
      }
    }
    for (const v of state.vehicles) {
      if (parked.has(v.id) && !this.vehicles.has(v.id)) this.addVehicle(v);
    }
    this.host.requestRender();
  }

  /** Hebt ein Fahrzeug fuer `durationMs` mit pulsierendem Rahmen hervor (null: sofort entfernen). */
  highlight(vehicleId: string | null, durationMs = 0): void {
    this.highlightToken += 1;
    const token = this.highlightToken;
    if (this.highlighted) {
      this.vehicles.get(this.highlighted)?.setGlow(0);
      this.highlighted = null;
    }
    const view = vehicleId ? this.vehicles.get(vehicleId) : undefined;
    if (!vehicleId || !view) {
      this.host.requestRender();
      return;
    }
    this.highlighted = vehicleId;
    view.setGlow(1);
    this.host.requestRender();
    const stop = (): void => {
      if (token !== this.highlightToken) return;
      this.highlightToken += 1;
      view.setGlow(0);
      this.highlighted = null;
      this.host.requestRender();
    };
    // Das Pulsieren ist reine Animation (bei reduzierter Bewegung steht der Rahmen still);
    // die Dauer des Hinweises bestimmt der Timer.
    void this.host.tweener.run({
      durationMs,
      onUpdate: (p) => {
        if (token !== this.highlightToken) return;
        const wave = 0.5 + 0.5 * Math.cos(p * HINT_PULSES * 2 * Math.PI);
        view.setGlow(HINT_ALPHA_MIN + (1 - HINT_ALPHA_MIN) * wave);
        this.host.requestRender();
      },
    });
    setTimeout(stop, durationMs);
  }

  shake(vehicleId: string): Promise<void> {
    const view = this.vehicles.get(vehicleId);
    if (!view) return Promise.resolve();
    return this.host.tweener
      .run({
        durationMs: SHAKE_MS,
        onUpdate: (p) => {
          view.x =
            view.restX + Math.sin(p * SHAKE_CYCLES * 2 * Math.PI) * SHAKE_AMPLITUDE * (1 - p);
          this.host.requestRender();
        },
      })
      .then(() => {
        view.x = view.restX;
        this.host.requestRender();
      });
  }

  exit(vehicleId: string, path: Array<[number, number]>): Promise<void> {
    const view = this.vehicles.get(vehicleId);
    const veh = this.state?.vehicles.find((v) => v.id === vehicleId);
    const layout = this.layout;
    if (!view || !veh || !layout) return Promise.resolve();
    // Das Fahrzeug ist fertig, wenn der Heck den Rand passiert hat: letzte Pfadzelle + Laenge.
    const last = path[path.length - 1] ?? [veh.x, veh.y];
    const [dx, dy] = DIR_VECTOR[veh.dir];
    const cells = Math.max(Math.abs(last[0] - veh.x), Math.abs(last[1] - veh.y)) + veh.length;
    const distance = cells * layout.cell;
    this.vehicles.delete(vehicleId);
    return this.host.tweener
      .run({
        durationMs: Math.max(EXIT_MIN_MS, cells * EXIT_MS_PER_CELL),
        ease: easings.easeInQuad,
        onUpdate: (p) => {
          view.x = view.restX + dx * distance * p;
          view.y = view.restY + dy * distance * p;
          view.alpha = 1 - Math.max(0, p - 0.7) / 0.3;
          this.host.requestRender();
        },
      })
      .then(() => {
        view.destroy({ children: true });
        this.host.requestRender();
      });
  }

  private addVehicle(v: VehicleState): void {
    if (!this.layout) return;
    const view = new VehicleView(
      v.id,
      vehicleRect(this.layout, v),
      v.dir,
      v.color,
      this.layout.cell,
    );
    this.vehicles.set(v.id, view);
    this.root.addChild(view);
  }

  private drawBoard(l: BoardLayout): Graphics {
    const g = new Graphics();
    const { x, y, w, h } = l.board;
    g.roundRect(x + THEME.shadowOffset, y + THEME.shadowOffset, w, h, THEME.boardRadius).fill(
      THEME.outline,
    );
    g.roundRect(x, y, w, h, THEME.boardRadius)
      .fill(THEME.board)
      .stroke({ width: THEME.outlineWidth, color: THEME.outline });
    const fixed = this.state?.grid.cells.filter((c) => c.type === 'fixed') ?? [];
    for (let cy = 0; cy < l.rows; cy++) {
      for (let cx = 0; cx < l.cols; cx++) {
        const r = cellRect(l, cx, cy);
        const isFixed = fixed.some((c) => c.x === cx && c.y === cy);
        g.roundRect(r.x, r.y, r.w, r.h, 8).fill(isFixed ? THEME.outline : THEME.cell);
      }
    }
    return g;
  }
}
