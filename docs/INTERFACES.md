# Schnittstellen

Verträge zwischen Engine, App, Renderer und Solver. Änderungen an den hier genannten Dateien nur bewusst, in einem eigenen Branch oder Commit und zusammen mit diesem Dokument.

| Vertrag                                        | Datei                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Ruleset-/Level-Schemas (zod, Typen)            | `src/schema/ruleset.ts`, `src/schema/level.ts`                             |
| Engine-Typen, Aktionen, Events, API-Signaturen | `src/engine/types.ts`                                                      |
| Farbpalette, Symbole, Theme-Tokens             | `src/render/theme.ts`                                                      |
| Beispiel-Content                               | `src/content/rulesets/classic.json`, `src/content/levels/pack-01/007.json` |
| Share-Format (zod, Grenzen, Fehlercodes)       | `src/schema/share.ts`                                                      |
| Share-Codec-API                                | `src/app/share.ts`                                                         |
| Solver-Typen inkl. `GeneratorTuning`           | `src/solver/types.ts`                                                      |
| Routen                                         | `src/app/router.ts` (`Route`, `PlayRoute`)                                 |
| Kampagne, Welten, Packs                        | `src/schema/pack.ts`, `src/app/levels.ts` (`Campaign`, `CampaignLevel`)    |

## Engine-API (`src/engine/index.ts`)

```ts
createGame(level: Level, rules: ResolvedRules, seed?: number): GameState   // wirft LevelError
step(state: GameState, action: Action, rules: ResolvedRules): StepResult     // rein, deterministisch
validateLevel(level: Level, rules: ResolvedRules): LevelIssue[]
legalMoves(state: GameState, rules: ResolvedRules): string[]
hashState(state: GameState): string
createRng(seed: number): number
nextRandom(rng: number): [value: number, next: number]   // value in [0, 1)
```

`rules` entsteht per `resolveRules(ruleset, level.overrides)` aus `src/schema`.

## Spielregeln

1. **Antippen** (`tapVehicle`): Fahrzeug muss `parked` sein und darf nicht `locked` sein. Der Weg von der Kopfzelle in Blickrichtung bis zum Rasterrand muss frei sein (keine `parked`-Fahrzeuge, keine `fixed`-Zellen). Es muss ein `empty`-Slot existieren. Sonst: Event `vehicleBlocked` (Grund `locked` > `path` > `queueFull`; `blockerId` = erstes blockierendes Fahrzeug oder `null`), Zustand unverändert, **kein Zug gezählt**, kein Verlaufseintrag.
2. **Ausfahren:** Snapshot in `history`, Fahrzeug → `queued`, belegt den ersten `empty`-Slot (`firstFree`) bzw. den ersten freien Slot nach dem letzten belegten (`fifo`). `moves + 1`. Event `vehicleExited` mit `path` (Zellen bis zum Rand). Fahrzeuge mit `keyId` = dieses Fahrzeug werden entsperrt (`vehicleUnlocked`).
3. **Einsteigen** (automatisch, nach jeder Zustandsänderung): Solange der vorderste Fahrgast in einen Slot-Fahrzeug gleicher Farbe mit freier Kapazität passt, steigt er ein (Slot mit kleinstem Index zuerst, `firstMatch`). Event `passengerBoarded`. Ist das Fahrzeug voll und `departOnFull`, fährt es ab: Status `departed`, Slot `empty`, Event `vehicleDeparted`; bei `fifo` rücken die folgenden Slots auf (`slotShifted`).
4. **Sieg:** alle Fahrgäste eingestiegen → `won`, Sterne nach `scoring` (siehe „Details zu Events und Zustand“), Event `won`.
5. **Niederlage** (in dieser Priorität, nur wenn nicht gewonnen):
   - `queueFull`: kein `empty`-Slot und der vorderste Fahrgast passt nirgends (nur wenn `queue.loseOnFull`).
   - `noMoves`: `legalMoves` ist leer.
   - `movesLimit`: `limits.moves` gesetzt und erreicht.
   - `timeUp`: Aktion `timeUp` von der App.
     Event `lost`. Undo bleibt auch im Zustand `lost` erlaubt (setzt auf `playing` zurück).
6. **Power-Ups** (`usePowerUp`), jeweils nur wenn Zähler > 0, sonst `invalidAction`:
   - `undo`: letzten Snapshot wiederherstellen, `stateRestored`. Ohne Verlauf → `invalidAction`. Undo selbst ist nicht rückgängig zu machen.
   - `shuffle`: mischt die Fahrgäste im Fenster `[passengerIndex, passengerIndex + passengers.visible)` mit dem PRNG, legt vorher einen Snapshot an, danach Einsteigen + Sieg/Niederlage prüfen. Event `passengersShuffled`.
   - `extraSlot`: entsperrt den ersten `locked`-Slot, sonst hängt einen neuen `empty`-Slot an. Event `slotAdded`.
   - `honk` (Aktion mit `vehicleId` = hupendes Fahrzeug V): Das erste Hindernis auf V's Weg (Kopfzelle in Blickrichtung bis zum Rand) weicht aus.
     - Fehler (`invalidAction`, in dieser Pruefreihenfolge): ohne `vehicleId` → `noTarget`; V unbekannt → `unknownVehicle`; V nicht `parked` → `notParked`; Weg frei → `notBlocked`; erstes Hindernis ist eine `fixed`-Zelle → `blockedByBollard`; Blocker B ist `locked` → `blockerLocked`; B kann nicht ausweichen → `cannotYield`. Ein Schloss an V selbst ist egal.
     - Ausweichen: B rutscht entlang seiner eigenen Achse vorwaerts (Blickrichtung) oder rueckwaerts um die kleinste Zellzahl, nach der keine seiner Zellen mehr auf V's Weg liegt. Alle ueberfahrenen und belegten Zellen muessen im Raster, frei von anderen `parked`-Fahrzeugen und frei von `fixed`-Zellen sein. Gleichstand → vorwaerts. Liegt B parallel zu V's Weg (gleiche Spur), ist Ausweichen unmoeglich (`cannotYield`). B behaelt `dir`, nur `x`/`y` aendern sich.
     - Snapshot in `history` vor dem Ausweichen, markiert mit `honk: true`; Undo stellt die Position wieder her und gibt die Hupe zurueck (Zaehler + 1, `powerUpsUsed` − 1; das Undo selbst zaehlt wie immer). `moves` unveraendert. Events: `vehicleYielded`, `powerUpUsed`; danach Einsteigen + Sieg/Niederlage pruefen.
     - Erlaubt auch im Zustand `lost` mit `loseReason = noMoves` (setzt auf `playing` zurueck und bewertet neu); bei anderen Niederlagen → `gameLost`.
       Jede erfolgreiche Nutzung: Zähler − 1, `powerUpsUsed + 1`, Event `powerUpUsed`.
7. Aktionen im Zustand `won` bzw. `lost` (außer Undo bei `lost`) → `invalidAction`.
8. **Mystery-Fahrzeuge** (Level-Fahrzeug `mystery: true`, nur mit `special.mysteryVehicles`): Die Farbe ist verdeckt (`VehicleState.hidden = true`), bis das Fahrzeug `parked` ist und sein Weg frei ist (gleiche Wegprüfung wie beim Antippen: Kopfzelle in Blickrichtung bis zum Rand ohne `parked`-Fahrzeuge und `fixed`-Zellen; das Schloss ist egal). `color` steht trotzdem im Zustand (die Engine kennt alles, Verdecken ist reine Darstellung); Antippen, Einsteigen und Hupe ignorieren `hidden`. Folge: Ein verdecktes Fahrzeug ist nie antippbar.
   - `createGame`: Mystery-Fahrzeuge mit schon freiem Weg starten aufgedeckt (ohne Event), alle anderen verdeckt.
   - Nach jeder erfolgreichen zustandsändernden Aktion (Ausfahren, Power-Up inkl. Undo) wird neu geprüft; jedes neu aufgedeckte Fahrzeug erzeugt `vehicleRevealed` (`vehicleId`, `color`), in Reihenfolge von `state.vehicles`. Position im Event-Strom: nach `vehicleExited`/`vehicleUnlocked` bzw. nach `vehicleYielded`/`powerUpUsed`, vor `passengerBoarded`.
   - Aufdecken ist dauerhaftes Wissen: Undo stellt den Snapshot wieder her, verdeckt aber nichts erneut (`hidden` nach Undo = `hidden` im Snapshot **und** `hidden` jetzt).
   - Level ohne Mystery-Fahrzeuge: alle `hidden = false`, Verhalten und Event-Ströme unverändert.

## Nicht unterstützte Regeln

`createGame` liefert `LevelIssue` `unsupportedRule` für: `movement.model ≠ straight`, `movement.exits ≠ edges`, `movement.reversible`, `passengers.order ≠ strict`, `passengers.boardPolicy ≠ firstMatch`, `passengers.mysteryRate > 0`, `vehicles.dualColor`, `vehicles.departOnFull = false`, `special.oneWay|barriers`. Unterstützt: `special.fixed` (Zellen `fixed`), `special.keyVehicles` (`locked`/`keyId`) und `special.mysteryVehicles` (`mystery`).

## Level-Validierung (`validateLevel`)

Unbekannter Fahrzeugtyp oder Farbe (nicht in `rules.vehicles.colors`), Zellen außerhalb des Rasters, Überlappungen (Fahrzeug/Fahrzeug, Fahrzeug/`fixed`), doppelte IDs, Fahrgäste je Farbe ≠ Kapazität je Farbe (außer `meta.allowSurplus`, dann ≤), `keyId` unbekannt, Schlüsselzyklen, `locked` ohne `keyId`, `mysteryDisabled` (Fahrzeug mit `mystery: true`, aber `special.mysteryVehicles = false`; je Fahrzeug, mit `vehicleId`), nicht unterstützte Regeln.

## Renderer-Vertrag

- Der Renderer bekommt `GameState` zum Aufbau und spielt danach nur `GameEvent[]` ab (Animationen in Event-Reihenfolge).
- Er berechnet keine Spiellogik; Eingaben werden als `Action` an den Game-Controller (`src/app`) gegeben.
- Farben/Symbole/Tokens nur aus `src/render/theme.ts`.
- Verdeckte Mystery-Fahrzeuge (`hidden = true`) zeichnet der Renderer mit `THEME.mysteryFill`, Schraffur `THEME.mysteryStripe` und Symbol `THEME.mysteryGlyph` (`?`, Farbe `THEME.mysteryInk`), nie mit Palettenfarbe oder -symbol. `vehicleRevealed` spielt er als kurzes Aufdecken ab (bei reduzierter Bewegung sofort). DOM- und Screenreader-Texte nennen die Farbe eines verdeckten Fahrzeugs nie.

## Details zu Events und Zustand

- `vehicleExited.path`: Zellen **vor** der Kopfzelle bis zur letzten Zelle im Raster (ohne Kopfzelle; leer, wenn der Kopf schon am Rand steht).
- `passengersShuffled.to` ist exklusiv.
- `invalidAction.vehicleId` (optional): das in der Aktion genannte Fahrzeug, wenn es eins gibt (bei `tapVehicle` und `honk`, auch `unknownVehicle` traegt die genannte ID); der Renderer laesst ein vorhandenes Fahrzeug wackeln.
- `invalidAction.reason`: `unknownVehicle`, `notParked`, `gameWon`, `gameLost`, `noUsesLeft`, `noHistory`, `nothingToShuffle`, `noTarget`, `notBlocked`, `blockedByBollard`, `blockerLocked`, `cannotYield`.
- `vehicleRevealed`: `vehicleId` = aufgedecktes Mystery-Fahrzeug, `color` = seine Farbe (siehe Spielregeln 8).
- `hashState` enthält `hidden` nicht: Verdecken ändert die Mechanik nicht, und der Solver soll Zustände, die sich nur darin unterscheiden, nicht doppelt durchsuchen. Hashes von Leveln ohne Mystery-Fahrzeuge bleiben bitgleich.
- `vehicleYielded`: `vehicleId` = ausweichender Blocker, `byVehicleId` = hupendes Fahrzeug, `from`/`to` = Kopfzelle vorher/nachher.
- Undo nimmt Züge, Shuffles und Hupen zurück; nur eine zurückgenommene Hupe wird erstattet: per `extraSlot` hinzugefügte oder entsperrte Slots bleiben erhalten.
- `createGame` bewertet sofort das Ergebnis; ein Level ohne möglichen ersten Zug startet als `lost`/`noMoves`.
- Sterne: `starMode` `powerupsUsed` (Default) bewertet `powerUpsUsed`. Die Engine kennt weder Par noch Zeit: `moves` bewertet die rohe Zugzahl, `time` ergibt immer 3 Sterne (siehe `docs/ROADMAP.md`).

## Teilen per URL

- URL: `#/play?l=<code>`, Editor: `#/editor` bzw. `#/editor?l=<code>` (Level bearbeiten).
- `code = "1." + base64url(deflate(JSON(ShareLevel)))` ohne Padding, `fflate` (`deflateSync`/`inflateSync`, Level 9).
- Format `ShareLevel` (`src/schema/share.ts`): `r` Ruleset, `o` Overrides, `g` [w, h], `c` Zellen, `v` Fahrzeuge
  `[x, y, dir, typ, farbe(, keyIndex)]`, `k` Farbliste + `p` Fahrgaeste als Indizes, `t` Titel, `a` Autor, `u: 1` ungeprueft.
  Fahrzeug-IDs werden beim Dekodieren als `v1..vn` (Array-Reihenfolge) neu vergeben; `keyIndex` setzt `locked` + `keyId`.
- Grenzen: Code ≤ `SHARE_MAX_LENGTH` (2048) Zeichen, entpackt ≤ `SHARE_MAX_INFLATED` Bytes, Titel/Autor ≤ 40 Zeichen.
- `decodeLevel` wirft nie. Fehlercodes in Pruefreihenfolge: `empty`, `tooLong`, `version`, `encoding`, `inflate`,
  `json`, `schema`, `unknownRuleset`, `invalidLevel` (`validateLevel` meldet Probleme). Das dekodierte Level hat
  `id = "shared"`, Titel `t` oder `SHARED_DEFAULT_TITLE`, `meta.author = a`.
- Loesbarkeit prueft der Aufrufer per `SolverPort.analyze` (Worker). Ungepruefte Codes (`u`) werden trotzdem gespielt, mit Hinweis.
- Texte aus geteilten Leveln nur per `textContent`, nie als HTML.
- Round-Trip-Garantie: `decodeLevel(encodeLevel(L))` ergibt ein Level, das mit `L` bis auf Fahrzeug-IDs, `id`, `seed` und `meta` (ausser `author`) uebereinstimmt;
  `hashState(createGame(...))` ist nach Umbenennung der IDs gleich.

## Eigene Level (Spielstand)

`parking.save.v1` hat additiv `customLevels: { id: "c<n>", code, title, verified }[]` (max. `CUSTOM_LEVEL_LIMIT` = 50,
aelteste fallen raus). API in `Progress`: `saveCustom(entry, id?)`, `deleteCustom(id)`, `customLevels()`.
Import: `merge(save)` (Vereinigung nach Code) oder `replace(save)` (Einstellungen bleiben).
`settings` hat additiv `sound: boolean` (fehlt in alten Staenden → `true`), API `setSound(on)`.

## Solver-Port (App)

`SolverPort` (`src/app/solver-port.ts`): `hint`, `generate`, `analyze(level, rules, { maxStates?, signal? })`.
`hint` liefert `HintMove | null` (`src/solver/types.ts`): `{ action: 'tap' | 'honk', vehicleId }`. `analyze` und die Schwierigkeit kennen per Default nur Tipps; mit `AnalyzeOptions.allowHonk` gehoeren Hupen (begrenzt durch `powerUps.honk`) zum Zustandsraum, `solution` enthaelt sie als `honk:<vehicleId>`. `hint` bevorzugt einen Tipp, der ohne Hupe gewinnt; sonst setzt er `needsHonk: true` und liefert (Hupe uebrig) den Tipp oder die Hupe mit den meisten Gewinnfolgen in der Suche mit Hupe.
Der Worker-Auftrag `generate` akzeptiert `GeneratorOptions` (= `GeneratorParams & GeneratorTuning`).

## Welten und Packs

- Pack-Index `src/content/levels/pack-XX/index.json` = `PackIndex` (`src/schema/pack.ts`):
  `{ world, name, levels, intros }`. Ein Pack ist eine Welt; `world` ist eindeutig. `intros` ordnet
  einer Datei-ID eine `Mechanic` (`bollards` | `keys` | `honk`) zu: vor diesem Level erscheint die Intro-Karte.
- Rulesets: `classic` (Welt 1), `world2` (= classic mit `special.fixed`, `special.keyVehicles` und Hupe `powerups.honk` mit 1 Nutzung),
  `world3` (= `world2` mit Sterne-Schwellen `three: 1`, `two: 3`, damit die Pflicht-Hupe keinen Stern kostet).
  Die `special`-Flags beschreiben, was ein Ruleset einsetzt (Generator, Editor, UI); die Engine
  verarbeitet `fixed`-Zellen und `locked`/`keyId` unabhaengig davon.
- Kampagne (`src/app/levels.ts`): `Campaign.worlds: CampaignWorld[]` (aufsteigend), `CampaignLevel.world`,
  `CampaignLevel.intro?`. `number` zaehlt je Welt ab 1, `levels` ist die flache Liste aller Welten,
  `after()` bleibt innerhalb des Packs. Packs ohne gueltigen `PackIndex` werden ignoriert.
- Freischalten: Level 1 von Welt 1 ist offen; innerhalb einer Welt schaltet ein geschafftes Level
  (>= 1 Stern) das naechste frei; Level 1 von Welt N+1 ist offen, sobald **alle** Level von Welt N
  geschafft sind. Bereits geschaffte Level bleiben immer spielbar (keine Rueck-Sperre).
- Intro-Karte: einmal pro Mechanik vor dem ersten Start des Levels mit `intro`; gesehen wird im
  Spielstand gemerkt (additiv, `seenIntros: Mechanic[]`), ueber die Levelauswahl erneut abrufbar.
- Generator (`GeneratorTuning`): `bollards`, `keys` (Zahl oder `[min, max]`), `keyChainDepth`
  (Default 1), `requireHonk` (nur Level, die mit Tipps allein unloesbar und mit Hupe loesbar sind). Generierte Level setzen `ruleset` aus `GeneratorParams.ruleset`.
