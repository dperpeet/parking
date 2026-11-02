# Projektplan: „ParKing" – regelbasiertes Parkplatz-Puzzle im Browser

> Name: **ParKing**. Kostenlos, ohne Werbung, ohne Payments, ohne Accounts, ohne Tracking. Es geht nur um den Spielspaß.
> Genre: Parkplatz-/Stau-Puzzle mit Farb-Matching. Das Spiel ist ein **eigenes** Spiel in diesem Genre, mit eigenem Namen, eigener Grafik und eigenen Mechaniken, und kein Nachbau eines bestimmten Titels.
> Kernidee: **Alle Regeln sind datengetrieben** (JSON-Rulesets + JSON-Levels) und damit von uns frei konfigurierbar.

---

## 0. Zusammenfassung

| Thema | Entscheidung |
|---|---|
| Plattform | Browser, mobile-first (Touch), läuft auch am Desktop, installierbar als PWA, offline spielbar |
| Stack | TypeScript (strict), Vite, **PixiJS v8** fürs Spielfeld, DOM/CSS für Menüs, zod für Schemas, Vitest + Playwright |
| Architektur | Headless, deterministische Engine (`step(state, action) → {state, events}`) ↔ Renderer spielt nur Events ab |
| Regeln | Ruleset-JSON + Level-JSON mit `overrides`, validiert per zod |
| Content | Solver + Generator (Web Worker), Level-Editor, Teilen per URL-Fragment (kein Server nötig) |
| Hosting | **Eigener Server** (Docker + Caddy, statische Dateien). GitHub Pages wäre nur mit öffentlichem Repo oder kostenpflichtigem GitHub-Plan gratis |
| Umsetzung | Claude Code als Orchestrator, Arbeitspakete parallel an **Sonnet-Subagents**, CI als hartes Gate |

**Getroffene Entscheidungen:**
1. Name: **ParKing**. Setting: Spielzeug-Werkstatt-Optik.
2. Hosting: **eigener Server** (Docker + Caddy). GitHub Pages für private Repos setzt einen kostenpflichtigen Plan voraus (GitHub Pro/Team). Auf GitHub Free gibt es Pages nur für öffentliche Repos.
3. Tageslevel: **lokale Zeit** (Wechsel um Mitternacht des Spielers).
4. Lizenzen: Code **MIT**, Level/Inhalte **CC BY 4.0**.
5. Fortschritt: Freigespielte Level werden lokal im Browser gespeichert. Man kann jederzeit **auf der aktuellen Schwierigkeitsstufe bleiben** (siehe 1.8).

---

## 1. Game Design

### 1.1 Setting
Eine Spielzeug-Werkstatt: Holzautos auf Holzbrettern, die Passagiere sind Holzfiguren. Die Optik besteht aus flachen Vektorformen und wird zur Laufzeit erzeugt, deshalb braucht es keine Bild-Assets pro Farbe. Jede Farbe trägt zusätzlich ein **Symbol** (Kreis, Dreieck, Stern …), damit das Spiel farbenblind-tauglich ist.

### 1.2 Core Loop (Default-Regeln)
1. Das Raster enthält Fahrzeuge (Länge 2/3/4, Farbe, Blickrichtung). Darunter liegt die **Halteschlange** (N Slots) und daneben die **Passagierreihe**.
2. Tippt man ein Fahrzeug an, fährt es in Blickrichtung hinaus, sofern der Weg bis zum Rand frei ist, und belegt den nächsten freien Slot. Ist der Weg blockiert, wackelt es nur. Das kostet nichts und zählt nicht als Zug.
3. Der vorderste Passagier steigt automatisch in ein passendes Fahrzeug in der Schlange.
4. Volle Fahrzeuge fahren ab und machen ihren Slot frei.
5. **Sieg:** Passagiere und Fahrzeuge sind alle weg. **Niederlage:** Alle Slots sind belegt und kein Fahrzeug passt zum vordersten Passagier.

Defaults: 5 Slots; Fahrzeuge s/m/l = Kapazität 2/4/6; nur geradeaus; strikte Passagier-Reihenfolge; 4 Passagiere sichtbar; kein Zeit- oder Zuglimit; Sterne nach Zügen relativ zum Solver-Optimum.

**Eigene Twists:** Doppelfarb-Fahrzeuge, Power-Up „Hupe" (ein Blocker weicht aus), Themenwelten mit je eigenem Regelpaket (Einbahnstraßen, Schranken, Schlüssel, Mystery), optional eine kleine Melodie aus den Abfahrt-Tönen.

### 1.3 Konfigurierbares Regelsystem
Ein Level referenziert ein Ruleset und kann einzelne Werte per `overrides` ändern (Deep-Merge). Fehlende Werte fallen auf die Defaults zurück.

| Gruppe | Parameter (Typ, Default) | Wirkung |
|---|---|---|
| **Queue** | `slots` (int 1–12, 5) · `fillPolicy` (`firstFree`/`fifo`) · `lockedSlots` (int[], []) · `loseOnFull` (bool, true) | Größe und Verhalten der Halteschlange |
| **Fahrzeuge** | `types` (Map → {length, capacity}) · `colors` (≤ 10) · `dualColor` (false) · `departOnFull` (true) | Größen, Kapazitäten, Palette; bei `departOnFull=false` blockieren volle Fahrzeuge (Hardcore) |
| **Bewegung** | `model` (`straight`/`turns`/`pathfinding`, straight) · `exits` (`edges`/`gates`) · `reversible` (false) | Wie und wohin Fahrzeuge ausfahren |
| **Passagiere** | `order` (`strict`/`lookahead`/`free`) · `lookahead` (1) · `visible` (4) · `mysteryRate` (0) · `boardPolicy` (`firstMatch`/`largestFree`/`playerChoice`) | Reihenfolge, Sichtbarkeit, Einsteige-Logik |
| **Limits/Wertung** | `timeSec` (null) · `moves` (null) · `starMode` (`moves`/`time`/`powerupsUsed`) · `stars` {three: +0, two: +3} | Zeit-/Zuglimit, Sterne relativ zum Par |
| **Spezialobjekte** | `barriers` · `oneWay` · `keyVehicles` · `fixed` · `mysteryVehicles` (alle false) | Schranken, Einbahnfelder, Schloss/Schlüssel, Poller, verdeckte Farben |
| **Power-Ups** | `undo` {true, 3} · `shuffle` {true, 1} · `extraSlot` {true, 1} · `honk` {false} · `earnRule` (`none`/`perLevel`/`byStars`) | Power-Ups werden nur **verdient**, nie gekauft |

### 1.4 Datenformate (Beispiele)

**Ruleset** (`src/content/rulesets/classic.json`):
```json
{
  "schema": "parking.ruleset/1",
  "id": "classic",
  "name": { "de": "Klassik", "en": "Classic" },
  "queue": { "slots": 5, "fillPolicy": "firstFree", "lockedSlots": [], "loseOnFull": true },
  "vehicles": {
    "types": { "s": { "length": 2, "capacity": 2 }, "m": { "length": 3, "capacity": 4 }, "l": { "length": 4, "capacity": 6 } },
    "colors": ["red", "blue", "green", "yellow", "purple", "orange"],
    "dualColor": false, "departOnFull": true
  },
  "movement": { "model": "straight", "exits": "edges", "reversible": false },
  "passengers": { "order": "strict", "lookahead": 1, "visible": 4, "mysteryRate": 0, "boardPolicy": "firstMatch" },
  "limits": { "timeSec": null, "moves": null },
  "scoring": { "starMode": "moves", "stars": { "three": 0, "two": 3 } },
  "special": { "barriers": false, "oneWay": false, "keyVehicles": false, "fixed": false, "mysteryVehicles": false },
  "powerups": { "undo": { "enabled": true, "uses": 3 }, "shuffle": { "enabled": true, "uses": 1 },
                "extraSlot": { "enabled": true, "uses": 1 }, "honk": { "enabled": false, "uses": 0 }, "earnRule": "byStars" }
}
```

**Level** (`x` nach rechts, `y` nach unten; `pos` ist die Kopfzelle, `dir` die Blickrichtung N/E/S/W, die Länge erstreckt sich nach hinten):
```json
{
  "schema": "parking.level/1",
  "id": "w1-07",
  "title": { "de": "Enge Gasse", "en": "Narrow Lane" },
  "ruleset": "classic",
  "overrides": { "queue": { "slots": 4 }, "passengers": { "visible": 3 } },
  "grid": { "width": 6, "height": 6,
            "cells": [ { "x": 2, "y": 2, "type": "fixed" }, { "x": 5, "y": 3, "type": "oneWay", "dir": "E" } ] },
  "vehicles": [
    { "id": "v1", "pos": [0, 1], "dir": "E", "type": "s", "color": "red" },
    { "id": "v2", "pos": [3, 0], "dir": "S", "type": "m", "color": "blue" },
    { "id": "v3", "pos": [5, 5], "dir": "N", "type": "l", "color": "green" },
    { "id": "v4", "pos": [1, 4], "dir": "W", "type": "s", "color": "yellow", "locked": true, "keyId": "v1" }
  ],
  "passengers": ["red","red","blue","blue","blue","blue","green","green","green","green","green","green","yellow","yellow"],
  "meta": { "author": "kampagne", "par": { "moves": 4 }, "difficulty": 2.3, "solverVersion": "1.0" }
}
```

**Semantische Validierung** (beim Laden, im Editor und beim URL-Import):
- Passagiere je Farbe = Summe der Kapazitäten dieser Farbe.
- Keine Überlappungen, alles liegt im Raster.
- Schlüsselketten sind azyklisch.
- Das Level ist laut Solver lösbar.

### 1.5 Solver, Generator, Schwierigkeit
- **Zustand:** Bitmaske der abgefahrenen Fahrzeuge + Queue-Füllstände + Passagier-Index + Power-Up-Verbrauch. Bei `straight` gibt es nur n Verzweigungen pro Zustand, deshalb ist eine vollständige Suche bis etwa 20 Fahrzeuge machbar.
- **Solver:** A*/IDA* über die Engine-`step`-Funktion mit kanonischem State-Hash. Pruning: tote Zustände (Queue voll, kein Match) werden verworfen. Knoten- und Zeitlimits gelten, „unbekannt" ist ein erlaubtes Ergebnis. Der Solver läuft im **Web Worker** und zusätzlich als Node-CLI für die CI.
- **Generator (Rückwärts-Konstruktion):**
  1. Eine Ausfahr-Reihenfolge festlegen.
  2. Fahrzeuge rückwärts platzieren. Ein Fahrzeug darf dabei nur von später ausfahrenden blockiert werden, so ist die Lösbarkeit garantiert.
  3. Die Passagier-Sequenz aus der Lösung mit steuerbarer „Verwürfelung" ableiten.
  4. Den Solver prüfen lassen (Par, keine trivialen Level).

  Der Generator ist seed-deterministisch und nutzt einen eigenen PRNG (mulberry32/sfc32).
- **Metriken:** Slack (max. Queue-Belegung / Slots), Lösungsdichte, Tote-Enden-Tiefe, Blockade-Tiefe, Farbvielfalt-Druck, Informationsgrad. Daraus wird eine Schwierigkeit 1–10 berechnet. Sie steuert die Kampagnenkurve (Sägezahn) und die Tageslevel (Mo leicht → So schwer).

### 1.6 Spielmodi
- **Kampagne:** Welten à 20 Level, jede Welt führt ein Regelpaket ein. Die Level werden generiert, dann kuratiert und als statische JSON-Dateien ausgeliefert. Sterne schalten Bonuslevel frei.
- **Tageslevel:** `seed = hash("parking" + lokales Datum YYYY-MM-DD)`, Wechsel um Mitternacht Ortszeit. Das Level wird offline im Browser generiert und ist für alle gleich, ohne Server. Ergebnis als teilbarer Text („ParKing 2026-11-02: ★★★ in 9 Zügen"), Streak lokal.
- **Endlos:** Ein Run-Seed liefert Level mit steigender Schwierigkeit. Mit „Stufe halten“ bleibt die Schwierigkeit konstant (siehe 1.8). Ein verlorenes Level beendet den Run, der Bestwert bleibt lokal.
- **Level-Editor:** Fahrzeuge platzieren und drehen, Passagiere automatisch erzeugen, Ruleset und Overrides wählen. Ein Live-Solver zeigt „lösbar, Par = N" an. Teilen geht nur mit bestandenem Check oder mit dem Vermerk „ungeprüft".
- **Teilen per URL (ohne Server):** Level minimiert → deflate (`fflate`) → base64url im Fragment: `https://…/#/play?l=1.<payload>`. Das Fragment geht nie an einen Server. Weitere Eckpunkte:
  - Versionspräfix im Payload, Längenlimit ca. 2 kB.
  - Beim Import: zod + Semantik + Solver.
  - Inhalte werden nie als HTML eingefügt.

### 1.7 Fortschritt ohne Accounts
- `localStorage`-Key `parking.save.v1` (versioniert, mit Migrationen) für Kampagne, Tageslevel, Endlos, Power-Ups, eigene Level und Einstellungen.
- Alle Zugriffe laufen in try/catch. Fällt der Speicher aus (z. B. im privaten Tab), läuft das Spiel im Arbeitsspeicher weiter.
- Export/Import als `.json` oder Textcode (mit Prüfsumme). Beim Import mit vorhandenem Stand: zusammenführen oder ersetzen.
- Keine Cookies, keine externen Requests, keine Telemetrie.

### 1.8 Freischalten und „Stufe halten“
Spielerwunsch: Freigespieltes bleibt erhalten, und niemand wird gezwungen, schwieriger zu spielen.

- **Freischalten:** Ein Level gilt als geschafft ab 1 Stern und schaltet das nächste frei. Fertige Welten schalten die nächste Welt frei. Der Stand (`unlocked`, Sterne, beste Zugzahl) liegt in `parking.save.v1` im `localStorage`.
- **Freie Wahl:** Jedes freigespielte Level und jede freigespielte Welt ist jederzeit wieder spielbar. Nach einem Sieg gibt es drei Knöpfe: „Weiter“, „Nochmal“ und **„Ähnliches Level“**.
- **„Ähnliches Level“:** Der Generator erzeugt ein neues Level mit gleichem Regelsatz und gleicher Schwierigkeit (±0,5 auf der 1–10-Skala, gleiche Welt-Mechaniken). Damit lässt sich eine Stufe beliebig lange üben, ohne dass sie schwerer wird.
- **„Stufe halten“ (Schalter):**
  - Im **Endlos-Modus** fixiert der Schalter die Schwierigkeit auf die aktuelle (oder eine gewählte) Stufe, statt sie zu steigern.
  - In der Kampagne kann man stattdessen eine **Übungsstufe** wählen: Jede bereits erreichte Schwierigkeitsstufe ist als Endlos-Quelle spielbar.
- **Gespeichert wird:** höchste erreichte Stufe pro Regelsatz, gewählte Halte-Stufe, Bestwerte pro Stufe. Export/Import wie in 1.7.
- **Ohne localStorage** (z. B. privater Tab) gilt alles nur für die laufende Sitzung. Ein Hinweis erklärt, dass der Fortschritt nicht gespeichert wird.

---

## 2. Technik

### 2.1 Stack
| Bereich | Wahl | Warum |
|---|---|---|
| Build | TypeScript strict, Vite, pnpm, Node 22 LTS | Schnell, statischer Output, Worker + PWA-Plugin |
| Spielfeld | **PixiJS v8** | Reiner Renderer (Batching, Hit-Testing, Atlas). Phaser wäre zu schwer und würde eine eigene Architektur erzwingen, Canvas2D/SVG wird bei vielen Animationen zäh |
| Menüs/Editor-Panels | DOM + CSS, Vanilla TS | Barrierefrei, übersetzbar, klein |
| Animation | GSAP Core (Timelines) oder tween.js | Fahrwege, nachrückende Queue |
| Audio | Howler.js, Audio-Sprites | Mobile-Unlock, geringe Latenz |
| Validierung | zod (Typen via `z.infer`), JSON-Schema-Export | Eine einzige Quelle für Typen und Validierung |
| Tests | Vitest (+ fast-check), Playwright (Mobile + Desktop) | |
| Qualität | ESLint (flat), Prettier, `tsc --noEmit` | |
| PWA | vite-plugin-pwa (Workbox) | Offline, installierbar |

### 2.2 Architektur
```
ui/ + render/  ──►  app/ (Orchestrierung, Routing, Persistenz)  ──►  engine/ + schema/
                                                                  (kein DOM, kein Pixi, kein Math.random/Date)
```
- **Engine:** `step(state, action, ruleset) → { state, events[] }`, immutable und JSON-serialisierbar. Aktionen: `TapVehicle`, `UsePowerUp`, `Undo`, `Restart`. Events: `VehicleExited`, `QueuedAt`, `PassengerBoarded`, `VehicleDeparted`, `Won`, `Lost` …
- Die Regeln stecken als kleine, registrierte **Regel-Module** in `engine/rules/`. Level-spezifische `if`s gibt es nicht.
- **Renderer** spielt nur Events ab. Spiel, Replays, Tests und Solver nutzen deshalb exakt dieselbe Logik.
- Die Import-Grenzen werden per ESLint erzwungen.

**Repo-Struktur**
```
parking/
├─ .github/workflows/ (ci.yml, deploy.yml, release.yml), CODEOWNERS, pull_request_template.md
├─ docs/ (ARCHITECTURE.md, INTERFACES.md, RULESETS.md, LEVEL-FORMAT.md, adr/)
├─ deploy/docker/ (Dockerfile, Caddyfile, nginx.conf, compose.yml)
├─ public/ (icons/, audio/, og-image.png)
├─ src/
│  ├─ schema/   (ruleset, level, share, migrations)
│  ├─ engine/   (state, step, rng, events, rules/, hash)
│  ├─ solver/   (search, heuristics, generator, difficulty, worker.ts, client.ts)
│  ├─ content/  (rulesets/*.json, levels/pack-XX/*.json, index.json)
│  ├─ render/   (pixi-app, board-view, vehicle-view, queue-view, fx, palette, event-player)
│  ├─ ui/       (screens/, components/, editor/, a11y/, styles/)
│  ├─ app/      (main, router, game-controller, storage, share, settings)
│  ├─ audio/  i18n/ (de.json, en.json)  sw/
├─ tests/ (unit/, content/ — alle Level valide + lösbar, e2e/)
├─ tools/ (solve-levels.ts, gen-levels.ts, export-schema.ts, bundle-size-check.ts)
├─ CLAUDE.md   ← Leitplanken für Claude Code & Subagents
└─ README.md, LICENSE, ASSETS.md
```

### 2.3 Qualität, PWA, Barrierefreiheit, i18n
- **Budgets (CI-geprüft):**
  - Initial-JS ≤ 250 kB gz, Precache ≤ 1,5 MB.
  - Solver und Editor werden lazy geladen.
  - 60 fps bis 10×10 / 40 Fahrzeuge.
  - `step` < 1 ms, der Main-Thread blockiert nie länger als 50 ms.
- **PWA:**
  - Manifest und Precache für App-Shell, Level und Audio.
  - Bei neuer Version erscheint ein Hinweis „Neue Version – neu laden". Mitten im Level wird nie automatisch neu geladen.
  - Offline-E2E-Test.
- **Barrierefreiheit:**
  - Jede Farbe zusätzlich mit Symbol, Palette auf Okabe-Ito-Basis, Hochkontrast-Modus.
  - Tippziele ≥ 44 px, `prefers-reduced-motion` wird respektiert.
  - Tastaturbedienung (Pfeile/Enter/U/R), `aria-live`-Ansagen.
- **i18n:** de/en mit typisierten Keys (der Build bricht bei fehlenden Keys), `Intl.PluralRules`.

### 2.4 Hosting & Deployment
**Eigener Server (gewählt):** Multi-Stage-Docker (Node-Build → `caddy:2-alpine`), Vite-`base` = `/`, Hash-Routing (keine Rewrites nötig).
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build --base=/
FROM caddy:2-alpine
COPY deploy/docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
```
```caddyfile
spiel.example.org {
  root * /srv
  encode zstd gzip
  file_server
  header {
    Content-Security-Policy "default-src 'self'; img-src 'self' data:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
  }
  @assets path /assets/* /audio/* /icons/*
  header @assets Cache-Control "public, max-age=31536000, immutable"
  @shell path / /index.html /sw.js /manifest.webmanifest
  header @shell Cache-Control "no-cache"
}
```
Caddy holt das TLS-Zertifikat automatisch (Domain + DNS-A-Record auf den Server nötig).

**Deploy-Weg (Empfehlung):** Die CI baut bei Push auf `main` ein Image und pusht es nach GHCR. Für private Repos ist GHCR im Rahmen des Free-Kontingents kostenlos, und ein kleines statisches Image passt locker hinein. Der Server zieht das Image per Deploy-Job über SSH (`docker compose pull && up -d`). Die Zugangsdaten liegen als GitHub-Secrets: SSH-Key, Host und Nutzer.
- Einfachere Alternative: per SSH `git pull && docker compose up -d --build` direkt auf dem Server.
- Später möglich: das Repo öffentlich machen und kostenlos auf GitHub Pages ausweichen. Der Build ist dafür schon vorbereitet (`base` konfigurierbar).

**Server-Voraussetzungen:** Docker + Compose, Ports 80/443 offen, eine (Sub-)Domain.

**CI-Pipeline** (`ci.yml`, für PRs und `main`):
1. install
2. lint ‖ typecheck ‖ unit + content tests (Engine-Coverage ≥ 90 %, alle Level lösbar)
3. build + Bundle-Size-Check
4. Playwright E2E (Mobile + Desktop)
5. deploy (nur `main`): Image → GHCR → SSH-Deploy auf deinen Server

---

## 3. Meilensteine

| M | Inhalt | Deliverables | Definition of Done |
|---|---|---|---|
| **M0 Setup** | Gerüst | Vite/TS/Lint/Tests, Ordnerstruktur, `CLAUDE.md`, `docs/INTERFACES.md`, zod-Schemas v1 (Entwurf), CI, Docker/Caddy-Deploy, leere Seite live auf deinem Server | `main` deployt automatisch, Import-Grenzen werden per Lint erzwungen |
| **M1 Engine** | Spiellogik headless | `step`, RNG, Klassik-Ruleset, Events, Replay-Format, 10 handgebaute Testlevel | Coverage ≥ 90 %; Determinismus-Test (gleiche Aktionen → gleicher Hash); Property-Tests |
| **M2 Prototyp** | Spielbar | Pixi-Board, Touch, Event-Player, HUD, Sieg/Niederlage, einfache Levelauswahl | Auf iOS Safari + Android Chrome flüssig spielbar; E2E „gewinnen" und „verlieren" grün |
| **M3 Regeln + 30 Level** | Datengetrieben | ≥ 3 Rulesets, Power-Ups (Undo/Shuffle/Extra-Slot), Fortschrittsspeicher (Freischalten + freie Levelwahl), 30 Level in 3 Packs, Regel-Doku | Ruleset-Wechsel ohne Codeänderung; alle Level CI-verifiziert; Fortschritt übersteht Reload |
| **M4 Solver/Generator/Editor/Share** | Content-Tools | Worker-Solver (Par + Hint), Generator mit Seed + Schwierigkeit, Tageslevel (lokale Zeit), Endlos mit „Stufe halten“, „Ähnliches Level“, Editor, Share-URLs | Editor-Level → URL → anderes Gerät spielt identisch; Fuzz-Test: kaputte URLs verursachen nie einen Crash |
| **M5 Polish** | Qualität | Sound, Animationen/Partikel, Spezialobjekte (Einbahn, Schlüssel, Schranken, Mystery), i18n, A11y, PWA | Lighthouse PWA/A11y ≥ 90, Offline-E2E grün, Budgets eingehalten |
| **M6 Release** | Launch | ≥ 60 Level, README/Anleitung, Datenschutzhinweis (keine Cookies), Social-Preview, `v1.0.0`, optional Docker-Image | Release-Checkliste erledigt, Cross-Browser-Smoke, Deployment verifiziert |

**MVP = M0–M3** (straight-Bewegung, strikte Passagiere, Undo, 30 Level). `turns`/`pathfinding` und Ähnliches kommen danach.

---

## 4. Arbeitsweise mit Claude Code + Sonnet-Subagents

**Vorab fixiert durch den Orchestrator (M0, nicht delegiert):**
- `docs/INTERFACES.md` + TS-Typen: Engine-API (`GameState`, `Action`, `GameEvent`, `step`)
- zod-Schemas mit Beispiel-JSONs
- Renderer-Vertrag (`EventPlayer` konsumiert `GameEvent[]`)
- Solver-Worker-Protokoll (`SolveRequest`/`SolveResult`)
- Paletten-/Symbol-Tabelle und i18n-Key-Konvention

Diese Dateien ändert nur der Orchestrator (CODEOWNERS).

**Parallele Pakete:**

| Paket | Auftrag an Sonnet-Subagent | Start nach |
|---|---|---|
| A Engine | `engine/` + Tests, Regel-Module | M0 |
| B Renderer/UI | `render/`, `ui/`, Input; arbeitet gegen Event-Fixtures (Mock-Engine) | M0 |
| C Level-Content | Level-JSONs + Pack-Index, Prüfung per CLI | Schemas (M0) |
| D Solver/Generator | `solver/` + Worker + CLI | Engine `step` stabil (Ende M1) |
| E CI/Deploy | Workflows, Docker/Caddy, Bundle-Check | M0 |
| F Editor/Share | Editor-UI, URL-Codec | A + D |
| G i18n/A11y/Audio | kleine Pakete | B |

**Regeln je Auftrag:** feste Dateiliste (darf nur diese Verzeichnisse ändern), Akzeptanzkriterien, Tests werden mitgeliefert, Interface-Dateien bleiben tabu. Pakete, die dieselben Dateien berühren, laufen nie parallel. Jeder Subagent arbeitet in einem eigenen Worktree/Branch.

**Review-Schleife:**
1. Der Subagent liefert einen PR inklusive lokalem Self-Check.
2. Die CI ist das harte Gate.
3. Der Orchestrator reviewt gegen Interfaces und `CLAUDE.md` (kein `Math.random` in der Engine, keine Magic Numbers statt Ruleset-Werten, keine verbotenen Imports).
4. Höchstens 2 Nachbesserungsrunden, danach übernimmt der Orchestrator oder schneidet das Paket neu.
5. Zu jedem Meilenstein Playwright-Screenshots als Artefakt plus ein Gerätetest durch dich.

**Branches:**
- `main` ist geschützt: nur PRs, CI grün, Squash-Merge, Conventional Commits.
- Feature-Branches heißen `feat/<paket>-<kurz>`, PRs bleiben unter ca. 500 Zeilen.
- Tags `m1`…`m6` und `v1.0.0`.

---

## 5. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Regeln ändern sich spät, Renderer und Content brechen | Event-Modell und Schemas früh einfrieren, Schema-Versionen + Migrationen, Content-Tests als Regressionsnetz |
| Solver-Zustandsexplosion | A* + Hashing, Knoten-/Zeitlimits, Abbruch im Worker, „unbekannt" ist erlaubt, Levelgröße begrenzen |
| Interface-Drift bei Subagents | Dateibereiche pro Auftrag, CODEOWNERS, Lint-Grenzen, kleine PRs |
| Performance auf alten Handys | Budgets in der CI, DPR-Cap 2, Textur-Atlas, früher Gerätetest (M2) |
| iOS-Safari-Eigenheiten (Audio, Storage, PWA) | Audio erst nach einer Geste, Storage hinter try/catch, WebKit in nightly E2E |
| Manipulierte oder zu lange Share-URLs | Größenlimit, zod + Semantik, kein `eval`/`innerHTML`, strikte CSP |
| Veralteter Service-Worker-Cache | Gehashte Assets, Update-Prompt, `no-cache` für die Shell |
| Schwache Schwierigkeitskurve | Generator-Metriken, Playtest-Runden, Review jedes Packs durch dich |
| Nähe zu bestehenden Spielen (Marken/Optik) | Eigener Name, eigene Grafik, eigene Mechaniken; nur CC0- oder eigene Assets, dokumentiert in `ASSETS.md` |

---

## 6. Nächste Schritte
1. Repo-Zugriff für Claude Code einrichten (Claude GitHub App für `dperpeet/parking`), dann diesen Plan nach `main` pushen.
2. Server-Infos bereitstellen: (Sub-)Domain, Docker vorhanden? SSH-Deploy-Nutzer anlegen, Secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` im Repo hinterlegen.
3. M0 starten: Orchestrator legt Gerüst, Interfaces und CI an. Danach laufen die Pakete A, B, C und E parallel als Sonnet-Subagents.
