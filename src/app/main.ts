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

// ENGINE-WEICHE: einzige Stelle, an der die Engine gewaehlt wird (Tests nutzen app/fake-engine.ts).
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

  const show = (route: Route): void => {
    current?.dispose();
    current = null;
    if (route.name === 'select' || route.name === 'editor') {
      // 'editor': Platzhalter bis zum Level-Editor (Paket F2).
      current = mountSelectScreen(root, { progress, campaign, router, now });
      return;
    }
    const session = new GameSession(
      {
        engine,
        solver,
        progress,
        campaign,
        now,
        syncRoute: (r) => router.replace(r),
        exit: () => router.navigate({ name: 'select' }),
      },
      route,
    );
    current = mountGameScreen(root, session, {
      back: () => router.navigate({ name: 'select' }),
      retry: () => show(route),
    });
  };

  show(router.current());
}

boot();
