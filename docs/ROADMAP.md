# ParKing: Roadmap

Offene Punkte, nach Themen gruppiert. Was das Spiel heute kann, steht in [DESIGN.md](DESIGN.md).

## Regeln und Engine

- Einbahnstraßen, Abbiegen (`turns`, `pathfinding`), Schranken und Mystery-Fahrzeuge.
- Doppelfarb-Fahrzeuge (`vehicles.dualColor`) und `departOnFull = false` (volle Fahrzeuge blockieren).
- Passagiere: `order` (`lookahead`, `free`), `boardPolicy` (`largestFree`, `playerChoice`) und `mysteryRate`.
- Poller werden spielerisch erst mit Einbahn, Abbiegen und Hupe interessant, weil Fahrzeuge nur geradeaus fahren.

## Wertung

- `starMode` `moves` und `time` brauchen ein Par bzw. eine Zeit in der Engine.

## Modi

- Tageslevel, Endlos und Stufen kennen nur das Ruleset `classic`.
- Hover-Spurvorschau am Desktop.

## Editor

- Er lädt Rulesets selbst, statt den gemeinsamen Content-Lader zu nutzen.
- Er importiert Engine-Interna.
- Seine Texte liegen im Hauptbundle.
- Der Autor lässt sich beim Teilen nicht setzen.

## Sound

- Der Sound-Schalter in den Einstellungen ist ein Platzhalter.

## Optik

- Animations-Feinschliff.
- Optionale Themes Holz und Flach (siehe [ADR 0001](adr/0001-visual-style-comic.md)).

## PWA und Offline

- Installierbarkeit und Offline-Betrieb.

## Qualitäts-Gates

- Coverage-Schwelle für die Engine (mindestens 90 %): derzeit nicht in der CI.

## Release v1.0.0

- Mindestens 60 Level.
- Anleitung.
- Datenschutzhinweis.
