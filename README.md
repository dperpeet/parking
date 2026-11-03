# ParKing

Ein kostenloses, regelbasiertes Parkplatz-Puzzle im Browser: Holzautos aus der Spielzeug-Werkstatt
ausparken, Passagiere in passende Fahrzeuge einsteigen lassen. Ohne Werbung, Accounts und Tracking.
Mobile-first, als PWA installierbar. Alle Regeln sind datengetrieben (JSON-Rulesets und JSON-Level).

Der vollstaendige Plan (Game Design, Architektur, Meilensteine) steht in [PLAN.md](PLAN.md).
Leitplanken fuer Entwickler und Agents: [CLAUDE.md](CLAUDE.md).

**Status:** M4 (Kampagne Welt 1 mit 30 Leveln, Tageslevel, Endlos, Level-Editor, Teilen per Link).

## Entwicklung

Voraussetzungen: Node 22 (`.nvmrc`), pnpm (`corepack enable`).

```sh
pnpm install
pnpm dev            # Dev-Server
pnpm build          # Produktions-Build nach dist/ (Basis-Pfad: --base=/pfad/ oder VITE_BASE)
pnpm preview        # Build lokal ansehen
pnpm lint           # ESLint (inkl. Import-Grenzen)
pnpm format         # Prettier schreiben (format:check prueft nur)
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest
pnpm test:e2e       # Playwright (Chromium mobile + desktop)
```

Lokal mit vorinstalliertem Chromium: `PW_CHROMIUM_PATH=/pfad/zu/chromium pnpm test:e2e`.
Sonst einmalig `pnpm exec playwright install chromium`.

## Deployment (eigener Server)

Push auf `main` -> CI -> Docker-Image nach `ghcr.io/dperpeet/parking` -> SSH-Deploy.

### Server einrichten

1. Server mit Docker und Docker Compose, Ports 80 und 443 offen, DNS-A-Record der (Sub-)Domain auf den Server.
2. Deploy-Nutzer anlegen (in der Gruppe `docker`) und den oeffentlichen SSH-Schluessel hinterlegen.
3. Auf dem Server `~/parking/` anlegen und `deploy/docker/compose.yml` als `compose.yml` dorthin kopieren.
4. In `~/parking/.env` die Domain setzen: `PARKING_DOMAIN=spiel.example.org`.
   Ohne Domain (leer/nicht gesetzt) lauscht Caddy auf `:80` ohne TLS (nur zum Testen).
5. Falls das Paket privat ist: `docker login ghcr.io` mit einem Token mit `read:packages`.
6. Erster Start: `cd ~/parking && docker compose pull && docker compose up -d`.
7. GitHub-Secrets im Repo setzen: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`.
   Ist `DEPLOY_HOST` leer, wird der SSH-Deploy-Schritt uebersprungen (das Image wird trotzdem gebaut).

Caddy holt das TLS-Zertifikat automatisch (Daten im Volume `caddy_data`).

## Lizenz

Code: [MIT](LICENSE). Level und sonstige Inhalte (Level-JSONs, Texte): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
