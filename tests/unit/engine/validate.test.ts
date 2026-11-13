import { describe, expect, it } from 'vitest';
import { LevelError, createGame, validateLevel } from '../../../src/engine';
import type { LevelIssue } from '../../../src/engine';
import type { RulesetOverrides } from '../../../src/schema';
import { BASIC, makeLevel, rulesWith, v } from './helpers';
import type { LevelSpec } from './helpers';

function codes(spec: LevelSpec): LevelIssue['code'][] {
  return validateLevel(makeLevel(spec), rulesWith(spec.overrides)).map((i) => i.code);
}

describe('validateLevel', () => {
  it('accepts a valid level', () => {
    expect(codes(BASIC)).toEqual([]);
  });

  it('reports unknownVehicleType', () => {
    const spec = { ...BASIC, vehicles: [v('a', 5, 0, 'E', 'zz', 'blue')] };
    expect(codes(spec)).toContain('unknownVehicleType');
  });

  it('reports unknownColor', () => {
    const spec = { ...BASIC, vehicles: [v('a', 5, 0, 'E', 's', 'teal')] };
    expect(codes(spec)).toContain('unknownColor');
  });

  it('reports outOfBounds for vehicles (tail) and cells', () => {
    const tail = { ...BASIC, vehicles: [v('a', 0, 0, 'E', 's', 'blue')] };
    expect(codes(tail)).toContain('outOfBounds');
    const cell = { ...BASIC, cells: [{ x: 9, y: 9, type: 'fixed' as const }] };
    expect(codes(cell)).toContain('outOfBounds');
  });

  it('reports overlap between vehicles and with fixed cells', () => {
    const vv = {
      ...BASIC,
      vehicles: [v('a', 5, 0, 'E', 's', 'blue'), v('b', 4, 0, 'E', 's', 'blue')],
    };
    expect(codes(vv)).toContain('overlap');
    const fixed = { ...BASIC, cells: [{ x: 4, y: 0, type: 'fixed' as const }] };
    expect(codes(fixed)).toContain('overlap');
  });

  it('reports duplicateId', () => {
    const spec = {
      ...BASIC,
      vehicles: [v('a', 5, 0, 'E', 's', 'blue'), v('a', 5, 1, 'E', 's', 'blue')],
      passengers: ['blue', 'blue', 'blue', 'blue'],
    };
    expect(codes(spec)).toContain('duplicateId');
  });

  it('reports passengerMismatch, and honours allowSurplus', () => {
    const fewer = { ...BASIC, passengers: ['blue', 'green', 'green'] };
    expect(codes(fewer)).toContain('passengerMismatch');
    expect(codes({ ...fewer, meta: { allowSurplus: true } })).toEqual([]);
    const more = { ...BASIC, passengers: ['blue', 'blue', 'blue', 'green', 'green'] };
    expect(codes({ ...more, meta: { allowSurplus: true } })).toContain('passengerMismatch');
  });

  it('reports unknownKey (missing vehicle, locked without keyId)', () => {
    const missing = { ...BASIC, vehicles: [v('a', 5, 0, 'E', 's', 'blue', { keyId: 'nope' })] };
    expect(codes(missing)).toContain('unknownKey');
    const noKey = { ...BASIC, vehicles: [v('a', 5, 0, 'E', 's', 'blue', { locked: true })] };
    expect(codes(noKey)).toContain('unknownKey');
  });

  it('reports keyCycle', () => {
    const spec = {
      ...BASIC,
      vehicles: [
        v('a', 5, 0, 'E', 's', 'blue', { locked: true, keyId: 'b' }),
        v('b', 5, 1, 'E', 's', 'green', { locked: true, keyId: 'a' }),
      ],
    };
    expect(codes(spec)).toContain('keyCycle');
    const self = {
      ...BASIC,
      vehicles: [v('a', 5, 0, 'E', 's', 'blue', { locked: true, keyId: 'a' })],
    };
    expect(codes(self)).toContain('keyCycle');
  });

  it('does not report a cycle for a plain key chain', () => {
    const spec = {
      ...BASIC,
      vehicles: [
        v('a', 5, 0, 'E', 's', 'blue', { locked: true, keyId: 'b' }),
        v('b', 5, 1, 'E', 's', 'green'),
      ],
    };
    expect(codes(spec)).toEqual([]);
  });

  const unsupported: Array<[string, RulesetOverrides]> = [
    ['movement.model', { movement: { model: 'turns' } }],
    ['movement.exits', { movement: { exits: 'gates' } }],
    ['movement.reversible', { movement: { reversible: true } }],
    ['passengers.order', { passengers: { order: 'lookahead' } }],
    ['passengers.boardPolicy', { passengers: { boardPolicy: 'largestFree' } }],
    ['passengers.mysteryRate', { passengers: { mysteryRate: 0.5 } }],
    ['vehicles.dualColor', { vehicles: { dualColor: true } }],
    ['vehicles.departOnFull', { vehicles: { departOnFull: false } }],
    ['special.oneWay', { special: { oneWay: true } }],
    ['special.barriers', { special: { barriers: true } }],
  ];
  it.each(unsupported)('reports unsupportedRule for %s', (_name, overrides) => {
    expect(codes({ ...BASIC, overrides })).toContain('unsupportedRule');
  });

  it('reports unsupportedRule for oneWay / barrier cells', () => {
    const spec = {
      ...BASIC,
      cells: [
        { x: 1, y: 1, type: 'oneWay' as const, dir: 'E' as const },
        { x: 2, y: 2, type: 'barrier' as const },
      ],
    };
    expect(codes(spec).filter((c) => c === 'unsupportedRule')).toHaveLength(2);
  });

  it('allows special.fixed, special.keyVehicles and special.mysteryVehicles', () => {
    const overrides = { special: { fixed: true, keyVehicles: true, mysteryVehicles: true } };
    expect(codes({ ...BASIC, overrides })).toEqual([]);
  });

  it('reports mysteryDisabled per mystery vehicle without special.mysteryVehicles', () => {
    const mystery = {
      ...BASIC,
      vehicles: [
        v('a', 5, 0, 'E', 's', 'blue', { mystery: true }),
        v('b', 5, 1, 'E', 's', 'green', { mystery: false }),
      ],
    };
    const issues = validateLevel(makeLevel(mystery), rulesWith());
    expect(issues).toEqual([
      expect.objectContaining({ code: 'mysteryDisabled', vehicleId: 'a' }) as LevelIssue,
    ]);
    expect(() => createGame(makeLevel(mystery), rulesWith())).toThrow(LevelError);
    const allowed = { ...mystery, overrides: { special: { mysteryVehicles: true } } };
    expect(codes(allowed)).toEqual([]);
  });

  it('createGame throws LevelError carrying the issues', () => {
    const spec = { ...BASIC, passengers: ['blue'] };
    const rules = rulesWith();
    try {
      createGame(makeLevel(spec), rules);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LevelError);
      expect((e as LevelError).issues[0]?.code).toBe('passengerMismatch');
    }
  });
});
