# CLAUDE.md - Leitplanken

Projekt: **ParKing**, regelbasiertes Parkplatz-Puzzle im Browser.
Design und Ist-Stand: `docs/DESIGN.md`; Offenes: `docs/ROADMAP.md`; Vertraege: `docs/INTERFACES.md`.
Schnittstellendateien (siehe `docs/INTERFACES.md`) nur bewusst aendern, in einem eigenen kleinen Branch oder Commit und zusammen mit der Doku.

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

## Definition of Done (pro Merge)

- `lint`, `format:check`, `typecheck`, `test` und `test:e2e` laufen lokal gruen; CI auf `main` nach dem Merge pruefen.
- Tests fuer neue Logik sind mitgeliefert; Engine-Coverage >= 90 %.
- Branch klein (ca. < 500 Zeilen) und auf ein Thema beschraenkt; Schnittstellen-Aenderungen getrennt.
- Keine verbotenen Imports, keine Magic Numbers, kein Debug-Code.

## Git

- Arbeit auf Feature-Branches: `feat/<kurz>` (z. B. `feat/honk`), `fix/...`, `chore/...`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `ci:`, `refactor:`).
- Merge direkt nach `main` per Merge-Commit (`git merge --no-ff`), nachdem `lint`, `format:check`, `typecheck`, `test` und `test:e2e` lokal gruen sind.
- Kleine Vertragsaenderungen duerfen direkt auf `main` committet werden.
- Kein Force-Push auf `main`. Pull Requests sind optional.
