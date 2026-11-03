// Freischaltregeln der Kampagne ueber alle Welten (reine Funktionen auf Kampagne und Spielstand).
import type { Campaign, CampaignLevel, CampaignWorld } from './levels';
import { unlockedFlags } from './progress';
import type { SaveData } from './progress';

type Results = SaveData['levels'];

const isDone = (levels: Results, key: string): boolean => levels[key]?.completed === true;

/**
 * Welt-Freischaltung: Welt 1 ist offen, Welt N+1 sobald alle Level von Welt N geschafft sind.
 * Eine Welt mit bereits geschafften Leveln bleibt offen (keine Rueck-Sperre, z. B. nach Import).
 */
export function worldOpenFlags(worlds: readonly CampaignWorld[], levels: Results): boolean[] {
  return worlds.map((w, i) => {
    if (i === 0) return true;
    const prev = worlds[i - 1];
    const prevDone = prev !== undefined && prev.levels.every((l) => isDone(levels, l.key));
    return prevDone || w.levels.some((l) => isDone(levels, l.key));
  });
}

/** Level-Freischaltung einer Welt; eine gesperrte Welt hat nur gesperrte Level (ausser geschafften). */
export function levelOpenFlags(
  world: CampaignWorld,
  worldOpen: boolean,
  levels: Results,
): boolean[] {
  const inOrder = unlockedFlags(
    world.levels.map((l) => l.key),
    levels,
  );
  return inOrder.map((open, i) => {
    const key = world.levels[i]?.key;
    return (worldOpen && open) || (key !== undefined && isDone(levels, key));
  });
}

/** Naechstes Level nach `entry`: in der Welt, sonst Level 1 der naechsten Welt, falls freigeschaltet. */
export function nextCampaignLevel(
  campaign: Campaign,
  levels: Results,
  entry: CampaignLevel,
): CampaignLevel | undefined {
  const inPack = campaign.after(entry);
  if (inPack) return inPack;
  const i = campaign.worlds.findIndex((w) => w.pack === entry.pack);
  const nextWorld = campaign.worlds[i + 1];
  if (i < 0 || !nextWorld) return undefined;
  const open = worldOpenFlags(campaign.worlds, levels)[i + 1];
  return open ? nextWorld.levels[0] : undefined;
}
