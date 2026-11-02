# CLAUDE.md - Leitplanken fuer Agents

Projekt: **ParKing**, regelbasiertes Parkplatz-Puzzle im Browser. Source of truth: `PLAN.md`.
Schnittstellen (`docs/INTERFACES.md`, Engine-Typen, Schemas) aendert nur der Orchestrator.
Als Subagent: nur die im Auftrag genannten Verzeichnisse aendern.

## Architektur und Import-Regeln

```
ui/ + render/  ->  app/  ->  engine/ + schema/
```

- `src/engine` und `src/schema`: kein DOM, kein `pixi.js`, kein Import aus `render`, `ui`, `app`, `audio`, `solver`.
- `src/engine`: deterministisch. Verboten sind `Math.random`, `Date`, `performance` (Lint erzwingt das). Zufall nur ueber den eigenen seedbaren PRNG.
- Engine ist `step(state, action, ruleset) -> { state, events }`, immutable, JSON-serialisierbar. Der Renderer spielt nur Events ab.
- Regeln liegen als registrierte Regel-Module in `engine/rules/`. Keine level-spezifischen `if`s.
- Regeldaten kommen aus Ruleset-/Level-JSON (zod-validiert). Keine Magic Numbers im Code, die in ein Ruleset gehoeren (Slots, Kapazitaeten, Sichtbarkeit, Limits ...).
- Storage-Zugriffe immer in try/catch; keine Cookies, keine externen Requests, kein `innerHTML` mit fremden Inhalten.

## Befehle

```sh
pnpm install --frozen-lockfile
pnpm dev | build | preview
pnpm lint && pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e      # lokal ggf. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium
```

## Definition of Done (pro PR)

- `lint`, `format:check`, `typecheck`, `test` und `test:e2e` laufen lokal gruen; CI ist gruen.
- Tests fuer neue Logik sind mitgeliefert; Engine-Coverage >= 90 %.
- PR klein (ca. < 500 Zeilen), nur Dateien aus dem Auftrag, keine Aenderungen an Interface-Dateien.
- Keine verbotenen Imports, keine Magic Numbers, kein Debug-Code.

## Git

- Branches: `feat/<paket>-<kurz>` (z. B. `feat/a-engine-step`), `fix/...`, `chore/...`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `ci:`, `refactor:`).
- Nie direkt auf `main` pushen; Merge per PR (Squash) nach gruener CI.
