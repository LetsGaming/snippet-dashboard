# Snippet Dashboard

One page that lists and renders a pile of standalone HTML snippets. A snippet is
a small self-contained tool (a calculator, a quiz, a visualiser) that lives in
its own folder, runs in its own iframe, and knows nothing about the others. Add,
change, or delete one without touching the rest.

The wrapper has exactly one runtime dependency: Vue. Everything else is the
Vite/TypeScript toolchain.

## Quick start

```bash
npm install
npm run dev      # builds the manifest, then starts Vite
```

Open the printed URL. The sidebar lists every snippet; click one to load it. The
active snippet is stored in the URL hash (`#/r34-rechner`), so links are
shareable and the back button works.

```bash
npm run build    # typecheck + production build into dist/
npm run preview  # serve that build locally
```

## Run it with Docker

The production build is static, so the image is a two-stage build: Node builds
it, nginx serves it.

```bash
docker compose up -d --build
```

That serves the dashboard on http://localhost:8080. Change the port in
`docker-compose.yml` if 8080 is taken. Prebuilt images land on GHCR on every
push to `main`, so a homelab can pull instead of build. Sub-path deploys,
pulling the image, and adding snippets to a running instance are all in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Adding snippets

Two routes, same result on disk.

**With the editor.** Run `npm run dev` and use the sidebar. "+ Neues Snippet"
opens an empty editor: type an id, some metadata, and HTML, watch the live
preview, save. The "✎" on any snippet opens it for editing or deletion. In dev
the editor writes real files under `public/snippets/` and regenerates the
manifest, so the result is commit-ready. The static build has no backend, so
there it saves to the browser instead; those snippets are per-device and never
collide with a deploy. "Herunterladen" exports one so you can drop it into
`public/snippets/` and commit it. Full walkthrough in
[docs/SNIPPETS.md](docs/SNIPPETS.md).

**By hand.**

1. Copy `public/snippets/_template/` to `public/snippets/<your-id>/`.
2. Replace `index.html` with your standalone page.
3. Edit `meta.json` (or delete it to fall back to defaults).
4. Run `npm run dev` (or `npm run snippets:manifest`).

Either way, a snippet is any folder under `public/snippets/` with an
`index.html`. Folders starting with `_` or `.` are skipped, which is why
`_template` never shows up.

## What "self-contained" means

Snippets are static files loaded in a sandboxed iframe, so each one gets its own
document, its own CSS scope, and its own JavaScript globals. A snippet can pull
in its own dependencies (a CDN script, say), but the wrapper imposes no build
step and no framework on it. Plain HTML is the whole contract. The sandbox and
dark-mode notes are in [docs/SNIPPETS.md](docs/SNIPPETS.md).

## Project layout

```
public/snippets/           the snippets, pure static files
  _template/               copy-me starter (ignored by the generator)
  r34-rechner/             a real snippet: index.html + meta.json
  manifest.json            generated, do not edit by hand
scripts/
  generate-manifest.mjs    scans public/snippets/, writes manifest.json
  vite-plugin-snippets.mjs dev-only file API behind the editor
src/
  components/              presentational: sidebar, iframe, empty state, editor
  composables/             useSnippets (data), useHashRoute (nav), useSnippetEditor
  services/                the only place that fetches or touches storage
  utils/                   pure helpers (joinBase)
  types/                   Snippet, SnippetManifest, meta shapes
  assets/                  tokens.css (theme), main.css (base)
  config.ts                shared constants
  App.vue                  the container that wires it together
docker/                    nginx config for the image
docs/                      the write-ups (see below)
```

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit and why the design is what it is.
- [docs/SNIPPETS.md](docs/SNIPPETS.md): writing snippets, from the folder contract to `meta.json`, the editor, and sandboxing.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Docker, static hosting, base paths, updating a live instance.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): local setup, the scripts, the dev file API, and every config knob.
