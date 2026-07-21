# Snippet Dashboard

A minimal Vue 3 wrapper that acts as a single entry point for independent,
self-contained HTML snippets — small standalone tools like a calculator, a
visualiser, a form. Each snippet lives in its own folder, runs in its own
iframe, and knows nothing about the others. Add, change, or delete one without
touching or breaking any other.

The wrapper itself has exactly one runtime dependency: **Vue**. Everything else
is the Vite/TypeScript toolchain.

## Quick start

```bash
npm install
npm run dev      # generates the manifest, then starts Vite
```

Open the printed URL. The sidebar lists every snippet; clicking one loads it.
The selected snippet is reflected in the URL hash (`#/r34-rechner`), so links
are shareable and the back button works.

```bash
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build locally
```

## Adding & editing snippets

There are two ways to manage snippets.

### With the editor (dev only)

Run `npm run dev` and use the sidebar:

- **+ Neues Snippet** opens an empty editor — type an id, some metadata, and
  HTML, watch the live preview, and save. The folder is written and registered
  automatically.
- The **✎** on any snippet opens it for editing; the editor can also delete it.

The editor works in both environments; only where it saves differs. In
**development** it writes real files under `public/snippets/` through the
dev-server API and regenerates the manifest — permanent and commit-ready. In
the **static production build** there is no backend, so it saves to this
browser's storage instead. Browser snippets are per-device and live in a layer
separate from the deployed files, so app updates never conflict with them; use
**Herunterladen** to export one into `public/snippets/` if you want to commit
it. See `docs/ARCHITECTURE.md` → *Two layers* for the details.

### By hand

The editor is just a convenience over the file layout, so the manual route is
identical in effect:

1. Copy `public/snippets/_template/` to `public/snippets/<your-id>/`.
2. Replace `index.html` with your standalone HTML.
3. Edit `meta.json` (or delete it to fall back to defaults).
4. Run `npm run dev` (or `npm run snippets:manifest`).

Either way: a snippet is any folder under `public/snippets/` that contains an
`index.html`. Folders starting with `_` or `.` are ignored (that is why
`_template` never shows up).


## What "self-contained" means

Snippets are served as static files and loaded in a sandboxed `<iframe>`. That
gives each one its own document, its own CSS scope, and its own JavaScript
globals. A snippet **may** pull in its own dependencies (e.g. a CDN `<script>`),
but the wrapper actively supports only plain HTML snippets — there is no build
step or framework contract imposed on them.

## Project layout

```
public/snippets/           # the snippets — pure static files
  _template/               #   copy-me starter (ignored by the generator)
  r34-rechner/             #   a real snippet: index.html + meta.json
  manifest.json            #   generated; do not edit by hand
scripts/
  generate-manifest.mjs    # scans public/snippets/, writes manifest.json
src/
  components/              # presentational: TheSidebar, SnippetFrame, AppEmptyState
  composables/             # useSnippets (data), useHashRoute (navigation)
  services/                # snippetService — the only place that fetches
  utils/                   # pure helpers (joinBase)
  types/                   # Snippet, SnippetManifest
  assets/                  # tokens.css (theme), main.css (base)
  config.ts                # shared constants
  App.vue                  # the container that wires it together
docs/ARCHITECTURE.md       # the detailed write-up
```

## Deployment

Static output. Any static host works. For a project sub-path (e.g. GitHub
Pages at `/repo-name/`), set the base:

```bash
VITE_BASE=/repo-name/ npm run build
```

See `docs/ARCHITECTURE.md` for the reasoning behind the design and the full
snippet contract.
