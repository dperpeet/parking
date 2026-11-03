import { createGame, step } from '../engine';
import { applyThemeVars } from '../ui';
import type { EngineApi } from './engine-port';
import { mountGameScreen } from './game-screen';
import { getCampaign } from './levels';
import { Progress } from './progress';
import { createRouter } from './router';
import type { Route, Router } from './router';
import { mountSelectScreen } from './select-screen';
import { GameSession } from './session';
import { applyLanguage, applyMotion } from './settings-apply';
import { createSolverPort } from './solver-port';

// Einzige Stelle, an der die Engine gewaehlt wird: die echte Engine.
const engine: EngineApi = { createGame, step };

function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;
  applyThemeVars(document.documentElement);

  const progress = new Progress(() => window.localStorage);
  applyLanguage(progress.get().settings.language, navigator.language);
  applyMotion(progress.get().settings.motion);

  const campaign = getCampaign();
  const solver = createSolverPort();
  const now = (): Date => new Date();
  let current: { dispose(): void } | null = null;
  const router: Router = createRouter(window, (route) => show(route));

  // Code des Levels, das der Editor gerade im Spiel testet; "Zurueck" fuehrt dann in den Editor.
  let editorReturn: string | null = null;
  // Zaehler gegen veraltete lazy Imports, falls die Route vor dem Laden wechselt.
  let showId = 0;

  const show = (route: Route): void => {
    current?.dispose();
    current = null;
    showId += 1;
    if (!(route.name === 'shared' && route.code === editorReturn)) editorReturn = null;
    if (route.name === 'select') {
      current = mountSelectScreen(root, { progress, campaign, router, now });
      return;
    }
    if (route.name === 'editor') {
      const id = showId;
      // Editor als eigener Chunk, damit das Initial-Bundle klein bleibt.
      void Promise.all([import('./editor-screen'), import('./editor-rulesets')])
        .then(([screen, sets]) => {
          if (id !== showId) return;
          current = screen.mountEditorScreen(root, {
            progress,
            solver,
            router,
            rulesets: sets.loadRulesets(),
            code: route.code,
            testPlay: (code) => {
              editorReturn = code;
              router.navigate({ name: 'shared', code });
            },
          });
        })
        .catch(() => {
          // Chunk nicht ladbar (z. B. offline ohne Cache): zurueck zur Levelauswahl.
          if (id === showId) current = mountSelectScreen(root, { progress, campaign, router, now });
        });
      return;
    }
    const leave = (): void => {
      if (route.name === 'shared' && editorReturn === route.code) {
        router.navigate({ name: 'editor', code: route.code });
      } else {
        router.navigate({ name: 'select' });
      }
    };
    const session = new GameSession(
      {
        engine,
        solver,
        progress,
        campaign,
        now,
        syncRoute: (r) => router.replace(r),
        exit: leave,
      },
      route,
    );
    current = mountGameScreen(root, session, {
      back: leave,
      retry: () => show(route),
    });
  };

  show(router.current());
}

boot();
