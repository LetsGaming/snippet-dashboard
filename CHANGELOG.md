# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-21

### Added
- **Editor works in production without a backend.** User-created and edited
  snippets are persisted in the browser (localStorage) as a second layer beside
  the bundled, file-based snippets.
- Merged registry: bundled snippets (from the manifest, rendered via iframe
  `src`) and user snippets (from the store, rendered via iframe `srcdoc`) are
  combined into one list.
- Deterministic override: a user snippet with the same id as a bundled one wins,
  is flagged in the sidebar and editor, and can be reset to the shipped version.
- Editor repository abstraction (`snippetRepository`): dev writes files through
  the dev-server API; production writes browser storage — transparent to the UI.
- "Herunterladen" in the editor exports a snippet's HTML, so a browser-only
  snippet can be deliberately promoted into `public/snippets/` and committed.
- Tighter default sandbox for user (`srcdoc`) snippets: `allow-scripts` only,
  so snippet code cannot reach the app's own storage.

### Notes
- No merge problems on update by design: bundled snippets live in the build,
  user snippets live in the browser; a deployment never touches browser storage,
  so the two layers cannot conflict. Same-id collisions resolve by precedence,
  not merge.

## [0.2.0] - 2026-07-21

### Added
- **In-app snippet editor (dev only).** Create, edit, and delete snippets from
  the UI, with a live `srcdoc` preview beside the code.
- Dev-server file API via a Vite plugin (`scripts/vite-plugin-snippets.mjs`):
  `GET/PUT/DELETE /__api/snippets/:id` write real files under
  `public/snippets/` and regenerate the manifest on every change.
- `generate-manifest.mjs` now also exports `generateManifest()` so the dev
  plugin and the CLI share one implementation.
- Sidebar gains a "+ Neues Snippet" action and a per-item edit control (shown
  only when the editor is enabled).
- Editor routes in the URL hash: `#/new` and `#/edit/<id>`.

### Notes
- The editor is available only under `vite dev`; the production build is static
  and has no writable backend. Snippet ids are validated (`^[a-z0-9][a-z0-9-]*$`)
  to prevent path traversal.

## [0.1.0] - 2026-07-21

### Added
- Vue 3 + Vite + TypeScript wrapper shell that lists and renders HTML snippets.
- iframe-based isolation: every snippet runs in its own document; switching
  snippets tears the previous one down (keyed iframe).
- Auto-generated snippet manifest via `scripts/generate-manifest.mjs`, run
  automatically on `predev` / `prebuild`.
- Optional per-snippet `meta.json` (title, description, tags, order, sandbox).
- Hash-based navigation with deep-linkable snippet URLs (`#/<id>`) — no router
  dependency.
- Design-token theming (`tokens.css`) with light/dark support.
- Configurable, per-snippet-overridable iframe `sandbox`.
- Self-hosted SVG favicon.
- First snippet: `r34-rechner` — the R34 GT-T planning calculator.
- `_template` starter snippet.
- README, architecture documentation, and this changelog.
