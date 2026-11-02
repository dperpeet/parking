import { describe, expect, it } from 'vitest';
import { buildCampaign, getCampaign } from '../../../src/app/levels';
import { Progress, emptySave } from '../../../src/app/progress';
import { buildSelectModel } from '../../../src/app/select-model';
import { stageForDifficulty } from '../../../src/app/stages';
import classic from '../../../src/content/rulesets/classic.json';
import level007 from '../../../src/content/levels/pack-01/007.json';
import { level } from '../helpers';

describe('Kampagne laden', () => {
  const campaign = getCampaign();

  it('laedt alle Level aus index.json in Reihenfolge', () => {
    expect(campaign.levels).toHaveLength(30);
    expect(campaign.levels.map((l) => l.number)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(campaign.levels[0]?.key).toBe('01/001');
    expect(campaign.levels[6]?.key).toBe('01/007');
    expect(campaign.levels[6]?.level.id).toBe('w1-07');
  });

  it('find und after', () => {
    const e = campaign.find('01', '007');
    expect(e?.number).toBe(7);
    expect(e && campaign.after(e)?.fileId).toBe('008');
    expect(campaign.find('01', 'nope')).toBeUndefined();
    const last = campaign.levels.at(-1);
    expect(last && campaign.after(last)).toBeUndefined();
  });

  it('Stufe folgt der Schwierigkeit aus meta.difficulty', () => {
    for (const l of campaign.levels) {
      expect(l.stage).toBe(stageForDifficulty(l.level.meta?.difficulty));
      expect(l.stage).toBeGreaterThanOrEqual(1);
      expect(l.stage).toBeLessThanOrEqual(6);
    }
  });

  it('Regeln werden aus Ruleset und Overrides aufgeloest', () => {
    const e = campaign.find('01', '007');
    expect(e?.rules.queue.slots).toBe(5);
    expect(campaign.rulesOf('classic').queue.slots).toBe(5);
    expect(() => campaign.rulesOf('gibtsnicht')).toThrow();
  });

  it('ueberspringt kaputte Level und unbekannte Rulesets', () => {
    const c = buildCampaign(
      {
        '/x/levels/pack-09/a.json': level007,
        '/x/levels/pack-09/b.json': { kaputt: true },
        '/x/levels/pack-09/c.json': { ...level007, ruleset: 'fremd' },
      },
      { '/x/levels/pack-09/index.json': { levels: ['a', 'b', 'c', 'fehlt'] } },
      { '/x/rulesets/classic.json': classic },
    );
    expect(c.levels.map((l) => l.key)).toEqual(['09/a']);
  });
});

describe('Auswahl-Modell', () => {
  const campaign = getCampaign();
  const base = {
    campaign,
    today: '2026-11-02',
    lang: 'de' as const,
    persistent: true,
    reachedStage: 1,
    streak: 0,
  };

  it('zeigt neu: Level 1 offen, Rest gesperrt, 0 von 90 Sternen', () => {
    const m = buildSelectModel({ ...base, save: emptySave() });
    expect(m.tiles[0]).toMatchObject({ number: 1, state: 'open' });
    expect(m.tiles.slice(1).every((t) => t.state === 'locked')).toBe(true);
    expect(m.starsTotal).toBe(90);
    expect(m.starsEarned).toBe(0);
    expect(m.worldTitle).toBe('Welt 1 · Werkstatt');
    expect(m.holdEnabled).toBe(false);
  });

  it('abgeschlossenes Level zeigt Sterne und schaltet den Nachfolger frei', () => {
    const p = new Progress(() => null);
    p.recordLevel('01/007', { stars: 2, moves: 12, stage: 2 });
    const m = buildSelectModel({ ...base, save: p.get(), reachedStage: p.reachedStage() });
    expect(m.tiles[6]).toMatchObject({ number: 7, state: 'done', stars: 2 });
    expect(m.tiles[7]).toMatchObject({ number: 8, state: 'open' });
    expect(m.tiles[8]?.state).toBe('locked');
    expect(m.starsEarned).toBe(2);
    expect(m.reachedStage).toBe(2);
  });

  it('Tageslevel: erledigt und Serie', () => {
    const p = new Progress(() => null);
    p.recordDaily('2026-11-02', { stars: 3, moves: 8 });
    const m = buildSelectModel({ ...base, save: p.get(), streak: p.currentStreak('2026-11-02') });
    expect(m.dailyDone).toBe(true);
    expect(m.streak).toBe(1);
    expect(m.dailyDate).toMatch(/2\./);
  });

  it('Halte-Stufe faellt auf die erreichte Stufe zurueck', () => {
    const p = new Progress(() => null);
    p.setHold(true, 3);
    const m = buildSelectModel({ ...base, save: p.get(), reachedStage: 3 });
    expect(m.holdEnabled).toBe(true);
    expect(m.holdStage).toBe(3);
    expect(level.id).toBe('w1-07');
  });
});
