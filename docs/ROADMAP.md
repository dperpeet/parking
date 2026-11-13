# ParKing: Roadmap

Offene Punkte, nach Themen gruppiert. Was das Spiel heute kann, steht in [DESIGN.md](DESIGN.md).

## Regeln und Engine

- Schranken (`barrier`, `gates`) und freie Wegsuche (`pathfinding`); Abbiegepfeile (`turns`) gibt es seit Welt 5.
- Doppelfarb-Fahrzeuge (`vehicles.dualColor`) und `departOnFull = false` (volle Fahrzeuge blockieren).
- Passagiere: `order` (`lookahead`, `free`), `boardPolicy` (`largestFree`, `playerChoice`) und `mysteryRate`.
- Pflicht-Hupe in Tageslevel, Endlos und Stufen (dort lösen heute Tipps allein).
- Mystery-Fahrzeuge in Tageslevel, Endlos und Stufen (heute nur in Welt 4, im Editor und in geteilten Leveln).
- Abbiegepfeile in Tageslevel, Endlos und Stufen (heute nur in Welt 5, im Editor und in geteilten Leveln).
- Hupen-Zahl im Editor einstellbar.

## Wertung

- `starMode` `moves` und `time` brauchen ein Par bzw. eine Zeit in der Engine.

## Modi

- Hover-Spurvorschau am Desktop.
- Gebogene Spurvorschau: Die Vorschau (Halten, Blockiert-Anzeige bei `vehicleBlocked`) endet heute auf dem ersten Pfeil, weil der Renderer Pfeile nicht auswertet; dafür braucht es den Weg aus der Engine (z. B. `exitPath` im Event).

## Editor

- Er lädt Rulesets selbst, statt den gemeinsamen Content-Lader zu nutzen.
- Er importiert Engine-Interna.
- Seine Texte liegen im Hauptbundle.
- Der Autor lässt sich beim Teilen nicht setzen.

## Sound

- Lautstärke-Regler und Ton auch direkt im Spiel umschaltbar (heute nur in den Einstellungen der Levelauswahl).
- Klang-Feinschliff (eigene Klänge je Fahrzeugtyp, leise Hintergrundmusik).

## Optik

- Animations-Feinschliff.
- Optionale Themes Holz und Flach (siehe [ADR 0001](adr/0001-visual-style-comic.md)).

## Performance

- Spielfeld samt PixiJS erst beim Levelstart dynamisch laden (`import()` von `game-screen`, `setMotionSetting` direkt aus `render/tween`): Initial-JS etwa 220 → 65 kB gz, dafür einmalig etwa 175 kB beim ersten Levelstart und eine kurze Ladeanzeige. Danach optional ungenutzte Pixi-Erweiterungen (`browserAll`) weglassen (etwa 10–20 kB gz).

## PWA und Offline

- Installierbarkeit und Offline-Betrieb.

## Release v1.0.0

- Anleitung.
- Datenschutzhinweis.
