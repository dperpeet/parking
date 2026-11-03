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

## Deployment

### GitHub Pages (Standard)

Push auf `main` -> CI -> Workflow `pages.yml` baut mit `VITE_BASE=/parking/` und veroeffentlicht auf
https://dperpeet.github.io/parking/. Einmalig im Repo: Settings -> Pages -> Source: **GitHub Actions**.
Manuell anstossen: Actions -> Pages -> Run workflow.

### Eigener Server mit podman (optional)

`image.yml` baut nach jeder erfolgreichen CI auf `main` das Image `ghcr.io/dperpeet/parking` (Caddy, Basis-Pfad `/`).
Dateien liegen in `deploy/container/`. Voraussetzung: podman, DNS-A-Record der (Sub-)Domain auf den Server.
Ist das Paket privat: `podman login ghcr.io` mit einem Token mit `read:packages`.

- **Quadlet (empfohlen):** `parking.container` und die beiden `.volume`-Dateien nach `~/.config/containers/systemd/`
  kopieren, `PARKING_DOMAIN` in der Unit setzen, dann `systemctl --user daemon-reload && systemctl --user start parking`
  und `loginctl enable-linger $USER`. Updates: `systemctl --user enable --now podman-auto-update.timer`
  (Label `io.containers.autoupdate=registry`).
- **podman compose:** `deploy/container/compose.yml` nach `~/parking/compose.yml`, `PARKING_DOMAIN=spiel.example.org`
  in `~/parking/.env`, dann `podman compose pull && podman compose up -d`.
- **Rootless-Ports:** 80/443 sind gesperrt. Entweder `sysctl net.ipv4.ip_unprivileged_port_start=80` setzen
  oder 8080:80 / 8443:443 mappen und einen Reverse-Proxy davorsetzen.

Ohne Domain lauscht Caddy auf `:80` ohne TLS (nur zum Testen). Das TLS-Zertifikat holt Caddy automatisch (Volume `caddy_data`).

## Lizenz

Code: [MIT](LICENSE). Level und sonstige Inhalte (Level-JSONs, Texte): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
