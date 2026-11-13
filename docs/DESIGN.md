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
- Bewegung nur geradeaus (`straight`) zum Rand (`edges`), nicht umkehrbar (Abbiegen mit `turns` siehe Spezialobjekte).
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
| Bewegung           | `model` `straight`/`turns`, `exits = edges`, `reversible = false`                     | `pathfinding`, `gates`, `reversible`                                                      |
| Passagiere         | `order = strict`, `boardPolicy = firstMatch`, `visible`                               | `order` `lookahead`/`free`, `boardPolicy` `largestFree`/`playerChoice`, `mysteryRate > 0` |
| Limits und Wertung | `limits.moves`, `limits.timeSec` (Aktion `timeUp` der App), `starMode` `powerupsUsed` | -                                                                                         |
| Spezialobjekte     | `fixed`, `keyVehicles`, `mysteryVehicles`, `oneWay` (nur mit `turns`)                 | `barriers` (auch die Zelltypen `barrier` und `gate`)                                      |
| Power-Ups          | `undo`, `shuffle`, `extraSlot`, `honk`                                                | -                                                                                         |

`starMode` `moves` und `time` sind zulässig, aber nur eingeschränkt umgesetzt: `moves` wertet die rohe Zugzahl ohne Par, `time` liefert in der Engine immer 3 Sterne.

## Spezialobjekte

- Poller: Zellen vom Typ `fixed` im Raster. Sie blockieren Fahrzeuge und bewegen sich nie.
- Schloss/Schlüssel: Ein Fahrzeug mit `locked: true` und `keyId` lässt sich erst antippen, wenn das Fahrzeug `keyId` ausgefahren ist. Schlüsselketten müssen azyklisch sein.
- Hupe (Power-Up `honk`): Ein Fahrzeug hupt, das erste Fahrzeug auf seinem Weg rutscht entlang seiner Achse so weit wie nötig zur Seite. Poller und gesperrte Fahrzeuge weichen nicht aus, Poller versperren auch die Ausweichstrecke. Zählt nicht als Zug; Undo nimmt sie zurück und gibt die Hupe zurück (Zähler + 1, `powerUpsUsed` − 1; das Undo selbst zählt als Power-Up, im Snapshot als `honk: true` markiert). Regeln im Detail: [INTERFACES.md](INTERFACES.md).
- Mystery-Fahrzeuge (`mystery: true`, nur mit `special.mysteryVehicles`): Die Farbe ist verdeckt, bis der Weg des Fahrzeugs zum Rand frei ist; dann wird sie aufgedeckt (Event `vehicleRevealed`) und bleibt es, auch nach Undo. Reine Darstellung: Antippen, Einsteigen und Hupe verhalten sich wie bei normalen Fahrzeugen, ein verdecktes Fahrzeug ist daher nie antippbar. Darstellung: graue, schraffierte Fläche mit „?“ statt Farbe und Farbsymbol; beim Aufdecken klappt das Fahrzeug kurz um (Ansage, eigener Klang). Labels und Ansagen sagen „Fahrzeug mit unbekannter Farbe“. Intro-Karte `mystery` (auch in generierten Leveln, sobald eines Mystery-Fahrzeuge hat). Regeln im Detail: [INTERFACES.md](INTERFACES.md).
- Abbiegepfeile (Zellen `{ type: "oneWay", dir }`, nur mit `special.oneWay` und `movement.model = turns`, sonst `oneWayDisabled`): feste Fahrbahnpfeile, auf denen kein Fahrzeug steht. Der Ausfahrweg (`exitPath` in `src/engine/geometry.ts`) führt geradeaus, bis das Fahrzeug eine Pfeilzelle betritt: Zeigt der Pfeil in Fahrtrichtung oder quer dazu, fährt es in Pfeilrichtung weiter (abbiegen); zeigt er entgegen, ist die Zelle eine Falschfahrt und blockiert wie ein Poller. Das Fahrzeug folgt dem Weg wie ein Zug. Antippen, Mystery-Aufdecken, `legalMoves`, Hupe (Grund `wrongWay` bei Falschfahrt; Pfeilzellen gelten beim Ausweichen als belegt) und die blinden Playouts nutzen den gebogenen Weg; `vehicleExited.exitDir` nennt die Ausfahrrichtung, wenn sie von der Blickrichtung abweicht. Pfeil-Schleifen und Pfeile ohne `dir` meldet `validateLevel` als `oneWayInvalid`. `turns` ohne Pfeile verhält sich exakt wie `straight`; die schnelle Analyse bleibt auf zellfreie, gerade Level beschränkt. Entscheidung: [ADR 0002](adr/0002-einbahn-und-abbiegen.md), Regeln im Detail: [INTERFACES.md](INTERFACES.md).
- Darstellung der Abbiegepfeile: flache, dunkle Fahrbahnkachel ohne Schatten mit weißem Blockpfeil und Comic-Kontur (`THEME.oneWayRoad`/`oneWayArrow`); die Richtung steckt allein in der Form, also auch ohne Farbwahrnehmung lesbar und klar vom Fahrzeug-Chevron und vom Poller unterscheidbar. Beim Ausfahren mit `exitDir` laufen Front und Heck auf dem Linienzug aus dem Event (`src/render/exit-path.ts`), das Fahrzeug dreht sich an den Knicken; ohne `exitDir` bleibt die gerade Ausfahrt unverändert, reduzierte Bewegung wie bisher. Die Spur-Vorschau endet auf dem ersten Pfeil (der Renderer wertet Pfeile nicht aus). Screenreader: Das Spielfeld beschreibt seine Pfeile („Reihe 2, Spalte 5: Einbahn nach oben“), Hupen gegen einen Pfeil meldet „Gegen die Einbahn kommt keiner weiter.“, Abbiegen hat einen eigenen kurzen Klang. Intro-Karte `oneWay` (auch in generierten Leveln mit Pfeilen).
- Ruleset `world2` (`src/content/rulesets/world2.json`): wie `classic`, mit `special.fixed`, `special.keyVehicles` und einer Hupe. Die `special`-Flags beschreiben, was ein Ruleset einsetzt (Generator, Editor, UI); die Engine verarbeitet `fixed`-Zellen und `locked`/`keyId` unabhängig davon.
- Ruleset `world3` (`src/content/rulesets/world3.json`, „Hupe"): wie `world2`, mit 1 Hupe pro Level (`powerups.honk`). `starMode` = `powerupsUsed` mit `three` = 1: Eine Hupe kostet keinen Stern (3 Sterne bei höchstens 1 genutztem Power-Up, 2 Sterne bei höchstens 3). Die Level von Welt 3 sind Pflicht-Hupe-Level (siehe `requireHonk`).
- Ruleset `world4` (`src/content/rulesets/world4.json`, „Mystery"): wie `world2` (Poller, Schlüssel, eine optionale Hupe, gleiche Wertung), zusätzlich `special.mysteryVehicles`.

## Level-Format und Validierung

Ein Level (`src/schema/level.ts`) besteht aus `id`, `title`, `ruleset`, optionalen `overrides`, `grid` (Breite, Höhe, Zellen), `vehicles` (Kopfzelle `pos`, Blickrichtung `dir`, Typ, Farbe, optional `locked`/`keyId` und `mystery`), `passengers` (Farbfolge) und `meta` (zum Beispiel `difficulty`). `x` zählt nach rechts, `y` nach unten, die Länge erstreckt sich nach hinten. Ein vollständiges Beispiel ist `src/content/levels/pack-01/007.json`.

Validierung in zwei Stufen:

1. Schema (zod) beim Laden.
2. Semantik (`validateLevel`): bekannte Typen und Farben, Fahrzeuge im Raster, keine Überlappungen, eindeutige IDs, Passagiere je Farbe gleich der Kapazität je Farbe (mit `meta.allowSurplus` genügt `<=`), gültige und azyklische Schlüssel, Abbiegepfeile nur mit `special.oneWay` und `turns`, mit `dir` und ohne Schleife, kein Fahrzeug auf einem Pfeil, nur unterstützte Regeln.

Dazu kommt die Lösbarkeit: Der Solver prüft sie im Editor, beim Import geteilter Level und in `tests/content` für alle ausgelieferten Level.

## Solver, Generator, Schwierigkeit

Der Solver (`src/solver`) läuft im Web Worker (`worker.ts`, Zugriff über `client.ts`) und wird von der App erst bei Bedarf geladen. Die Anfragen heißen `analyze`, `hint` und `generate`.

- `analyze` durchsucht den Zustandsraum vollständig per memoisierter Tiefensuche über die Engine-Funktionen `step` und `hashState` (Tipp-Aktionen, Zustandslimit als Obergrenze). Ergebnis: lösbar ja/nein, kürzeste Lösung, Anzahl Gewinn- und Gesamtpfade, tote Zustände, Schwierigkeit. „Unbekannt" (`truncated`) ist ein erlaubtes Ergebnis.
- `analyze` mit `allowHonk` nimmt Hupen (`usePowerUp` honk je geparktem Fahrzeug, nur wenn `step` sie annimmt, begrenzt durch `powerUps.honk`) als zusätzliche Aktionen auf; ein Zustand `lost`/`noMoves` mit Hupe übrig ist dann nicht terminal. Dafür läuft der langsame, `step`-basierte Searcher (der schnelle Pfad bleibt Tipp-only), und der Speicherschlüssel ergänzt `hashState` um den Hupen-Zähler. `solution` und `firstMoves` führen Hupen als `honk:<vehicleId>`; `minMoves` zählt nur Tipps. Ohne `allowHonk` ändert sich nichts (pack-01/02 bit-identisch).
- `hint` liefert den Tipp mit den meisten Gewinnfolgen (`tap`). Gewinnt keiner ohne Hupe und ist eine Hupe übrig (auch nach einer Niederlage durch fehlende Züge), sucht er mit Hupe und liefert den Tipp oder die Hupe (`honk`) mit den meisten Gewinnfolgen (Gleichstand: Siegchance, dann Tipp vor Hupe). Dieser Zug trägt `needsHonk: true` (ohne Hupe gewinnt nichts mehr); gewinnt ein reiner Tipp, fehlt das Feld. So kommt in Pflicht-Hupe-Leveln zuerst der Tipp, der die Hupe vorbereitet. Beide Suchen haben ein eigenes Zustandslimit.
- `generate` ist seed-deterministisch. Der Generator konstruiert Level rückwärts, damit sie lösbar sind, verwürfelt die Passagierfolge, prüft jeden Kandidaten mit `analyze` und wählt den, der dem Schwierigkeitsziel am nächsten liegt.
- `generate` mit `requireHonk` (`generator-honk.ts`) baut die Hupe in die Rückwärts-Konstruktion ein: Ein Blocker B startet um 1 bis Länge Zellen entlang seiner Achse versetzt auf dem Weg eines späteren Fahrzeugs V (Vorwärts: erst v1..v(j-1), dann hupt V, B weicht auf seinen Platz aus, danach nur Tipps). Gewählt werden nur Paare, bei denen reine Tipps geometrisch verklemmen; `step` bestätigt, dass B genau dorthin ausweicht. Danach gilt der Kandidat nur, wenn `analyze` tap-only unlösbar (nicht `truncated`) und mit `allowHonk` lösbar ist; Schwierigkeit und Zielabstand kommen aus der Analyse mit Hupe. Gemessen (Node, `world3`, 5 Slots, maxStates 200000, 8-12 Seeds je Konfiguration): Raster 5-6, 6-10 Fahrzeuge, 2-5 Farben, 0-2 Poller, 0-1 Schlüssel liefern Schwierigkeit 1,7 bis 7,4 (mit Hupe), mittlere Generierzeit 0,1 s (5x5, 7 Fahrzeuge) bis 1,0 s (6x6, 10 Fahrzeuge, Poller und Schlüssel), Trefferquote im Zielbereich ±0,5 meist 60-100 %. Nachgemessen für Raster 7 (11-13 Fahrzeuge, 5-6 Farben, 2-3 Poller, 1-2 Schlüssel, maxAttempts 300, je 4-7 Seeds): Schwierigkeit 5,3 bis 8,0, Generierzeit 0,1 bis 7 s je Level (ohne Treffer nach 300 Versuchen am längsten), höchstens 43000 Zustände mit Hupe; 6 Farben bei 5 Slots und 13 Fahrzeuge bringen 7,3 bis 7,6. Der Generator brauchte dafür keine Änderung.
- `generate` mit `mystery` (`generator-mystery.ts`, Zahl oder `[min, max]`, erfordert `special.mysteryVehicles`): Nach Analyse und Zielabstand eines Kandidaten werden Mystery-Fahrzeuge markiert. In Frage kommen nur Fahrzeuge, die verdeckt starten (Weg anfangs blockiert); die kürzeste Lösung wird abgespielt und spät aufgedeckte Fahrzeuge werden bevorzugt (erste Auswahl: die `n` spätesten, Gleichstand per Seed; danach bis zu 3 weitere, nach Aufdeck-Schritt gewichtete Ziehungen). Der Zufall dafür kommt aus einem eigenen, aus dem Versuchs-Seed abgeleiteten PRNG; ohne `mystery` bleibt die Ausgabe bitgleich (pack-01/02/03 neu erzeugt und verglichen). Kandidaten mit weniger verdeckt startenden Fahrzeugen als verlangt werden verworfen.
  - Fairness-Filter (`blind.ts`): Ein gieriger Spieler, der nur sieht, was die Oberfläche zeigt (aufgedeckte Farben, `visible` Fahrgäste, Schlange), spielt 64 Partien (fester Seed 1, 20 % Zufallszüge). Er bewertet jeden Tipp nach Bedarf der eigenen Farbe im sichtbaren Fenster, nach Fahrzeugen, die der Tipp freiräumt (bekannte Farbe: 1 bei Bedarf, sonst 0; verdeckte Farbe: 0,5), und vermeidet unpassende Fahrzeuge, wenn danach höchstens ein Halteplatz frei bleibt. Gehen keine Tipps mehr, hupt er mit dem ersten Fahrzeug, bei dem die Hupe wirkt. Fair ist eine Auswahl, wenn diese blinde Siegquote `>= mysteryMinBlindWin` (Default 0,25) ist; die erste faire Auswahl gewinnt, sonst die beste mit Strafe 200 auf den Zielabstand (`matched = false`). Zum Vergleich wird dieselbe Quote mit voller Information gemessen (`informedWin`).
  - Schwierigkeit: bleibt unverändert (volle Information, kein Mystery-Bonus). Begründung aus den Messungen: Der Abstand informiert − blind liegt im Mittel bei −0,3 bis +0,3 Prozentpunkten; die verdeckten Farben ändern den Ausgang für diesen Spieler kaum, weil die Fahrgastfolge (8 sichtbar) die meisten Entscheidungen trägt. Gegenbeispiel mit großem Abstand: das Fallen-Level in `tests/unit/solver/mystery.test.ts` (2 Halteplätze, 2 sichtbare Fahrgäste). Mystery steuert daher die Rampe über die Zahl, nicht über `difficulty`.
  - Gemessen (Node, `world2` + `mysteryVehicles`, 4 Slots, 8 sichtbar, Ziel [4, 7], `preferDeadEnds`, `maxRandomPlayWin` 0,85, maxStates 200000, 6 Seeds je Zelle): Raster 5-7, 6-12 Fahrzeuge, 0-4 Mystery, ohne bzw. mit 2 Pollern und 1 Schlüssel. Jede Zelle lieferte 6/6 Level, alle fair (mittlere blinde Siegquote 70-99 %). Generierzeit mit Mystery im Mittel 35-350 ms, ohne Mystery 2-580 ms; schlimmster Fall 2,6 s (6x6, 12 Fahrzeuge, Poller, Schlüssel, 4 Mystery). Treffer im Zielbereich 100 %, außer bei wenigen Fahrzeugen und vielen Mystery: 5x5/6 Fahrzeuge mit 4 Mystery 4/6 (mit Poller+Schlüssel 2/6), 6x6/6 mit 3-4 Mystery und Poller+Schlüssel 5/6 bzw. 0/6, 7x7/6 mit 4 Mystery 5/6 bzw. 3/6. Grenze ist die Zahl verdeckt startender Fahrzeuge: Anteil der Kandidaten mit genug davon für 1/2/3/4 Mystery 90/78/40/3 % (5x5, 7 Fahrzeuge), 100/95/85/55 % (6x6, 9), 100/100/98/93 % (7x7, 11). Von diesen bestand jede erste Auswahl den Filter. Eine 24-Level-Rampe nach `pack-02` mit 1 → 4 Mystery dauerte 21,8 s, 20/24 im Ziel ohne Seed-Suche, alle fair (blind 34-100 %).
- Zufall kommt ausschließlich aus dem Seed-PRNG der Engine (`mulberry32`, `src/engine/rng.ts`). Seeds für Tages-, Endlos- und Ähnliche Level entstehen aus Text per FNV-1a (`src/app/seed.ts`).
- Schwierigkeit (`computeDifficulty`, Skala 1-10): gewichtete Summe aus Zufallsspiel-Misserfolg, Anteil toter Zustände, Tiefe der Sackgassen und Farbdruck auf die Schlange.
- Stufen (`src/app/stages.ts`): 6 Stufen mit den oberen Schwierigkeitsgrenzen 1,75 / 2,5 / 3,25 / 4,0 / 4,75 (Stufe 6 darüber). Jede Stufe legt Raster, Fahrzeug- und Farbzahl sowie Ruleset, Poller- und Schlüsselzahl für den Generator fest: Stufe 1-2 `classic` ohne Mechaniken, Stufe 3-4 `world2` mit 1-2 Pollern, Stufe 5-6 `world2` mit 1-2 Pollern und einem Schlüssel (Kettentiefe 1). Gemessen (20 Seeds, Node): mittlere Generierzeit unter 0,6 s, schlimmster Fall Stufe 6 mit etwa 1,9 s.

CLI: `pnpm level:analyze [--honk]` analysiert Level-Dateien (`--honk`: mit Hupen), `pnpm level:generate` erzeugt ein Pack deterministisch aus einer Konfiguration (`tools/pack-XX.config.json`), `pnpm level:report [--honk]` gibt eine Übersicht über ein Pack aus. In der Pack-Konfiguration stehen `requireHonk`, `mystery`, `mysteryMinBlindWin` und `mysteryPlayouts` in `defaults` oder je Level; `--out <dir>` schreibt in einen anderen Ordner (zum Vergleichen). `level:analyze` und `level:report` zeigen die Zahl der Mystery-Fahrzeuge und die blinde Siegquote. Die Generator-Parameter je Level leitet `tools/lib/pack-config.ts` aus der Konfiguration ab; die Content-Tests von `pack-04` erzeugen damit eine Stichprobe neu und vergleichen sie mit den Dateien.

## Spielmodi

- Kampagne: Eine Welt ist ein Pack unter `src/content/levels/pack-XX/` mit `index.json`. Welt 1 „Werkstatt" (`pack-01`) hat 30 Level, Welt 2 „Poller & Schlüssel" (`pack-02`) hat 24 Level, Welt 3 „Hupe" (`pack-03`, Ruleset `world3`) hat 24 Level, Welt 4 „Mystery“ (`pack-04`, Ruleset `world4`) hat 24 Level (zusammen 102). Jedes Level von Welt 3 ist mit Tipps allein unlösbar und mit höchstens einer Hupe lösbar (`requireHonk`): Level 1-5 nur mit Hupe, 6-10 zusätzlich mit Pollern, 11-15 mit Pollern und einem Schlüssel, 16-24 mit 10-13 Fahrzeugen, 1-3 Pollern und 1-2 Schlüsseln (16-18 auf 6x6, 19-24 auf 7x7, ab Level 22 mit 6 Farben); Schwierigkeit (mit Hupe) 2,8 bis 7,5 (16-24: 6,0 bis 7,5), die Hupe fällt in der Lösung nie in den ersten Zug. Erzeugt mit `tools/pack-03.config.json` (ganzes Pack in rund 6 s; Level 16-24 je 0,1 bis 0,6 s, Analyse mit Hupe je höchstens 0,15 s bei bis zu 5300 Zuständen). Level 16-24 wurden angehängt, 1-15 sind unverändert (Spielstände hängen an `pack-03/NNN`). Welt 4 führt Mystery-Fahrzeuge ein (Intro-Karte vor Level 1); jedes Level hat mindestens ein verdeckt startendes Mystery-Fahrzeug, die Zahl steigt monoton von 1 (Level 1-5) über 2 (6-13) und 3 (14-20) auf 4 (21-24). Poller gibt es in jedem Level (1-3), Schlüssel ab Level 5 (1-3, ab Level 10 zwei oder drei, Schlüsselketten der Tiefe 2 ab Level 13). Level 1 ist eine sanfte Einführung: 5x5, 6 Fahrzeuge, ein Poller, das einzige Mystery-Fahrzeug wird nach dem ersten Zug aufgedeckt. Raster 5x5 (1-6), 6x6 (7-17, 19) und 7x7 (18, 20-24); Schwierigkeit 3,0 bis 7,7, blinde Siegquote 53-100 % (Fairness-Filter ab 25 %), Analyse je höchstens 0,04 s. Erzeugt mit `tools/pack-04.config.json` (ganzes Pack in rund 18 s, alle 24 im Zielbereich); die Seeds der Level 1, 4, 7, 15, 21, 23 und 24 wurden per Seed-Suche gewählt (Level 1 zusätzlich mit `blockiness` 0,3 für einen frühen Aufdeck-Zeitpunkt), Level 7 und 15 mit fester statt Spannen-Mystery-Zahl, damit die Zahl nicht sinkt. Level 1 von Welt 1 ist offen; ein geschafftes Level (mindestens 1 Stern) schaltet das nächste frei; Welt N+1 öffnet sich, wenn alle Level von Welt N geschafft sind. Geschaffte Level bleiben immer spielbar. Vor dem ersten Level mit einer neuen Mechanik (Poller, Schlüssel, Hupe, Mystery) erscheint einmalig eine Intro-Karte, die über die Levelauswahl erneut abrufbar ist. Taucht eine noch ungesehene Mechanik erstmals im Tageslevel, in Endlos oder in „Ähnliches Level" auf, erscheint dieselbe Karte einmalig.
- Tageslevel: Seed aus `"parking"` und dem lokalen Datum (YYYY-MM-DD), Wechsel um Mitternacht Ortszeit. Das Level wird im Browser generiert und ist für alle gleich. Die Stufe hängt vom Wochentag ab (Montag leicht, Sonntag schwer) und bestimmt Ruleset, Poller und Schlüssel; das Level hängt nur vom Datum ab, nicht vom Spielerfortschritt. Das Ergebnis lässt sich als Text teilen; die Serie wird lokal gezählt.
- Endlos: Ein Run-Seed liefert Level, die Stufe steigt alle zwei gelösten Level bis Stufe 6 (ab Stufe 3 mit Welt-2-Mechaniken). Ein verlorenes Level beendet den Run, der Bestwert bleibt lokal.
- Stufe halten: Ein Schalter fixiert die Stufe im Endlos-Modus und bei „Ähnliches Level". Gespeichert werden Schalter und Stufe sowie die höchste erreichte Stufe.
- Ähnliches Level: Der Generator erzeugt ein neues Level mit ähnlicher Schwierigkeit (± 0,5) oder, bei „Stufe halten", aus der gewählten Stufe. Ohne „Stufe halten" bleiben Ruleset sowie Zahl der Poller und Schlüssel des Ausgangslevels erhalten. Schlägt die Generierung fehl, wird das aktuelle Level gespiegelt und umgefärbt (Poller und Schlüssel bleiben dabei erhalten).
- Tipps: bis zu 3 pro Level, berechnet vom Solver-Worker.
- Editor: Fahrzeuge setzen und drehen, Ruleset und Overrides wählen, Lösbarkeit per Solver prüfen. Abbiegepfeile setzt das Werkzeug „Pfeil“ (Richtung wie bei Fahrzeugen, gleiche Richtung entfernt, Taste R dreht, Entf entfernt; nicht unter Fahrzeugen oder Pollern). Es erscheint, wenn das Ruleset Pfeile erlaubt oder der Schalter „Abbiegepfeile“ sie per Override freischaltet (`movement.model = turns`, `special.oneWay`); ohne Freischaltung lassen sich vorhandene Pfeile nur entfernen, und die Prüfung meldet `oneWayDisabled`. Ausfahr-Reihenfolge und Fahrgäste folgen `exitPath`. Eigene Level werden lokal gespeichert (höchstens 50).
  Mystery-Fahrzeuge: Schalter „Mystery“ am ausgewählten Fahrzeug, sobald das Regelwerk (bzw. ein importierter Override) `special.mysteryVehicles` erlaubt; markierte Zellen sind gestrichelt mit „?“. Ohne Flag bleibt der Schalter nur zum Entfernen sichtbar, die Prüfung meldet `mysteryDisabled`. Die Lösbarkeitsprüfung bleibt bei voller Information.
- Teilen per URL: Das Level wird minimiert, mit deflate gepackt und als base64url im Fragment abgelegt (`#/play?l=<code>`). Das Fragment geht nie an einen Server; beim Import prüfen Schema, Semantik und Solver das Level. Details und Grenzen: [INTERFACES.md](INTERFACES.md).
- Spielstand-Import: Der Export ist eine JSON-Datei. Beim Import mit vorhandenem Stand lässt sich zusammenführen oder ersetzen.

## Fortschritt

Der Spielstand liegt unter dem `localStorage`-Schlüssel `parking.save.v1` (versioniert, zod-validiert; defekte Teile fallen auf Defaults zurück). Er enthält Level-Ergebnisse, Tageslevel-Verlauf, Endlos-Bestwert, „Stufe halten", gesehene Intros, eigene Level und Einstellungen (Sprache, Bewegung, Ton). Alle Storage-Zugriffe laufen in try/catch; ohne Speicher läuft das Spiel im Arbeitsspeicher weiter. Es gibt keine Cookies und keine externen Requests.

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
- `audio`: Klänge per Web Audio, synthetisch erzeugt (keine Audiodateien). Der Event-Player meldet jedes Event im Moment des Abspielens an den Ton, damit Klang und Animation zusammenpassen; die App verbindet beides und den Schalter in den Einstellungen (Standard: an).
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

- Tests: `tests/unit` (Engine, Solver, App, Renderer), `tests/content` (Schemas, Level gültig und lösbar), `tests/e2e` (Playwright). E2E-Tests nutzen nur ausgelieferte Level; spätere Welten werden per vorbelegtem Spielstand freigeschaltet (`completedSave`/`seedSave` in `tests/e2e/support.ts`).
- CI (`.github/workflows/ci.yml`, für Pull Requests und `main`): `lint` (ESLint und Prettier), `typecheck`, `test` (Vitest mit Coverage-Gate für `src/engine/**`: mindestens 95 % bei Statements, Branches, Functions und Lines, konfiguriert in `vite.config.ts`; `pnpm test:coverage` läuft statt `pnpm test`), danach `build` und `e2e`.
- Bundle-Budget: `pnpm size` (`tools/check-bundle.mjs`) läuft im `build`-Job nach dem Build und summiert die gzip-Größe des Initial-JS (Skripte aus `dist/index.html`: `<script type="module">` und `modulepreload`; Lazy-Chunks wie Editor und Solver-Worker zählen nicht). Grenze 250 kB (250 000 Bytes, wie Vite kB zählt); darüber Exit 1.
- Barrierefreiheit: Farbsymbole, Tastaturbedienung (Pfeiltasten, U für Undo, R für Neustart, H für den Hupen-Zielmodus, Esc bricht ihn ab), `aria-live`-Meldungen, `prefers-reduced-motion` mit Schalter in den Einstellungen.
- Sprachen: Deutsch und Englisch, Auswahl automatisch oder manuell.

## Deployment

Siehe [README](../README.md) und `deploy/container/`.
