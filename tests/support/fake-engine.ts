// Minimale Test-Engine fuer Controller-, Renderer- und Layout-Tests.
import type { ColorId, Dir, Level, ResolvedRules } from '../../src/schema';
import type {
  Action,
  GameEvent,
  GameState,
  LoseReason,
  PowerUpId,
  Snapshot,
  StepResult,
  VehicleState,
} from '../../src/engine/types';
import type { EngineApi } from '../../src/app/engine-port';

const STEP: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const POWER_UPS: PowerUpId[] = ['undo', 'shuffle', 'extraSlot', 'honk'];

function nextRandom(rng: number): [number, number] {
  // mulberry32
  const next = (rng + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Belegte Zellen eines Fahrzeugs (Kopf plus Rumpf entgegen der Blickrichtung). */
function cellsOf(v: VehicleState): Array<[number, number]> {
  const [dx, dy] = STEP[v.dir];
  return Array.from({ length: v.length }, (_, i) => [v.x - dx * i, v.y - dy * i]);
}

function pathOf(state: GameState, v: VehicleState): Array<[number, number]> {
  const [dx, dy] = STEP[v.dir];
  const path: Array<[number, number]> = [];
  let x = v.x + dx;
  let y = v.y + dy;
  while (x >= 0 && y >= 0 && x < state.grid.width && y < state.grid.height) {
    path.push([x, y]);
    x += dx;
    y += dy;
  }
  return path;
}

function blockerOf(state: GameState, v: VehicleState): string | null | undefined {
  // undefined: frei; null: feste Zelle; string: Fahrzeug
  for (const [x, y] of pathOf(state, v)) {
    if (state.grid.cells.some((c) => c.type === 'fixed' && c.x === x && c.y === y)) return null;
    const hit = state.vehicles.find(
      (o) =>
        o.status === 'parked' &&
        o.id !== v.id &&
        cellsOf(o).some(([cx, cy]) => cx === x && cy === y),
    );
    if (hit) return hit.id;
  }
  return undefined;
}

function legalMoves(state: GameState): string[] {
  const free = state.slots.some((s) => s.kind === 'empty');
  if (!free) return [];
  return state.vehicles
    .filter((v) => v.status === 'parked' && !v.locked && blockerOf(state, v) === undefined)
    .map((v) => v.id);
}

function board(state: GameState, rules: ResolvedRules, events: GameEvent[]): void {
  for (;;) {
    const color = state.passengers[state.passengerIndex];
    if (color === undefined) return;
    const slotIndex = state.slots.findIndex(
      (s) => s.kind === 'vehicle' && s.color === color && s.filled < s.capacity,
    );
    const slot = state.slots[slotIndex];
    if (!slot || slot.kind !== 'vehicle') return;
    slot.filled += 1;
    events.push({
      type: 'passengerBoarded',
      passengerIndex: state.passengerIndex,
      color,
      vehicleId: slot.vehicleId,
      slotIndex,
      filled: slot.filled,
    });
    state.passengerIndex += 1;
    if (slot.filled >= slot.capacity && rules.vehicles.departOnFull) {
      const v = state.vehicles.find((o) => o.id === slot.vehicleId);
      if (v) v.status = 'departed';
      state.slots[slotIndex] = { kind: 'empty' };
      events.push({ type: 'vehicleDeparted', vehicleId: slot.vehicleId, slotIndex });
    }
  }
}

function evaluate(state: GameState, rules: ResolvedRules, events: GameEvent[]): void {
  if (state.passengerIndex >= state.passengers.length) {
    const used = state.powerUpsUsed;
    const { three, two } = rules.scoring.stars;
    state.status = 'won';
    state.stars = used <= three ? 3 : used <= two ? 2 : 1;
    events.push({ type: 'won', moves: state.moves, stars: state.stars });
    return;
  }
  let reason: LoseReason | null = null;
  const noFree = !state.slots.some((s) => s.kind === 'empty');
  if (noFree && rules.queue.loseOnFull) reason = 'queueFull';
  else if (legalMoves(state).length === 0) reason = 'noMoves';
  else if (rules.limits.moves !== null && state.moves >= rules.limits.moves) reason = 'movesLimit';
  if (reason) {
    state.status = 'lost';
    state.loseReason = reason;
    events.push({ type: 'lost', reason });
  }
}

function snapshot(state: GameState): Snapshot {
  return clone({
    vehicles: state.vehicles,
    slots: state.slots,
    passengers: state.passengers,
    passengerIndex: state.passengerIndex,
    moves: state.moves,
    rng: state.rng,
  });
}

function createGame(level: Level, rules: ResolvedRules, seed = level.seed ?? 1): GameState {
  const slots: GameState['slots'] = Array.from({ length: rules.queue.slots }, (_, i) =>
    rules.queue.lockedSlots.includes(i) ? { kind: 'locked' } : { kind: 'empty' },
  );
  const vehicles: VehicleState[] = level.vehicles.map((lv) => {
    const type = rules.vehicles.types[lv.type];
    if (!type) throw new Error(`Unbekannter Fahrzeugtyp ${lv.type}`);
    return {
      id: lv.id,
      type: lv.type,
      length: type.length,
      capacity: type.capacity,
      color: lv.color,
      x: lv.pos[0],
      y: lv.pos[1],
      dir: lv.dir,
      status: 'parked',
      locked: lv.locked ?? false,
      keyId: lv.keyId ?? null,
    };
  });
  const powerUps = Object.fromEntries(
    POWER_UPS.map((id) => [id, rules.powerups[id].enabled ? rules.powerups[id].uses : 0]),
  ) as Record<PowerUpId, number>;
  return {
    v: 1,
    levelId: level.id,
    grid: level.grid,
    vehicles,
    slots,
    passengers: [...level.passengers],
    passengerIndex: 0,
    moves: 0,
    powerUps,
    powerUpsUsed: 0,
    history: [],
    rng: seed >>> 0,
    status: 'playing',
    loseReason: null,
    stars: 0,
  };
}

function step(prev: GameState, action: Action, rules: ResolvedRules): StepResult {
  const state = clone(prev);
  const events: GameEvent[] = [];
  const invalid = (reason: string): StepResult => ({
    state: prev,
    events: [{ type: 'invalidAction', reason }],
  });

  const isUndo = action.type === 'usePowerUp' && action.powerUp === 'undo';
  if (state.status === 'won' || (state.status === 'lost' && !isUndo)) return invalid('gameOver');

  if (action.type === 'timeUp') {
    state.status = 'lost';
    state.loseReason = 'timeUp';
    return { state, events: [{ type: 'lost', reason: 'timeUp' }] };
  }

  if (action.type === 'tapVehicle') {
    const v = state.vehicles.find((o) => o.id === action.vehicleId);
    if (!v || v.status !== 'parked') return invalid('notParked');
    const blocker = blockerOf(state, v);
    const free = state.slots.some((s) => s.kind === 'empty');
    const reason = v.locked
      ? 'locked'
      : blocker !== undefined
        ? 'path'
        : !free
          ? 'queueFull'
          : null;
    if (reason) {
      return {
        state: prev,
        events: [
          {
            type: 'vehicleBlocked',
            vehicleId: v.id,
            reason,
            blockerId: typeof blocker === 'string' ? blocker : null,
          },
        ],
      };
    }
    state.history.push(snapshot(state));
    const slotIndex = state.slots.findIndex((s) => s.kind === 'empty');
    v.status = 'queued';
    state.slots[slotIndex] = {
      kind: 'vehicle',
      vehicleId: v.id,
      color: v.color,
      capacity: v.capacity,
      filled: 0,
    };
    state.moves += 1;
    events.push({ type: 'vehicleExited', vehicleId: v.id, slotIndex, path: pathOf(prev, v) });
    for (const o of state.vehicles) {
      if (o.keyId === v.id && o.locked) {
        o.locked = false;
        events.push({ type: 'vehicleUnlocked', vehicleId: o.id });
      }
    }
    board(state, rules, events);
    evaluate(state, rules, events);
    return { state, events };
  }

  // usePowerUp
  const id = action.powerUp;
  if (state.powerUps[id] <= 0) return invalid('noUses');
  if (id === 'undo') {
    const snap = state.history.pop();
    if (!snap) return invalid('noHistory');
    Object.assign(state, clone(snap));
    state.status = 'playing';
    state.loseReason = null;
    events.push({ type: 'stateRestored' });
  } else if (id === 'shuffle') {
    state.history.push(snapshot(state));
    const from = state.passengerIndex;
    const to = Math.min(state.passengers.length, from + rules.passengers.visible);
    const window: ColorId[] = state.passengers.slice(from, to);
    for (let i = window.length - 1; i > 0; i--) {
      const [r, next] = nextRandom(state.rng);
      state.rng = next;
      const j = Math.floor(r * (i + 1));
      [window[i], window[j]] = [window[j] as ColorId, window[i] as ColorId];
    }
    state.passengers.splice(from, window.length, ...window);
    events.push({ type: 'passengersShuffled', from, to });
    board(state, rules, events);
  } else if (id === 'extraSlot') {
    state.history.push(snapshot(state));
    const locked = state.slots.findIndex((s) => s.kind === 'locked');
    let slotIndex = locked;
    if (locked >= 0) state.slots[locked] = { kind: 'empty' };
    else {
      state.slots.push({ kind: 'empty' });
      slotIndex = state.slots.length - 1;
    }
    events.push({ type: 'slotAdded', slotIndex });
  } else {
    return invalid('unsupported');
  }
  state.powerUps[id] -= 1;
  state.powerUpsUsed += 1;
  events.push({ type: 'powerUpUsed', powerUp: id, remaining: state.powerUps[id] });
  if (id !== 'undo') evaluate(state, rules, events);
  return { state, events };
}

export const fakeEngine: EngineApi = { createGame, step };
