import { describe, expect, it } from 'vitest';
import { validateLevel } from '../../../src/engine';
import { Level, resolveRules } from '../../../src/schema';
import { analyze } from '../../../src/solver/analyze';
import { generate } from '../../../src/solver/generator';
import { assignKeys } from '../../../src/solver/generator-special';
import type { SpecialVehicle } from '../../../src/solver/generator-special';
import type { GeneratorOptions } from '../../../src/solver/types';
import { rules as classicRules, world2Ruleset } from '../helpers';

const world2 = resolveRules(world2Ruleset);
const COLORS = ['blue', 'orange', 'green', 'yellow'];
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
const MIN_VEHICLES = 7;
const VEHICLE_SPREAD = 4;

function special(seed: number): GeneratorOptions {
  return {
    seed,
    width: 6,
    height: 6,
    vehicleCount: MIN_VEHICLES + (seed % VEHICLE_SPREAD),
    colors: COLORS,
    ruleset: 'world2',
    bollards: [1, 3],
    keys: [1, 2],
    keyChainDepth: 2,
    maxAttempts: 30,
    maxStates: 60_000,
  };
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

const STEP = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] } as const;

function cellsOf(v: Level['vehicles'][number], rules: typeof world2): Array<[number, number]> {
  const [dx, dy] = STEP[v.dir];
  const len = rules.vehicles.types[v.type]!.length;
  return Array.from({ length: len }, (_, i) => [v.pos[0] - dx * i, v.pos[1] - dy * i]);
}

function pathOf(level: Level, v: Level['vehicles'][number]): Array<[number, number]> {
  const [dx, dy] = STEP[v.dir];
  const out: Array<[number, number]> = [];
  let x = v.pos[0] + dx;
  let y = v.pos[1] + dy;
  while (x >= 0 && y >= 0 && x < level.grid.width && y < level.grid.height) {
    out.push([x, y]);
    x += dx;
    y += dy;
  }
  return out;
}

const generated = SEEDS.map((seed) => generate(special(seed), world2).level);

describe('generator: classic defaults unchanged', () => {
  it('matches levels generated before bollards/keys existed', () => {
    const colors = ['blue', 'orange', 'green', 'yellow'];
    const levels = [
      {
        seed: 42,
        width: 5,
        height: 5,
        vehicleCount: 7,
        colors: colors.slice(0, 3),
        maxAttempts: 10,
      },
      {
        seed: 7,
        width: 6,
        height: 6,
        vehicleCount: 9,
        colors,
        maxAttempts: 8,
        slots: 6,
        visiblePassengers: 5,
        targetDifficulty: [3, 6] as [number, number],
      },
      {
        seed: 2024,
        width: 5,
        height: 6,
        vehicleCount: 8,
        colors,
        maxAttempts: 8,
        preferDeadEnds: true,
      },
    ].map((c) => hash(JSON.stringify(generate(c, classicRules).level)));
    expect(levels).toEqual([1893368561, 3739949792, 856820367]);
  });

  it('explicit zeros equal the defaults', () => {
    const base = {
      seed: 42,
      width: 5,
      height: 5,
      vehicleCount: 7,
      colors: COLORS,
      maxAttempts: 10,
    };
    const a = generate(base, classicRules).level;
    const b = generate({ ...base, bollards: 0, keys: 0, keyChainDepth: 3 }, classicRules).level;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('generator: bollards and keys', () => {
  it('is deterministic per seed', () => {
    const again = generate(special(5), world2).level;
    expect(JSON.stringify(again)).toBe(JSON.stringify(generated[4]));
  });

  it.each(SEEDS)('seed %i: valid and solvable with world2 rules', (seed) => {
    const level = generated[seed - 1]!;
    expect(level.ruleset).toBe('world2');
    expect(() => Level.parse(level)).not.toThrow();
    expect(validateLevel(level, world2)).toEqual([]);
    expect(analyze(level, world2).solvable).toBe(true);
  });

  it('places 1-3 bollards and 1-2 locks, never on vehicles or exit paths', () => {
    for (const level of generated) {
      const fixed = level.grid.cells.filter((c) => c.type === 'fixed');
      expect(fixed.length).toBeGreaterThanOrEqual(1);
      expect(fixed.length).toBeLessThanOrEqual(3);
      const locked = level.vehicles.filter((v) => v.locked);
      expect(locked.length).toBeGreaterThanOrEqual(1);
      expect(locked.length).toBeLessThanOrEqual(2);
      const blocked = new Set<string>();
      for (const v of level.vehicles) {
        for (const c of [...cellsOf(v, world2), ...pathOf(level, v)]) blocked.add(c.join(','));
      }
      for (const c of fixed) expect(blocked.has(`${c.x},${c.y}`)).toBe(false);
      // Rolle: mindestens ein Poller liegt in Zeile/Spalte eines Fahrzeugs.
      expect(
        fixed.some((c) =>
          level.vehicles.some((v) =>
            v.dir === 'E' || v.dir === 'W' ? v.pos[1] === c.y : v.pos[0] === c.x,
          ),
        ),
      ).toBe(true);
    }
  });

  it('keeps key chains within keyChainDepth and acyclic', () => {
    for (const level of generated) {
      const keyOf = new Map(level.vehicles.filter((v) => v.locked).map((v) => [v.id, v.keyId!]));
      for (const id of keyOf.keys()) {
        let len = 0;
        for (let cur: string | undefined = id; cur !== undefined && keyOf.has(cur);) {
          cur = keyOf.get(cur);
          len += 1;
          expect(len).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('locks matter: the lock would be free before its key leaves', () => {
    for (const level of generated) {
      const order = level.vehicles.map((v) => v.id);
      for (const v of level.vehicles.filter((x) => x.locked)) {
        const key = level.vehicles.find((x) => x.id === v.keyId)!;
        expect(order.indexOf(key.id)).toBeLessThan(order.indexOf(v.id));
        const path = new Set(pathOf(level, v).map((c) => c.join(',')));
        const blockers = level.vehicles.filter(
          (o) => o !== v && cellsOf(o, world2).some((c) => path.has(c.join(','))),
        );
        // Alle Blocker fahren vor dem Schluessel aus; der Schluessel blockiert nicht selbst.
        for (const b of blockers) expect(order.indexOf(b.id)).toBeLessThan(order.indexOf(key.id));
      }
    }
  });

  it('removing the locks changes the analysis', () => {
    for (const level of generated.slice(0, 8)) {
      const open: Level = {
        ...level,
        vehicles: level.vehicles.map((v) => ({ ...v, locked: undefined, keyId: undefined })),
      };
      const withLocks = analyze(level, world2);
      const without = analyze(open, world2);
      expect(without.totalPaths).not.toBe(withLocks.totalPaths);
    }
  });
});

describe('assignKeys', () => {
  const FREE: SpecialVehicle[] = Array.from({ length: 6 }, (_, i) => ({
    dir: 'N',
    cells: [[i, 1]],
    path: [[i, 0]],
  }));

  function chainLengths(keyOf: Map<number, number>): number[] {
    return [...keyOf.keys()].map((lock) => {
      let len = 0;
      for (let cur = lock; keyOf.has(cur); cur = keyOf.get(cur)!) len += 1;
      return len;
    });
  }

  it('never builds chains longer than maxDepth, also when a key becomes a lock later', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const keyOf = assignKeys({ state: seed }, FREE, 3, 1);
      expect(keyOf).not.toBeNull();
      for (const len of chainLengths(keyOf!)) expect(len).toBe(1);
    }
  });
});
