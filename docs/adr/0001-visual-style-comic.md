# ADR 0001: Visueller Stil „Comic“

- Status: angenommen (2026-11-02)
- Entscheidung von: Dominik (Projektinhaber)

## Kontext

Drei Stilrichtungen wurden als klickbare Mockups verglichen: A Holz-Werkstatt, B Flach & klar, C Comic.

## Entscheidung

Wir setzen **C Comic** um:

- dicke dunkle Konturen (3 px, `#1A1A1A`), harte Versatzschatten (3–5 px), runde Ecken
- warmer gelber Hintergrund, türkises Spielfeld, Akzent Korallenrot
- Schrift **Baloo 2** (self-hosted, keine externen Requests zur Laufzeit)
- jede Fahrzeug-/Fahrgastfarbe hat zusätzlich ein **Symbol** (● ▲ ■ ★ ◆ ✚ …)

Verbindliche Werte: `src/render/theme.ts` (`PALETTE`, `THEME`).

## Merken für später

A (Holz) und B (Flach) waren ebenfalls gut. Weil alle Stilwerte als Tokens in `theme.ts` liegen, können sie später als **alternative Themes** in den Einstellungen nachgerüstet werden.

## Konsequenzen

- Renderer und DOM-UI lesen Farben/Abstände nur aus `theme.ts`, keine Hex-Werte im restlichen Code.
- Schriftdatei (Baloo 2, SIL OFL) wird unter `public/fonts/` abgelegt und in `ASSETS.md` dokumentiert.
