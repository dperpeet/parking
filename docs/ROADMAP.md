# ParKing: Roadmap

Offene Punkte, nach Themen gruppiert. Was das Spiel heute kann, steht in [DESIGN.md](DESIGN.md).

## Regeln und Engine

- Schranken (`barrier`, `gates`) und freie Wegsuche (`pathfinding`); Abbiegepfeile (`turns`) gibt es seit Welt 5.
- Doppelfarb-Fahrzeuge (`vehicles.dualColor`) und `departOnFull = false` (volle Fahrzeuge blockieren).
- Passagiere: `order` (`lookahead`, `free`), `boardPolicy` (`largestFree`, `playerChoice`) und `mysteryRate`.
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

## PWA und Offline

- Installierbarkeit und Offline-Betrieb.
