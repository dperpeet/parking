# Schnittstellen (eingefroren für M1/M2)

Änderungen an den hier genannten Dateien nur durch den Orchestrator.

| Vertrag                                        | Datei                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Ruleset-/Level-Schemas (zod, Typen)            | `src/schema/ruleset.ts`, `src/schema/level.ts`                             |
| Engine-Typen, Aktionen, Events, API-Signaturen | `src/engine/types.ts`                                                      |
| Farbpalette, Symbole, Theme-Tokens             | `src/render/theme.ts`                                                      |
| Beispiel-Content                               | `src/content/rulesets/classic.json`, `src/content/levels/pack-01/007.json` |
| Share-Format (zod, Grenzen, Fehlercodes)       | `src/schema/share.ts`                                                      |
| Share-Codec-API                                | `src/app/share.ts` (Signaturen; Rumpf gehoert Paket F1)                    |
| Solver-Typen inkl. `GeneratorTuning`           | `src/solver/types.ts`                                                      |
| Routen                                         | `src/app/router.ts` (`Route`, `PlayRoute`)                                 |

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

## Spielregeln (M1-Umfang)

1. **Antippen** (`tapVehicle`): Fahrzeug muss `parked` sein und darf nicht `locked` sein. Der Weg von der Kopfzelle in Blickrichtung bis zum Rasterrand muss frei sein (keine `parked`-Fahrzeuge, keine `fixed`-Zellen). Es muss ein `empty`-Slot existieren. Sonst: Event `vehicleBlocked` (Grund `locked` > `path` > `queueFull`; `blockerId` = erstes blockierendes Fahrzeug oder `null`), Zustand unverändert, **kein Zug gezählt**, kein Verlaufseintrag.
2. **Ausfahren:** Snapshot in `history`, Fahrzeug → `queued`, belegt den ersten `empty`-Slot (`firstFree`) bzw. den ersten freien Slot nach dem letzten belegten (`fifo`). `moves + 1`. Event `vehicleExited` mit `path` (Zellen bis zum Rand). Fahrzeuge mit `keyId` = dieses Fahrzeug werden entsperrt (`vehicleUnlocked`).
3. **Einsteigen** (automatisch, nach jeder Zustandsänderung): Solange der vorderste Fahrgast in einen Slot-Fahrzeug gleicher Farbe mit freier Kapazität passt, steigt er ein (Slot mit kleinstem Index zuerst, `firstMatch`). Event `passengerBoarded`. Ist das Fahrzeug voll und `departOnFull`, fährt es ab: Status `departed`, Slot `empty`, Event `vehicleDeparted`; bei `fifo` rücken die folgenden Slots auf (`slotShifted`).
4. **Sieg:** alle Fahrgäste eingestiegen → `won`, Sterne nach `scoring` (Wert = `powerUpsUsed`, `moves - par` bzw. Zeit), Event `won`.
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
   - `honk`: in M1 nicht implementiert → `invalidAction`.
     Jede erfolgreiche Nutzung: Zähler − 1, `powerUpsUsed + 1`, Event `powerUpUsed`.
7. Aktionen im Zustand `won` bzw. `lost` (außer Undo bei `lost`) → `invalidAction`.

## Nicht unterstützt in M1

`createGame` liefert `LevelIssue` `unsupportedRule` für: `movement.model ≠ straight`, `movement.exits ≠ edges`, `movement.reversible`, `passengers.order ≠ strict`, `passengers.boardPolicy ≠ firstMatch`, `passengers.mysteryRate > 0`, `vehicles.dualColor`, `vehicles.departOnFull = false`, `special.oneWay|barriers|mysteryVehicles`. Unterstützt: `special.fixed` (Zellen `fixed`) und `special.keyVehicles` (`locked`/`keyId`).

## Level-Validierung (`validateLevel`)

Unbekannter Fahrzeugtyp oder Farbe (nicht in `rules.vehicles.colors`), Zellen außerhalb des Rasters, Überlappungen (Fahrzeug/Fahrzeug, Fahrzeug/`fixed`), doppelte IDs, Fahrgäste je Farbe ≠ Kapazität je Farbe (außer `meta.allowSurplus`, dann ≤), `keyId` unbekannt, Schlüsselzyklen, `locked` ohne `keyId`, nicht unterstützte Regeln.

## Renderer-Vertrag

- Der Renderer bekommt `GameState` zum Aufbau und spielt danach nur `GameEvent[]` ab (Animationen in Event-Reihenfolge).
- Er berechnet keine Spiellogik; Eingaben werden als `Action` an den Game-Controller (`src/app`) gegeben.
- Farben/Symbole/Tokens nur aus `src/render/theme.ts`.

## Präzisierungen (nach M1-Umsetzung)

- `vehicleExited.path`: Zellen **vor** der Kopfzelle bis zur letzten Zelle im Raster (ohne Kopfzelle; leer, wenn der Kopf schon am Rand steht).
- `passengersShuffled.to` ist exklusiv.
- `invalidAction.reason`: `unknownVehicle`, `notParked`, `gameWon`, `gameLost`, `noUsesLeft`, `noHistory`, `nothingToShuffle`, `notImplemented`.
- Undo nimmt nur Züge/Shuffles zurück: per `extraSlot` hinzugefügte oder entsperrte Slots bleiben erhalten.
- `createGame` bewertet sofort das Ergebnis; ein Level ohne möglichen ersten Zug startet als `lost`/`noMoves`.
- Offen: `starMode` `moves`/`time` brauchen Par bzw. Zeit; die Engine kennt beides nicht. Bis zur Klärung bewertet `moves` die rohe Zugzahl und `time` immer mit 3 Sternen (App muss Zeit selbst bewerten). Default bleibt `powerupsUsed`.

## Teilen per URL (M4)

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

## Solver-Port (App)

`SolverPort` (`src/app/solver-port.ts`): `hint`, `generate`, neu `analyze(level, rules, { maxStates?, signal? })`.
Der Worker-Auftrag `generate` akzeptiert `GeneratorOptions` (= `GeneratorParams & GeneratorTuning`).
