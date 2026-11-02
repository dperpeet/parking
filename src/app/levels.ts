// Kampagnen-Level und Rulesets laden: JSON per Glob einbinden, mit zod pruefen, Regeln aufloesen.
import { Level, Ruleset, resolveRules } from '../schema';
import type { ResolvedRules } from '../schema';
import { stageForDifficulty } from './stages';

export interface CampaignLevel {
  /** Stabiler Schluessel `<pack>/<datei>` (z. B. "01/007"), Grundlage fuer Route und Fortschritt. */
  key: string;
  pack: string;
  /** Dateiname ohne Endung ("007"). */
  fileId: string;
  /** Position in der Pack-Reihenfolge, ab 1. */
  number: number;
  level: Level;
  rules: ResolvedRules;
  stage: number;
}

export interface Campaign {
  levels: CampaignLevel[];
  find(pack: string, fileId: string): CampaignLevel | undefined;
  /** Naechstes Level in Pack-Reihenfolge. */
  after(entry: CampaignLevel): CampaignLevel | undefined;
  rulesFor(level: Level): ResolvedRules;
  /** Regeln eines Rulesets ohne Overrides (fuer generierte Level). */
  rulesOf(rulesetId: string): ResolvedRules;
}

type Modules = Record<string, unknown>;

/** Pack-Ordner "pack-01" -> Route-Segment "01". */
const packName = (dir: string): string => dir.replace(/^pack-/, '');

const LEVEL_PATH = /levels\/([^/]+)\/([^/]+)\.json$/;

/** Baut die Kampagne aus Glob-Modulen (Level-Dateien, index.json je Pack, Rulesets). */
export function buildCampaign(
  levelFiles: Modules,
  indexFiles: Modules,
  rulesetFiles: Modules,
): Campaign {
  const rulesets = new Map<string, Ruleset>();
  for (const raw of Object.values(rulesetFiles)) {
    const parsed = Ruleset.safeParse(raw);
    if (parsed.success) rulesets.set(parsed.data.id, parsed.data);
  }
  const rulesOf = (rulesetId: string, overrides?: Level['overrides']): ResolvedRules => {
    const ruleset = rulesets.get(rulesetId);
    if (!ruleset) throw new Error(`Unbekanntes Ruleset: ${rulesetId}`);
    return resolveRules(ruleset, overrides);
  };
  const rulesFor = (level: Level): ResolvedRules => rulesOf(level.ruleset, level.overrides);

  const byPath = new Map<string, unknown>();
  for (const [path, mod] of Object.entries(levelFiles)) byPath.set(path, mod);

  const levels: CampaignLevel[] = [];
  const indexEntries = Object.entries(indexFiles).sort(([a], [b]) => a.localeCompare(b));
  for (const [indexPath, indexRaw] of indexEntries) {
    const dir = /levels\/([^/]+)\/index\.json$/.exec(indexPath)?.[1];
    const order = (indexRaw as { levels?: unknown }).levels;
    if (!dir || !Array.isArray(order)) continue;
    let number = 0;
    for (const fileId of order) {
      if (typeof fileId !== 'string') continue;
      const entry = [...byPath.entries()].find(([p]) => {
        const m = LEVEL_PATH.exec(p);
        return m?.[1] === dir && m[2] === fileId;
      });
      const parsed = entry ? Level.safeParse(entry[1]) : null;
      if (!parsed?.success) continue;
      try {
        const rules = rulesFor(parsed.data);
        number += 1;
        const pack = packName(dir);
        levels.push({
          key: `${pack}/${fileId}`,
          pack,
          fileId,
          number,
          level: parsed.data,
          rules,
          stage: stageForDifficulty(parsed.data.meta?.difficulty),
        });
      } catch {
        // Level mit unbekanntem Ruleset wird uebersprungen.
      }
    }
  }
  return {
    levels,
    find: (pack, fileId) => levels.find((l) => l.pack === pack && l.fileId === fileId),
    after: (entry) => {
      const i = levels.findIndex((l) => l.key === entry.key);
      const next = levels[i + 1];
      return next && next.pack === entry.pack ? next : undefined;
    },
    rulesFor,
    rulesOf: (id) => rulesOf(id),
  };
}

let cached: Campaign | null = null;

/** Die ausgelieferte Kampagne (einmal gebaut). */
export function getCampaign(): Campaign {
  cached ??= buildCampaign(
    import.meta.glob(['../content/levels/*/*.json', '!../content/levels/*/index.json'], {
      eager: true,
      import: 'default',
    }),
    import.meta.glob('../content/levels/*/index.json', { eager: true, import: 'default' }),
    import.meta.glob('../content/rulesets/*.json', { eager: true, import: 'default' }),
  );
  return cached;
}
