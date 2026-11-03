// Rulesets fuer den Editor: dieselben JSON-Dateien wie die Kampagne, zod-geprueft.
import { Ruleset } from '../schema';

/** Ruleset, das bei fehlender Auswahl benutzt wird. */
export const EDITOR_DEFAULT_RULESET = 'classic';

/** Alle gueltigen Rulesets, Standard zuerst. `files` ersetzt den Glob (Tests). */
export function loadRulesets(files?: Record<string, unknown>): Ruleset[] {
  const modules =
    files ?? import.meta.glob('../content/rulesets/*.json', { eager: true, import: 'default' });
  const list: Ruleset[] = [];
  for (const raw of Object.values(modules)) {
    const parsed = Ruleset.safeParse(raw);
    if (parsed.success) list.push(parsed.data);
  }
  const rank = (r: Ruleset): number => (r.id === EDITOR_DEFAULT_RULESET ? 0 : 1);
  return list.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
