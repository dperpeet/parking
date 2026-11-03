import type { Level, ResolvedRules } from '../schema';
import { cellKey, inBounds, vehicleCells } from './geometry';
import type { LevelIssue } from './types';

function unsupported(message: string): LevelIssue {
  return { code: 'unsupportedRule', message };
}

/** Regel-Varianten und Zelltypen, die die Engine nicht unterstützt. */
function unsupportedRules(level: Level, rules: ResolvedRules): LevelIssue[] {
  const issues: LevelIssue[] = [];
  if (rules.movement.model !== 'straight') {
    issues.push(unsupported(`movement.model "${rules.movement.model}" wird nicht unterstuetzt`));
  }
  if (rules.movement.exits !== 'edges') {
    issues.push(unsupported(`movement.exits "${rules.movement.exits}" wird nicht unterstuetzt`));
  }
  if (rules.movement.reversible) issues.push(unsupported('movement.reversible'));
  if (rules.passengers.order !== 'strict') {
    issues.push(unsupported(`passengers.order "${rules.passengers.order}"`));
  }
  if (rules.passengers.boardPolicy !== 'firstMatch') {
    issues.push(unsupported(`passengers.boardPolicy "${rules.passengers.boardPolicy}"`));
  }
  if (rules.passengers.mysteryRate > 0) issues.push(unsupported('passengers.mysteryRate'));
  if (rules.vehicles.dualColor) issues.push(unsupported('vehicles.dualColor'));
  if (!rules.vehicles.departOnFull) issues.push(unsupported('vehicles.departOnFull=false'));
  if (rules.special.oneWay) issues.push(unsupported('special.oneWay'));
  if (rules.special.barriers) issues.push(unsupported('special.barriers'));
  if (rules.special.mysteryVehicles) issues.push(unsupported('special.mysteryVehicles'));
  for (const c of level.grid.cells) {
    if (c.type === 'oneWay' || c.type === 'barrier') {
      issues.push(unsupported(`Zelltyp "${c.type}" bei ${c.x},${c.y}`));
    }
  }
  return issues;
}

function vehicleIssues(level: Level, rules: ResolvedRules): LevelIssue[] {
  const issues: LevelIssue[] = [];
  const seen = new Set<string>();
  const occupied = new Map<string, string>();
  const fixed = new Set<string>();

  for (const c of level.grid.cells) {
    if (!inBounds(level.grid, c.x, c.y)) {
      issues.push({ code: 'outOfBounds', message: `Zelle ${c.x},${c.y} liegt ausserhalb` });
    } else if (c.type === 'fixed') {
      fixed.add(cellKey(c.x, c.y));
    }
  }

  for (const v of level.vehicles) {
    if (seen.has(v.id)) {
      issues.push({ code: 'duplicateId', message: `Doppelte ID ${v.id}`, vehicleId: v.id });
    }
    seen.add(v.id);

    const type = rules.vehicles.types[v.type];
    if (!type) {
      issues.push({
        code: 'unknownVehicleType',
        message: `Unbekannter Fahrzeugtyp "${v.type}" bei ${v.id}`,
        vehicleId: v.id,
      });
    }
    if (!rules.vehicles.colors.includes(v.color)) {
      issues.push({
        code: 'unknownColor',
        message: `Unbekannte Farbe "${v.color}" bei ${v.id}`,
        vehicleId: v.id,
      });
    }
    if (!type) continue;

    const cells = vehicleCells({ x: v.pos[0], y: v.pos[1], dir: v.dir, length: type.length });
    if (cells.some(([x, y]) => !inBounds(level.grid, x, y))) {
      issues.push({
        code: 'outOfBounds',
        message: `Fahrzeug ${v.id} ragt aus dem Raster`,
        vehicleId: v.id,
      });
      continue;
    }
    let overlapped = false;
    for (const [x, y] of cells) {
      const key = cellKey(x, y);
      const other = occupied.get(key);
      if (!overlapped && (other !== undefined || fixed.has(key))) {
        overlapped = true;
        issues.push({
          code: 'overlap',
          message: `Fahrzeug ${v.id} ueberlappt ${other ?? 'ein festes Feld'} bei ${key}`,
          vehicleId: v.id,
        });
      }
      occupied.set(key, v.id);
    }
  }
  return issues;
}

function passengerIssues(level: Level, rules: ResolvedRules): LevelIssue[] {
  const issues: LevelIssue[] = [];
  const need = new Map<string, number>();
  const have = new Map<string, number>();
  for (const color of level.passengers) need.set(color, (need.get(color) ?? 0) + 1);
  for (const v of level.vehicles) {
    const type = rules.vehicles.types[v.type];
    if (type) have.set(v.color, (have.get(v.color) ?? 0) + type.capacity);
  }
  const surplus = level.meta?.allowSurplus === true;
  const colors = new Set([...need.keys(), ...have.keys()]);
  for (const color of colors) {
    const passengers = need.get(color) ?? 0;
    const capacity = have.get(color) ?? 0;
    const ok = surplus ? passengers <= capacity : passengers === capacity;
    if (!ok) {
      issues.push({
        code: 'passengerMismatch',
        message: `Farbe ${color}: ${passengers} Fahrgaeste, Kapazitaet ${capacity}`,
      });
    }
  }
  return issues;
}

function keyIssues(level: Level): LevelIssue[] {
  const issues: LevelIssue[] = [];
  const ids = new Set(level.vehicles.map((v) => v.id));
  const keyOf = new Map<string, string>();
  for (const v of level.vehicles) {
    if (v.locked && v.keyId === undefined) {
      issues.push({
        code: 'unknownKey',
        message: `Fahrzeug ${v.id} ist gesperrt, hat aber keine keyId`,
        vehicleId: v.id,
      });
    }
    if (v.keyId !== undefined) {
      if (!ids.has(v.keyId)) {
        issues.push({
          code: 'unknownKey',
          message: `keyId "${v.keyId}" von ${v.id} existiert nicht`,
          vehicleId: v.id,
        });
      } else if (v.locked) {
        keyOf.set(v.id, v.keyId);
      }
    }
  }
  for (const start of keyOf.keys()) {
    const visited = new Set<string>();
    let cur: string | undefined = start;
    while (cur !== undefined && !visited.has(cur)) {
      visited.add(cur);
      cur = keyOf.get(cur);
    }
    if (cur === start) {
      issues.push({
        code: 'keyCycle',
        message: `Schluesselzyklus bei ${start}`,
        vehicleId: start,
      });
    }
  }
  return issues;
}

export function validateLevel(level: Level, rules: ResolvedRules): LevelIssue[] {
  return [
    ...vehicleIssues(level, rules),
    ...passengerIssues(level, rules),
    ...keyIssues(level),
    ...unsupportedRules(level, rules),
  ];
}
