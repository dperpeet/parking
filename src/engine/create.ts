import type { Level, ResolvedRules } from '../schema';
import { createRng } from './rng';
import { evaluateOutcome } from './rules/outcome';
import { initialSlots } from './rules/slots';
import { LevelError } from './types';
import type { GameState, PowerUpId } from './types';
import { validateLevel } from './validate';

const POWER_UP_IDS: PowerUpId[] = ['undo', 'shuffle', 'extraSlot', 'honk'];

export function createGame(level: Level, rules: ResolvedRules, seed?: number): GameState {
  const issues = validateLevel(level, rules);
  if (issues.length > 0) throw new LevelError(issues);

  const powerUps = {} as Record<PowerUpId, number>;
  for (const id of POWER_UP_IDS) {
    const cfg = rules.powerups[id];
    powerUps[id] = cfg.enabled ? cfg.uses : 0;
  }

  const state: GameState = {
    v: 1,
    levelId: level.id,
    grid: level.grid,
    vehicles: level.vehicles.map((v) => {
      const type = rules.vehicles.types[v.type]!;
      return {
        id: v.id,
        type: v.type,
        length: type.length,
        capacity: type.capacity,
        color: v.color,
        x: v.pos[0],
        y: v.pos[1],
        dir: v.dir,
        status: 'parked',
        locked: v.locked ?? false,
        keyId: v.keyId ?? null,
        hidden: false,
      };
    }),
    slots: initialSlots(rules),
    passengers: [...level.passengers],
    passengerIndex: 0,
    moves: 0,
    powerUps,
    powerUpsUsed: 0,
    history: [],
    rng: createRng(seed ?? level.seed ?? 0),
    status: 'playing',
    loseReason: null,
    stars: 0,
  };
  // Ein Level ohne einen einzigen moeglichen Zug ist sofort verloren.
  evaluateOutcome(state, rules, []);
  return state;
}
