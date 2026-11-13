import { Container, Graphics } from 'pixi.js';
import type { GameState, VehicleState } from '../engine/types';
import type { BoardAnimator } from './event-player';
import { dashSegments, laneCells } from './direction';
import { DIR_VECTOR, cellRect, computeBoardLayout, vehicleRect } from './layout';
import type { BoardLayout, Rect } from './layout';
import { computeLockMarks } from './lock-marks';
import type { LockMarks } from './lock-marks';
import { THEME } from './theme';
import { Tweener, easings } from './tween';
import { HonkBurst } from './honk-fx';
import { t } from '../i18n';
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
/** Ausfahren: Ab diesem Fortschritt blendet das Fahrzeug ueber die Spanne EXIT_FADE_SPAN aus. */
const EXIT_FADE_FROM = 0.7;
const EXIT_FADE_SPAN = 0.3;
const HINT_PULSES = 3;
const HINT_ALPHA_MIN = 0.55;
/** Fahrspur-Vorschau: Dauer, Strichperiode (Anteil Zelle), Strichanteil, Staerken in px, Pfeilspitze (Anteil Zelle). */
const LANE_PREVIEW_MS = 1400;
const LANE_DASH_PERIOD = 0.34;
const LANE_DASH_RATIO = 0.55;
const LANE_WIDTH_RATIO = 0.08;
const LANE_MIN_WIDTH = 3;
const LANE_ARROW = 0.2;
const BLOCKER_GROW = 3;
/** Wie lange das Schluessel-Fahrzeug nach einem Tipp auf ein gesperrtes Fahrzeug hervorgehoben bleibt. */
const KEY_HINT_MS = 1600;
const UNLOCK_MS = 480;
/** Mystery-Fahrzeug aufdecken (Umklappen zur echten Farbe). */
const REVEAL_MS = 420;
/** Hupe: Dauer und Staerke des Rucks (Zellanteil, Zyklen), Standzeit der Sprechblase danach, Aufpoppen (Startmass, Ueberschwingen). */
const HONK_JOLT_MS = 260;
const HONK_JOLT_AMPLITUDE = 0.07;
const HONK_JOLT_CYCLES = 2;
const HONK_HOLD_MS = 420;
const HONK_POP_FROM = 0.4;
const HONK_POP_OVERSHOOT = 0.25;
/** Abstand der Sprechblase vor der Fahrzeugfront (Zellanteil). */
const HONK_BURST_OFFSET = 0.75;
/** Ausweichen: Gleitdauer je Zelle und Mindestdauer. */
const YIELD_MS_PER_CELL = 150;
const YIELD_MIN_MS = 280;
/** Poller: Radien als Anteil der Zelle (Kappe, Reflexring innen/aussen) und Schattenversatz. */
const POST_RADIUS = 0.34;
const POST_RING = 0.21;
const POST_RING_WIDTH = 0.1;
const POST_CORE = 0.08;

export class BoardView implements BoardAnimator {
  private readonly root = new Container();
  private readonly vehicles = new Map<string, VehicleView>();
  private layout: BoardLayout | null = null;
  private state: GameState | null = null;
  private highlighted: string | null = null;
  private highlightToken = 0;
  /** Wiederverwendete Vorschau-Grafik; wird nur pro Antippen gezeichnet, nie pro Frame. */
  private lane: Graphics | null = null;
  private laneToken = 0;
  private marks: LockMarks = computeLockMarks([]);
  private disposed = false;

  constructor(private readonly host: BoardHost) {
    host.stage.addChild(this.root);
  }

  /** Beendet laufende Hervorhebungen und Vorschauen; ausstehende Timer zeichnen danach nicht mehr. */
  dispose(): void {
    this.disposed = true;
    this.highlightToken += 1;
    this.laneToken += 1;
    this.highlighted = null;
    this.lane = null;
  }

  getLayout(): BoardLayout | null {
    return this.layout;
  }

  /** Baut Brett und Fahrzeuge komplett neu auf. */
  build(state: GameState): void {
    this.state = state;
    this.marks = computeLockMarks(state.vehicles);
    this.laneToken += 1;
    this.lane = null;
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
    this.marks = computeLockMarks(state.vehicles);
    const parked = new Set(state.vehicles.filter((v) => v.status === 'parked').map((v) => v.id));
    for (const [id, view] of this.vehicles) {
      const v = state.vehicles.find((o) => o.id === id);
      if (!parked.has(id) || !v) {
        view.destroy({ children: true });
        this.vehicles.delete(id);
      } else {
        view.setLock(this.marks.of(id), this.marks.count > 1);
        // Aufgedeckt bleibt aufgedeckt (auch nach Undo); der Zustand ist massgeblich.
        view.setHidden(v.hidden);
        // Nach dem Ausweichen (oder Undo davon) steht das Fahrzeug an einer neuen Zelle.
        const rect = vehicleRect(this.layout, v);
        if (rect.x !== view.restX || rect.y !== view.restY) view.placeAt(rect);
      }
    }
    for (const v of state.vehicles) {
      if (parked.has(v.id) && !this.vehicles.has(v.id)) this.addVehicle(v);
    }
    this.host.requestRender();
  }

  /** Hebt ein Fahrzeug fuer `durationMs` mit pulsierendem Rahmen hervor (null: sofort entfernen). */
  highlight(vehicleId: string | null, durationMs = 0): void {
    if (this.disposed) return;
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

  /** Hebt zu einem gesperrten Fahrzeug das Schluessel-Fahrzeug kurz hervor. */
  previewKey(vehicleId: string): void {
    const keyId = this.state?.vehicles.find((v) => v.id === vehicleId)?.keyId;
    if (keyId) this.highlight(keyId, KEY_HINT_MS);
  }

  /** Schloss springt auf und verschwindet; danach ist das Fahrzeug frei. */
  unlock(vehicleId: string): Promise<void> {
    const view = this.vehicles.get(vehicleId);
    if (!view) return Promise.resolve();
    return this.host.tweener.run({
      durationMs: UNLOCK_MS,
      onUpdate: (p) => {
        view.setUnlockProgress(p);
        this.host.requestRender();
      },
    });
  }

  /** Mystery-Fahrzeug klappt um und zeigt seine Farbe; danach ist es aufgedeckt. */
  reveal(vehicleId: string): Promise<void> {
    const view = this.vehicles.get(vehicleId);
    if (this.disposed || !view) return Promise.resolve();
    return this.host.tweener
      .run({
        durationMs: REVEAL_MS,
        ease: easings.easeInOutQuad,
        onUpdate: (p) => {
          view.setRevealProgress(p);
          this.host.requestRender();
        },
      })
      .then(() => {
        view.setRevealProgress(1);
        this.host.requestRender();
      });
  }

  /** Markiert die Fahrspur in Blickrichtung bis zum Rand und das blockierende Fahrzeug. */
  previewLane(vehicleId: string, blockerId: string | null): void {
    if (this.disposed) return;
    const veh = this.state?.vehicles.find((v) => v.id === vehicleId);
    const layout = this.layout;
    if (!veh || !layout) return;
    this.clearLane();
    const g = new Graphics();
    const lineWidth = Math.max(LANE_MIN_WIDTH, layout.cell * LANE_WIDTH_RATIO);
    const cells = laneCells(veh, layout.cols, layout.rows);
    const last = cells[cells.length - 1];
    if (last) {
      const center = (c: readonly [number, number]): [number, number] => [
        layout.originX + (c[0] + 0.5) * layout.cell,
        layout.originY + (c[1] + 0.5) * layout.cell,
      ];
      const to = center(last);
      const period = layout.cell * LANE_DASH_PERIOD;
      for (const [a, b] of dashSegments(center([veh.x, veh.y]), to, period, LANE_DASH_RATIO)) {
        g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
      }
      g.stroke({ width: lineWidth, color: THEME.accent, cap: 'round' });
      const [dx, dy] = DIR_VECTOR[veh.dir];
      const s = layout.cell * LANE_ARROW;
      g.moveTo(to[0] - dx * s - dy * s, to[1] - dy * s + dx * s)
        .lineTo(to[0] + dx * s, to[1] + dy * s)
        .lineTo(to[0] - dx * s + dy * s, to[1] - dy * s - dx * s)
        .stroke({ width: lineWidth, color: THEME.accent, cap: 'round', join: 'round' });
    }
    const blocker = blockerId ? this.state?.vehicles.find((v) => v.id === blockerId) : undefined;
    if (blocker) {
      const r = vehicleRect(layout, blocker);
      g.roundRect(
        r.x - BLOCKER_GROW,
        r.y - BLOCKER_GROW,
        r.w + 2 * BLOCKER_GROW,
        r.h + 2 * BLOCKER_GROW,
        THEME.vehicleRadius + BLOCKER_GROW,
      ).stroke({ width: lineWidth, color: THEME.accent });
    }
    // Statisch (auch ohne reduzierte Bewegung); nur der Timer blendet die Vorschau aus.
    this.lane = g;
    this.root.addChild(g);
    this.host.requestRender();
    const token = this.laneToken;
    setTimeout(() => {
      if (token === this.laneToken) this.clearLane();
    }, LANE_PREVIEW_MS);
  }

  private clearLane(): void {
    this.laneToken += 1;
    this.lane?.destroy();
    this.lane = null;
    this.host.requestRender();
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

  /** Hupe: Schallzacken "HUP!" vor der Front des Fahrzeugs, dazu ein kleiner Ruck entlang der Fahrtrichtung. */
  async honk(vehicleId: string): Promise<void> {
    const view = this.vehicles.get(vehicleId);
    const veh = this.state?.vehicles.find((v) => v.id === vehicleId);
    const layout = this.layout;
    if (this.disposed || !view || !veh || !layout) return;
    this.clearLane();
    const { width, height } = this.host.size();
    const [dx, dy] = DIR_VECTOR[veh.dir];
    const head = cellRect(layout, veh.x, veh.y);
    const reach = layout.cell * HONK_BURST_OFFSET;
    const margin = layout.cell * HONK_POP_OVERSHOOT + layout.cell / 2;
    const burst = new HonkBurst(t('honkBubble'), layout.cell);
    burst.position.set(
      Math.min(width - margin, Math.max(margin, head.x + head.w / 2 + dx * reach)),
      Math.min(height - margin, Math.max(margin, head.y + head.h / 2 + dy * reach)),
    );
    burst.scale.set(HONK_POP_FROM);
    this.root.addChild(burst);
    this.host.requestRender();
    const jolt = layout.cell * HONK_JOLT_AMPLITUDE;
    await this.host.tweener.run({
      durationMs: HONK_JOLT_MS,
      ease: easings.easeOutQuad,
      onUpdate: (p) => {
        const wiggle = Math.sin(p * HONK_JOLT_CYCLES * 2 * Math.PI) * jolt * (1 - p);
        view.x = view.restX + dx * wiggle;
        view.y = view.restY + dy * wiggle;
        burst.scale.set(HONK_POP_FROM + (1 - HONK_POP_FROM + HONK_POP_OVERSHOOT * (1 - p)) * p);
        this.host.requestRender();
      },
    });
    view.x = view.restX;
    view.y = view.restY;
    burst.scale.set(1);
    this.host.requestRender();
    // Die Blase bleibt kurz stehen, auch bei reduzierter Bewegung.
    await new Promise<void>((resolve) => setTimeout(resolve, HONK_HOLD_MS));
    burst.destroy({ children: true });
    this.host.requestRender();
  }

  /** Der Blocker gleitet von seiner alten zur neuen Kopfzelle; danach gilt die neue Position als Ruhelage. */
  yield(vehicleId: string, from: [number, number], to: [number, number]): Promise<void> {
    const view = this.vehicles.get(vehicleId);
    const veh = this.state?.vehicles.find((v) => v.id === vehicleId);
    const layout = this.layout;
    if (this.disposed || !view || !veh || !layout) return Promise.resolve();
    const start = vehicleRect(layout, { ...veh, x: from[0], y: from[1] });
    const end = vehicleRect(layout, { ...veh, x: to[0], y: to[1] });
    const cells = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    return this.host.tweener
      .run({
        durationMs: Math.max(YIELD_MIN_MS, cells * YIELD_MS_PER_CELL),
        ease: easings.easeInOutQuad,
        onUpdate: (p) => {
          view.x = start.x + (end.x - start.x) * p;
          view.y = start.y + (end.y - start.y) * p;
          this.host.requestRender();
        },
      })
      .then(() => {
        view.placeAt(end);
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
          view.alpha = 1 - Math.max(0, p - EXIT_FADE_FROM) / EXIT_FADE_SPAN;
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
      v.length,
      v.hidden,
    );
    view.setLock(this.marks.of(v.id), this.marks.count > 1);
    this.vehicles.set(v.id, view);
    this.root.addChild(view);
  }

  /** Poller von oben: harter Schatten, rote Kappe mit weissem Reflexring und dunklem Kern. */
  private drawBollard(g: Graphics, r: Rect): void {
    const c = Math.min(r.w, r.h);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    g.circle(cx + THEME.shadowOffset, cy + THEME.shadowOffset, c * POST_RADIUS).fill(THEME.outline);
    g.circle(cx, cy, c * POST_RADIUS)
      .fill(THEME.bollardCap)
      .stroke({ width: THEME.outlineWidth, color: THEME.outline });
    g.circle(cx, cy, c * POST_RING).stroke({
      width: c * POST_RING_WIDTH,
      color: THEME.bollardRing,
    });
    g.circle(cx, cy, c * POST_CORE).fill(THEME.bollardCore);
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
        g.roundRect(r.x, r.y, r.w, r.h, 8).fill(THEME.cell);
        if (isFixed) this.drawBollard(g, r);
      }
    }
    return g;
  }
}
