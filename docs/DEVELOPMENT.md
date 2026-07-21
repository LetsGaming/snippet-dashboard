# Development

## Prerequisites

Node 20 or newer and npm. Nothing else: the dev server is Vite plus a small file
API for the editor, and there is no database.

## Setup

```bash
npm install
npm run dev
```

`predev` regenerates the manifest, then Vite starts and prints a URL. Edits
hot-reload. The editor is available in dev and writes real files (see
[SNIPPETS.md](SNIPPETS.md#the-editor)).

## Scripts

| Script                      | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `npm run dev`               | Regenerate the manifest, then start Vite with the editor |
| `npm run build`             | Typecheck (`vue-tsc --noEmit`), then build into `dist/`  |
| `npm run preview`           | Serve the built `dist/` locally                          |
| `npm run typecheck`         | Types only, no build                                     |
| `npm run snippets:manifest` | Rescan `public/snippets/`, rewrite `manifest.json`       |

`snippets:manifest` also runs automatically via the `predev` and `prebuild`
hooks, so you rarely call it directly. The manifest is git-ignored and always
regenerated, so it never needs hand-editing.

## The dev-server file API

The editor's dev backend is `scripts/vite-plugin-snippets.mjs`, a Vite plugin with
`apply: 'serve'`. It exists only under `vite dev`; the production build has no
writable endpoint. It handles `/__api/snippets/:id`:

| Method   | Effect                                                    |
| -------- | --------------------------------------------------------- |
| `GET`    | Return `{ id, html, meta }` for editing                   |
| `PUT`    | Write `index.html` + `meta.json`, regenerate the manifest |
| `DELETE` | Remove the folder, regenerate the manifest                |

Ids are validated against `^[a-z0-9][a-z0-9-]*$` server-side, which blocks path
traversal out of `public/snippets/`. Request bodies are capped at 5 MB. It reuses
`generateManifest()` from the manifest script, so there is one implementation of
"scan folders -> manifest".

## Configuration

App-wide constants live in `src/config.ts`. One source, imported everywhere, never
re-derived.

| Constant                  | Value / type                                    | Purpose                                                      |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `APP_TITLE`               | `'Snippet Dashboard'`                           | Shown in the shell                                           |
| `DEFAULT_SNIPPET_SANDBOX` | `allow-scripts allow-same-origin allow-forms allow-popups allow-modals` | Sandbox for bundled snippets without an override |
| `USER_SNIPPET_SANDBOX`    | `allow-scripts`                                 | Sandbox for browser (`srcdoc`) snippets: opaque origin       |
| `MANIFEST_PATH`           | `snippets/manifest.json`                        | Where the app fetches the manifest, relative to the base URL |
| `DEFAULT_SNIPPET_ORDER`   | `100`                                           | Sort weight for snippets without an explicit `order`         |
| `EDITOR_ENABLED`          | `true`                                          | Whether the editor UI is shown                               |
| `EDITOR_BACKEND`          | `'api'` in dev, `'local'` in prod               | Where saves land: dev-server files, or browser storage       |
| `NEW_SNIPPET_HTML`        | HTML string                                     | Starting document for a new snippet                          |

`EDITOR_BACKEND` keys off `import.meta.env.DEV`, so it switches automatically
between the two backends. `DEFAULT_SNIPPET_SANDBOX` shares its name with the
per-snippet `sandbox` in `meta.json`, which replaces it for one snippet (see
[SNIPPETS.md](SNIPPETS.md#sandboxing)).

Two knobs live outside `config.ts`:

- **`VITE_BASE`** (build-time env) sets the base URL for sub-path deploys. Default
  `/`. See [DEPLOYMENT.md](DEPLOYMENT.md#sub-path-deploys).
- **Theme tokens** live in `src/assets/tokens.css` as CSS custom properties, with
  a dark set under `prefers-color-scheme: dark`. Change colours, spacing, radii,
  and typography there; wrapper components reference tokens only.

## Where things live

The full project layout is in the [README](../README.md#project-layout). The short
version for changing things:

- UI is in `src/components/` (presentational, props in / events out).
- Logic is in `src/composables/` and `src/services/`; components don't fetch or
  hold business logic.
- `fetch` and storage access live only in the services.
- Style values live in `src/assets/tokens.css`, not inline in components.

The reasoning behind that split is in [ARCHITECTURE.md](ARCHITECTURE.md#layering).

## CI

Two GitHub Actions workflows:

- **`ci.yml`** runs on every push to `main` and on pull requests: `npm ci`,
  `npm run typecheck`, `npm run build`. That is the gate; a type error fails the
  build.
- **`docker.yml`** builds the image, and on `main` and `v*` tags pushes it to
  GHCR. Pull requests build the image but don't push.

No test runner is wired up yet. Typecheck plus a clean build is the current bar.
The obvious next gate is a unit-test job for the pure pieces (`utils/joinBase`,
the manifest generator), which are written to be testable without a browser.
