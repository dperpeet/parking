import classicJson from '../content/rulesets/classic.json';
import level007 from '../content/levels/pack-01/007.json';
import { Level, Ruleset, resolveRules } from '../schema';
import { BoardView, EventPlayer, createPixiApp } from '../render';
import { THEME } from '../render/theme';
import { applyThemeVars, bindKeyboard, createHud, mountShell } from '../ui';
import type { EngineApi } from './engine-port';
import { fakeEngine } from './fake-engine';
import { GameController } from './game-controller';

// ENGINE-WEICHE: einzige Stelle, an der die Engine gewaehlt wird.
// Sobald src/engine fertig ist: `import { createGame, step } from '../engine';`
// und `const engine: EngineApi = { createGame, step };` statt der Fake-Engine.
const engine: EngineApi = fakeEngine;

async function loadFont(): Promise<void> {
  try {
    await Promise.race([
      document.fonts.load(`800 24px ${THEME.font}`),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // Schrift ist optional, Fallback-Schrift reicht.
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  applyThemeVars(document.documentElement);

  const ruleset = Ruleset.parse(classicJson);
  const level = Level.parse(level007);
  const rules = resolveRules(ruleset, level.overrides);
  const controller = new GameController({ engine, levels: [level], rules });

  const shell = mountShell(root);
  await loadFont();

  const hud = createHud(shell, () => controller.getRules(), {
    dispatch: (a) => controller.dispatch(a),
    restart: () => controller.restart(),
    next: () => controller.next(),
    similar: () => controller.similar(),
  });

  // Pixi ist nur fuer das Brett zustaendig. Scheitert WebGL, bleibt das Spiel ueber die DOM-Buttons bedienbar.
  let board: BoardView | null = null;
  try {
    const pixi = await createPixiApp(shell.boardHost);
    board = new BoardView(pixi);
    pixi.onResize(() => board?.resize());
    shell.onFit(() => pixi.resize());
  } catch (err) {
    console.warn('Pixi konnte nicht gestartet werden', err);
  }

  const activePlayer = new EventPlayer(
    board ?? {
      shake: () => Promise.resolve(),
      exit: () => Promise.resolve(),
      sync: () => undefined,
    },
    hud,
  );

  controller.subscribe((u) => {
    if (u.kind === 'new') void activePlayer.reset(u.state);
    else void activePlayer.play(u.events, u.state);
  });
  bindKeyboard({
    moveFocus: hud.moveFocus,
    undo: () => controller.dispatch({ type: 'usePowerUp', powerUp: 'undo' }),
    restart: () => controller.restart(),
    isDialogOpen: hud.isDialogOpen,
  });
  controller.start();
}

void boot();
