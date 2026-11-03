# ParKing: Design

## Überblick

ParKing ist ein kostenloses Parkplatz-Puzzle im Browser: Fahrzeuge ausparken, Passagiere in passende Fahrzeuge einsteigen lassen.
Es gibt keine Werbung, keine Accounts, keine Payments und kein Tracking. Das Spiel ist ein eigenes Spiel im Genre der Parkplatz-/Stau-Puzzles mit Farb-Matching, mit eigenem Namen, eigener Grafik und eigenen Mechaniken.

Alle Regeln sind datengetrieben: Rulesets und Level liegen als JSON vor und werden mit zod validiert.

- Lizenzen: Code unter [MIT](../LICENSE), Level und sonstige Inhalte unter CC BY 4.0.
- Hosting: GitHub Pages unter `/parking/`. Optional läuft das Spiel auf einem eigenen Server (podman, Caddy). Siehe [README](../README.md) und `deploy/container/`.

## Spielprinzip

### Core Loop

1. Das Raster enthält Fahrzeuge (Länge, Farbe, Blickrichtung). Darunter liegt die Halteschlange mit mehreren Slots, daneben die Passagierreihe.
2. Tippt man ein Fahrzeug an, fährt es in Blickrichtung zum Rasterrand und belegt den nächsten freien Slot. Ist der Weg blockiert, wackelt es nur. Das kostet nichts und zählt nicht als Zug.
3. Der vorderste Passagier steigt automatisch in ein Fahrzeug der Schlange mit gleicher Farbe und freier Kapazität.
4. Volle Fahrzeuge fahren ab und geben ihren Slot frei.
5. Sieg: Alle Passagiere sind eingestiegen. Niederlage: Alle Slots sind belegt und der vorderste Passagier passt nirgends. Weitere Niederlagegründe (`noMoves`, Zuglimit, Zeit) stehen in [INTERFACES.md](INTERFACES.md).

### Defaults (`classic`)

Quelle: `src/content/rulesets/classic.json`.

- 5 Slots, Füllung `firstFree`, keine gesperrten Slots.
- Fahrzeugtypen `s`/`m`/`l`: Länge 2/3/4, Kapazität 2/4/6.
- Farben: `blue`, `orange`, `green`, `yellow`, `pink`, `purple`.
- Bewegung nur geradeaus (`straight`) zum Rand (`edges`), nicht umkehrbar.
- Passagiere in strikter Reihenfolge (`strict`), `visible` = 8 (Darstellung und Shuffle-Fenster), `boardPolicy` `firstMatch`, kein Mystery.
- Weder Zeit- noch Zuglimit.
- Wertung: `starMode` = `powerupsUsed`. 3 Sterne bei höchstens 0 genutzten Power-Ups, 2 Sterne bei höchstens 2, sonst 1 Stern.
- Power-Ups: Undo (3), Shuffle (1), Extra-Slot (1), Hupe aus. `earnRule` = `byStars`.

Power-Ups werden nur verdient, nie gekauft. Zusätzlich gibt es in der App Tipps (3 pro Level, `src/app/hints.ts`); ein genutzter Tipp begrenzt die Sterne auf 2.

### Stil

Comic-Look: dicke Konturen, harte Schatten, kräftige Farben, Schrift Baloo 2. Jede Farbe trägt zusätzlich ein Symbol, damit das Spiel ohne Farbwahrnehmung spielbar ist. Entscheidung und Werte: [ADR 0001](adr/0001-visual-style-comic.md); verbindlich ist `src/render/theme.ts`.

## Regelsystem

Ein Level referenziert ein Ruleset (`ruleset`) und kann einzelne Werte per `overrides` ändern. `resolveRules(ruleset, overrides)` in `src/schema/ruleset.ts` merged pro Gruppe (`queue`, `vehicles`, `movement`, `passengers`, `limits`, `scoring`, `special`, `powerups`) flach: Felder aus `overrides` ersetzen die gleichnamigen Felder des Rulesets. Verschachtelte Werte (zum Beispiel `vehicles.types`, `scoring.stars`, einzelne Power-Ups) werden ganz ersetzt, nicht tief gemischt. Das Ergebnis wird erneut gegen das Ruleset-Schema geprüft. Alle Felder und Wertebereiche stehen in `src/schema/ruleset.ts`.

Das Schema kennt mehr Regeln, als die Engine umsetzt. `createGame` und `validateLevel` (`src/engine/validate.ts`) melden für nicht umgesetzte Regeln den Fehler `unsupportedRule`.

| Gruppe             | Umgesetzt                                                                             | Nur im Schema (Engine lehnt mit `unsupportedRule` ab)                                     |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Queue              | `slots`, `fillPolicy`, `lockedSlots`, `loseOnFull`                                    | -                                                                                         |
| Fahrzeuge          | `types`, `colors`, `departOnFull = true`                                              | `dualColor`, `departOnFull = false`                                                       |
| Bewegung           | `model = straight`, `exits = edges`, `reversible = false`                             | `turns`, `pathfinding`, `gates`, `reversible`                                             |
| Passagiere         | `order = strict`, `boardPolicy = firstMatch`, `visible`                               | `order` `lookahead`/`free`, `boardPolicy` `largestFree`/`playerChoice`, `mysteryRate > 0` |
| Limits und Wertung | `limits.moves`, `limits.timeSec` (Aktion `timeUp` der App), `starMode` `powerupsUsed` | -                                                                                         |
| Spezialobjekte     | `fixed` (Poller), `keyVehicles` (Schloss/Schlüssel)                                   | `oneWay`, `barriers`, `mysteryVehicles` (auch die Zelltypen `oneWay` und `barrier`)       |
| Power-Ups          | `undo`, `shuffle`, `extraSlot`, `honk`                                                | -                                                                                         |

`starMode` `moves` und `time` sind zulässig, aber nur eingeschränkt umgesetzt: `moves` wertet die rohe Zugzahl ohne Par, `time` liefert in der Engine immer 3 Sterne.

## Spezialobjekte

- Poller: Zellen vom Typ `fixed` im Raster. Sie blockieren Fahrzeuge und bewegen sich nie.
- Schloss/Schlüssel: Ein Fahrzeug mit `locked: true` und `keyId` lässt sich erst antippen, wenn das Fahrzeug `keyId` ausgefahren ist. Schlüsselketten müssen azyklisch sein.
- Hupe (Power-Up `honk`): Ein Fahrzeug hupt, das erste Fahrzeug auf seinem Weg rutscht entlang seiner Achse so weit wie nötig zur Seite. Poller und gesperrte Fahrzeuge weichen nicht aus, Poller versperren auch die Ausweichstrecke. Zählt nicht als Zug; Undo nimmt es zurück. Regeln im Detail: [INTERFACES.md](INTERFACES.md).
- Ruleset `world2` (`src/content/rulesets/world2.json`): wie `classic`, mit `special.fixed`, `special.keyVehicles` und einer Hupe. Die `special`-Flags beschreiben, was ein Ruleset einsetzt (Generator, Editor, UI); die Engine verarbeitet `fixed`-Zellen und `locked`/`keyId` unabhängig davon.

## Level-Format und Validierung

Ein Level (`src/schema/level.ts`) besteht aus `id`, `title`, `ruleset`, optionalen `overrides`, `grid` (Breite, Höhe, Zellen), `vehicles` (Kopfzelle `pos`, Blickrichtung `dir`, Typ, Farbe, optional `locked`/`keyId`), `passengers` (Farbfolge) und `meta` (zum Beispiel `difficulty`). `x` zählt nach rechts, `y` nach unten, die Länge erstreckt sich nach hinten. Ein vollständiges Beispiel ist `src/content/levels/pack-01/007.json`.

Validierung in zwei Stufen:

1. Schema (zod) beim Laden.
2. Semantik (`validateLevel`): bekannte Typen und Farben, Fahrzeuge im Raster, keine Überlappungen, eindeutige IDs, Passagiere je Farbe gleich der Kapazität je Farbe (mit `meta.allowSurplus` genügt `<=`), gültige und azyklische Schlüssel, nur unterstützte Regeln.

Dazu kommt die Lösbarkeit: Der Solver prüft sie im Editor, beim Import geteilter Level und in `tests/content` für alle ausgelieferten Level.

## Solver, Generator, Schwierigkeit

Der Solver (`src/solver`) läuft im Web Worker (`worker.ts`, Zugriff über `client.ts`) und wird von der App erst bei Bedarf geladen. Die Anfragen heißen `analyze`, `hint` und `generate`.

- `analyze` durchsucht den Zustandsraum vollständig per memoisierter Tiefensuche über die Engine-Funktionen `step` und `hashState` (nur Tipp-Aktionen, Zustandslimit als Obergrenze). Ergebnis: lösbar ja/nein, kürzeste Lösung, Anzahl Gewinn- und Gesamtpfade, tote Zustände, Schwierigkeit. „Unbekannt" (`truncated`) ist ein erlaubtes Ergebnis.
- `hint` liefert den Tipp mit den meisten Gewinnfolgen.
- `generate` ist seed-deterministisch. Der Generator konstruiert Level rückwärts, damit sie lösbar sind, verwürfelt die Passagierfolge, prüft jeden Kandidaten mit `analyze` und wählt den, der dem Schwierigkeitsziel am nächsten liegt.
- Zufall kommt ausschließlich aus dem Seed-PRNG der Engine (`mulberry32`, `src/engine/rng.ts`). Seeds für Tages-, Endlos- und Ähnliche Level entstehen aus Text per FNV-1a (`src/app/seed.ts`).
- Schwierigkeit (`computeDifficulty`, Skala 1-10): gewichtete Summe aus Zufallsspiel-Misserfolg, Anteil toter Zustände, Tiefe der Sackgassen und Farbdruck auf die Schlange.
- Stufen (`src/app/stages.ts`): 6 Stufen mit den oberen Schwierigkeitsgrenzen 1,75 / 2,5 / 3,25 / 4,0 / 4,75 (Stufe 6 darüber). Jede Stufe legt Raster, Fahrzeug- und Farbzahl für den Generator fest.

CLI: `pnpm level:analyze` analysiert Level-Dateien, `pnpm level:generate` erzeugt ein Pack deterministisch aus einer Konfiguration (`tools/pack-XX.config.json`), `pnpm level:report` gibt eine Übersicht über ein Pack aus.

## Spielmodi

- Kampagne: Eine Welt ist ein Pack unter `src/content/levels/pack-XX/` mit `index.json`. Welt 1 „Werkstatt" (`pack-01`) hat 30 Level, Welt 2 „Poller & Schlüssel" (`pack-02`) hat 24 Level. Level 1 von Welt 1 ist offen; ein geschafftes Level (mindestens 1 Stern) schaltet das nächste frei; Welt N+1 öffnet sich, wenn alle Level von Welt N geschafft sind. Geschaffte Level bleiben immer spielbar. Vor dem ersten Level mit einer neuen Mechanik (Poller, Schlüssel) erscheint einmalig eine Intro-Karte, die über die Levelauswahl erneut abrufbar ist.
- Tageslevel: Seed aus `"parking"` und dem lokalen Datum (YYYY-MM-DD), Wechsel um Mitternacht Ortszeit. Das Level wird im Browser generiert und ist für alle gleich. Die Stufe hängt vom Wochentag ab (Montag leicht, Sonntag schwer). Das Ergebnis lässt sich als Text teilen; die Serie wird lokal gezählt.
- Endlos: Ein Run-Seed liefert Level, die Stufe steigt alle zwei gelösten Level bis Stufe 6. Ein verlorenes Level beendet den Run, der Bestwert bleibt lokal.
- Stufe halten: Ein Schalter fixiert die Stufe im Endlos-Modus und bei „Ähnliches Level". Gespeichert werden Schalter und Stufe sowie die höchste erreichte Stufe.
- Ähnliches Level: Der Generator erzeugt ein neues Level mit ähnlicher Schwierigkeit (± 0,5) oder, bei „Stufe halten", aus der gewählten Stufe. Schlägt die Generierung fehl, wird das aktuelle Level gespiegelt und umgefärbt.
- Tipps: bis zu 3 pro Level, berechnet vom Solver-Worker.
- Editor: Fahrzeuge setzen und drehen, Ruleset und Overrides wählen, Lösbarkeit per Solver prüfen. Eigene Level werden lokal gespeichert (höchstens 50).
- Teilen per URL: Das Level wird minimiert, mit deflate gepackt und als base64url im Fragment abgelegt (`#/play?l=<code>`). Das Fragment geht nie an einen Server; beim Import prüfen Schema, Semantik und Solver das Level. Details und Grenzen: [INTERFACES.md](INTERFACES.md).
- Spielstand-Import: Der Export ist eine JSON-Datei. Beim Import mit vorhandenem Stand lässt sich zusammenführen oder ersetzen.

## Fortschritt

Der Spielstand liegt unter dem `localStorage`-Schlüssel `parking.save.v1` (versioniert, zod-validiert; defekte Teile fallen auf Defaults zurück). Er enthält Level-Ergebnisse, Tageslevel-Verlauf, Endlos-Bestwert, „Stufe halten", gesehene Intros, eigene Level und Einstellungen (Sprache, Bewegung). Alle Storage-Zugriffe laufen in try/catch; ohne Speicher läuft das Spiel im Arbeitsspeicher weiter. Es gibt keine Cookies und keine externen Requests.

## Architektur

```
ui/ + render/  ->  app/  ->  engine/ + schema/
```

- Die Engine ist rein: `step(state, action, ruleset) -> { state, events }`, immutable, JSON-serialisierbar und deterministisch (kein `Math.random`, `Date`, `performance`).
- Regeln liegen als Module in `src/engine/rules/`. Level-spezifische Sonderfälle gibt es nicht.
- Der Renderer berechnet keine Spiellogik, er spielt nur die Events der Engine ab. Eingaben gehen als `Action` an den Game-Controller in `app/`.
- Import-Grenzen erzwingt ESLint (`pnpm lint`). `engine` und `schema` kennen weder DOM noch Pixi noch höhere Schichten.

Verzeichnisse unter `src`:

- `schema`: zod-Schemas und Typen für Ruleset, Level, Pack und Share-Format.
- `engine`: Spiellogik, PRNG, Zustands-Hash, Level-Validierung.
- `solver`: Analyse, Tipps, Generator, Worker und Client.
- `content`: Ruleset- und Level-JSON samt Lader.
- `render`: PixiJS-Spielfeld, Event-Player, Theme-Tokens.
- `ui`: DOM-Oberfläche (Screens, Komponenten, Editor, Styles).
- `app`: Steuerung, Routing, Session, Fortschritt, Teilen.
- `i18n`: Texte in Deutsch und Englisch mit typisierten Keys.

Die Schnittstellen zwischen den Schichten sind in [INTERFACES.md](INTERFACES.md) festgehalten.

## Stack

- TypeScript (strict), Vite, pnpm, Node 22.
- PixiJS v8 für das Spielfeld, DOM und CSS für Menüs und Editor.
- zod für Schemas, fflate für den Share-Code.
- Vitest mit fast-check und Coverage (v8), Playwright für E2E.
- ESLint (flat config), Prettier.

## Qualität

- Tests: `tests/unit` (Engine, Solver, App, Renderer), `tests/content` (Schemas, Level gültig und lösbar), `tests/e2e` (Playwright).
- CI (`.github/workflows/ci.yml`, für Pull Requests und `main`): `lint` (ESLint und Prettier), `typecheck`, `test` (Vitest), danach `build` und `e2e`.
- Barrierefreiheit: Farbsymbole, Tastaturbedienung (Pfeiltasten, U für Undo, R für Neustart, H für den Hupen-Zielmodus, Esc bricht ihn ab), `aria-live`-Meldungen, `prefers-reduced-motion` mit Schalter in den Einstellungen.
- Sprachen: Deutsch und Englisch, Auswahl automatisch oder manuell.

## Deployment

Siehe [README](../README.md) und `deploy/container/`.
