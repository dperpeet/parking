# ParKing: Roadmap

Offene Punkte, nach Themen gruppiert. Was das Spiel heute kann, steht in [DESIGN.md](DESIGN.md).

## Regeln und Engine

- Einbahnstraßen, Abbiegen (`turns`, `pathfinding`), Schranken und Mystery-Fahrzeuge.
- Doppelfarb-Fahrzeuge (`vehicles.dualColor`) und `departOnFull = false` (volle Fahrzeuge blockieren).
- Passagiere: `order` (`lookahead`, `free`), `boardPolicy` (`largestFree`, `playerChoice`) und `mysteryRate`.
- Die Hupe ist da und in Welt 3 Pflicht. Poller werden spielerisch erst mit Einbahn und Abbiegen richtig interessant, weil Fahrzeuge nur geradeaus fahren; beides ist offen.
- Pflicht-Hupe in Tageslevel, Endlos und Stufen (dort lösen heute Tipps allein).
- Hupen-Zahl im Editor einstellbar.

## Wertung

- `starMode` `moves` und `time` brauchen ein Par bzw. eine Zeit in der Engine.

## Modi

- Hover-Spurvorschau am Desktop.

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
