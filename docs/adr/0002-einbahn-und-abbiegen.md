# ADR 0002: Einbahnstraßen und Abbiegen (Welt 5)

- Status: angenommen (2026-11-13)
- Entscheidung von: Dominik (Projektinhaber): Abbiegepfeile, Welt 5 ohne Mystery

## Kontext

Fahrzeuge fahren heute nur geradeaus (`movement.model = straight`) in Blickrichtung zum Rand. Das Schema kennt
schon `movement.model` `turns`/`pathfinding`, `special.oneWay` und den Zelltyp `oneWay` mit `dir`; die Engine
lehnt sie mit `unsupportedRule` ab. Poller werden laut Roadmap erst mit Abbiegen richtig interessant, weil ein
gerader Weg nur gesperrt oder frei ist. Welt 5 (24 Level) soll diese Mechanik einführen.

Randbedingungen: Engine deterministisch und rein, Renderer spielt nur Events ab, Spielstände (`pack-XX/NNN`),
Share-Codes und die Analyse von `pack-01` bis `pack-04` bleiben unverändert.

## Entscheidung

Wir setzen **Abbiegepfeile** um: `movement.model = turns` mit `oneWay`-Zellen als festen Fahrbahnpfeilen.
Der Weg eines Fahrzeugs bleibt **eindeutig und vorhersagbar**; es gibt keine Wegsuche.

### Regeln

1. **Pfeilzelle** (`{ type: "oneWay", dir }`): eine Fahrbahnmarkierung. Sie ist kein Hindernis, aber kein Fahrzeug
   darf auf ihr stehen (Validierung `overlap`, Generator und Editor beachten das).
2. **Weg zum Rand** (`exitPath`): Start an der Kopfzelle mit der Blickrichtung `d`. Schritt für Schritt in `d`
   weiter, bis der Rand verlassen wird. Betritt das Fahrzeug eine Pfeilzelle mit Richtung `p`:
   - `p = d` oder `p` quer zu `d` → `d := p` (geradeaus weiter bzw. **abbiegen**, links oder rechts),
   - `p` entgegen `d` → **Falschfahrt**: Die Pfeilzelle ist für dieses Fahrzeug ein Hindernis wie ein Poller.
     Ein Fahrzeug ändert seine Richtung nur auf Pfeilzellen. Eine Einbahnstraße ist eine Reihe gleich gerichteter
     Pfeile: Man darf von hinten oder von der Seite einfahren, aber nicht von vorn.
3. **Länge**: Das Fahrzeug folgt dem Weg wie ein Zug; es braucht nur die Wegzellen, keine Schwenkfläche.
   Die Fahrzeuglänge spielt beim Abbiegen keine Rolle.
4. **Blockiert** ist der Weg, wenn eine Wegzelle von einem geparkten Fahrzeug belegt ist, eine `fixed`-Zelle ist
   oder eine Falschfahrt-Pfeilzelle ist (`vehicleBlocked` `reason: path`, `blockerId` = Fahrzeug oder `null`).
5. **Schleifen** sind ungültig: Wenn ein Weg eine Zelle zweimal in gleicher Richtung betritt, meldet
   `validateLevel` `oneWayInvalid` (ebenso eine `oneWay`-Zelle ohne `dir`). Die Engine bricht die Verfolgung
   zusätzlich nach `4 · Breite · Höhe` Schritten ab.
6. **Freischaltung im Ruleset**: `oneWay`-Zellen brauchen `special.oneWay = true` und `movement.model = turns`,
   sonst `oneWayDisabled` (wie `mysteryDisabled`). `turns` ohne Pfeilzellen verhält sich exakt wie `straight`.
   `pathfinding`, `gates`, `barrier` und `reversible` bleiben `unsupportedRule`.

### Zusammenspiel mit anderen Mechaniken

- **Poller**: blockieren den gebogenen Weg wie bisher. Neu: Pfeile führen um Poller herum, Poller sperren
  Abbiegewege, die Spieler leicht übersehen.
- **Schlüssel**: unverändert (Schloss gilt am Fahrzeug, nicht am Weg).
- **Hupe**: Das erste Hindernis auf dem **gebogenen** Weg weicht aus; es rutscht wie bisher entlang seiner
  eigenen Achse, bis keine seiner Zellen mehr auf dem Weg liegt. Pfeilzellen gelten beim Ausweichen als belegt
  (ein Fahrzeug darf nie auf einem Pfeil stehen). Ist das erste Hindernis eine Falschfahrt-Pfeilzelle, gibt es
  `invalidAction` mit neuem Grund `wrongWay` (Prüfreihenfolge direkt nach `blockedByBollard`).
- **Mystery**: Aufdecken nutzt dieselbe Wegprüfung, also den gebogenen Weg. Keine weitere Änderung.
- **Wertung**: Jede Lösung braucht weiter genau einen Zug pro Fahrzeug; `starMode` bleibt `powerupsUsed`.

### Events und Renderer

- `vehicleExited.path`: wie bisher die Zellen vor der Kopfzelle bis zur letzten Zelle im Raster, jetzt als
  zusammenhängender Linienzug mit Knicken. Bei geraden Wegen bitgleich.
- Neu, optional: `vehicleExited.exitDir: Dir`, die Richtung, in der das Fahrzeug das Raster verlässt. Das Feld gibt
  es nur, wenn sie von der Blickrichtung abweicht (sonst fehlt es; Event-Ströme gerader Level bleiben bitgleich).
  Damit muss der Renderer keine Pfeile auswerten.
- Der Renderer fährt den Fahrzeugkörper entlang des Linienzugs (Kopf vorn, Drehung an den Knicken, danach in
  `exitDir` aus dem Raster). Reduzierte Bewegung: kurze Überblendung wie heute.
- Pfeilzellen zeichnet der Renderer als Fahrbahnpfeil (Theme-Token, Comic-Kontur, deutlich vom Fahrzeugpfeil
  unterscheidbar), DOM/Screenreader: „Einbahn nach Norden" usw. Neue Intro-Karte `oneWay`.

### Solver und Zustandsraum

Die Wege hängen nur von Kopfzelle, Blickrichtung und den festen Pfeilzellen ab. Ohne Hupe ändert sich nichts am
Zustand; die Blockade-Beziehungen bleiben statisch, der Zustandsraum wächst also **nicht**. `analyze` und `hint`
laufen über `step` (langsamer Pfad, wie heute bei Leveln mit Pollern); der schnelle Pfad bleibt auf zellfreie,
gerade Level beschränkt. `hashState` bleibt unverändert (Pfeile sind statisch und gehören zum Level).

### Generator

- Neu in `GeneratorTuning`: `oneWay` (Zahl oder `[min, max]` Pfeile, nur mit `special.oneWay` und `turns`, sonst
  wirft `generate`) und `oneWayStreets` (Pfeile als Straßenstücke der Länge 1-3). Ohne `oneWay` bleibt die
  Ausgabe bitgleich (Zufall für Pfeile aus einem eigenen, abgeleiteten PRNG, wie bei Mystery).
- Pfeile werden vor den Fahrzeugen gesetzt; die Rückwärts-Konstruktion nutzt `exitPath` statt des geraden Wegs.
  Kandidatenpositionen mit Falschfahrt oder Schleife werden verworfen.
- Rollenprüfung (wie `bollardHasRole`): Mindestens ein Pfeil muss einen Weg tatsächlich umlenken, und mindestens
  ein Fahrzeug muss durch einen Abbiegeweg blockiert sein. Sonst Kandidat verwerfen.
- `requireHonk` zusammen mit `oneWay` wird nicht unterstützt (wirft), Welt 5 braucht das nicht.

### Schwierigkeit im Griff halten

- `computeDifficulty` bleibt unverändert; die Rampe steuern Pfeilzahl, Rastergröße, Poller und Schlüssel.
- Lesbarkeit vor Tiefe: höchstens ein Knick pro Weg in Level 1-8, höchstens zwei danach (Generator-Filter
  `maxTurns`, Default unbegrenzt), Pfeile nur als zusammenhängende Straßenstücke.
- Rampe Welt 5: Level 1-4 5x5 mit 1-2 Pfeilen, ohne Poller und Schlüssel; 5-8 mit Pollern; 9-14 6x6 mit 3-4
  Pfeilen und einem Schlüssel; 15-20 6x6/7x7 mit 4-5 Pfeilen, 1-3 Pollern, 1-2 Schlüsseln; 21-24 7x7 mit 5-6
  Pfeilen, Schlüsselketten der Tiefe 2, 6 Farben. Ziel-Schwierigkeit 2,5 → 7,5, eine optionale Hupe (Ruleset
  `world5` = `world2` + `special.oneWay` + `movement.model = turns`), kein Mystery in der Kampagne.

### Schnittstellen-Änderungen (eigener Commit mit `INTERFACES.md`)

- `src/engine/types.ts`: `vehicleExited.exitDir?`, `LevelIssue` `oneWayDisabled`/`oneWayInvalid`,
  `invalidAction.reason` `wrongWay`.
- `src/schema/pack.ts`: `Mechanic` um `oneWay` erweitert (additiv; `seenIntros` alter Stände bleiben gültig).
- `src/solver/types.ts`: `GeneratorTuning.oneWay`, `oneWayStreets`, `maxTurns`.
- Share-Format: **keine Änderung**. `ShareCell` kodiert `[x, y, "oneWay", dir]` schon; alte Codes bleiben gültig.

## Verworfene Variante: freie Wegsuche (`pathfinding`)

Fahrzeuge suchen selbst den kürzesten freien Weg zu irgendeinem Rand. Verworfen: Der Weg hängt vom ganzen Zustand
ab, Spieler können ihn schlecht vorhersagen, und der Solver müsste pro Zustand Wege suchen. Tipp-Puzzles leben
davon, dass man sieht, was ein Tipp bewirkt.

## Kleinere Alternative (falls die volle Version zu groß ist)

**Einbahn ohne Abbiegen**: Pfeilzellen lassen nur Durchfahrt in Pfeilrichtung (und quer) zu, lenken aber nicht um;
`movement.model` bleibt `straight`. Keine Änderung an Events, Renderer-Animation und Generator-Wegen, nur eine
neue Hindernisart. Nachteil: spielerisch kaum mehr als „Poller mit Richtung", das Poller-Problem der Roadmap
bleibt ungelöst. Möglich als Zwischenschritt, ausbaubar zur vollen Variante ohne Bruch.

## Konsequenzen

- Größte Engine-Änderung bisher, aber ohne Zustandsraum-Explosion.
- Renderer braucht eine Linienzug-Animation und eine Pfeilzellen-Grafik; Editor ein Pfeil-Werkzeug mit Drehung.
- Tageslevel, Endlos und Stufen bleiben vorerst ohne Pfeile (Roadmap-Eintrag).
- Später möglich: Spurvorschau beim Halten/Hover (Roadmap), Schranken (`barrier`), Ausfahrten (`gates`).
