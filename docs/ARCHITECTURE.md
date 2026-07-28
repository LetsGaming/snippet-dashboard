# Architecture

How the wrapper is put together, and why. The "why" is the point: it keeps
changes consistent with the design instead of fighting it.

## Goal

One entry point that hosts many small standalone tools ("snippets"). Three hard
requirements shaped every decision:

- **Independence.** A snippet must be changeable, removable, or addable without
  affecting any other snippet.
- **Trivial to add.** Dropping a folder in should be enough.
- **Minimal wrapper dependencies.** The shell stays lean. Snippets carry their
  own weight.

## Why iframes

Snippets are arbitrary HTML documents with their own `<style>` and `<script>`.
The only browser primitive that isolates all three axes at once (DOM, CSS scope,
JavaScript globals) is the iframe. Shadow DOM scopes CSS and DOM but shares the
JS global scope, and it won't execute a `<script>` injected via markup. Inlining
snippet markup into the Vue tree would let styles and globals collide. So each
snippet loads as its own document in an iframe.

The iframe is keyed by snippet id (`:key="snippet.id"`). Switching snippets
destroys the old iframe and creates a fresh one, so no state, timer, or listener
from one snippet survives into the next.

## Why public/snippets/

Files in `public/` are served verbatim and copied to the build output untouched
by the bundler. That is what a self-contained snippet needs: its `index.html`,
plus any sibling assets it references, ship as-is at a predictable URL
(`<base>/snippets/<id>/index.html`). Snippets sit completely outside the Vue
build pipeline.

The trade-off: `public/` is invisible to `import.meta.glob`, so the app can't
discover snippets at build time by globbing. The manifest solves that.

## The manifest

`scripts/generate-manifest.mjs` (zero dependencies, Node built-ins only) scans
`public/snippets/`, treats every folder containing `index.html` as a snippet,
reads an optional `meta.json`, and writes `public/snippets/manifest.json`. It
runs automatically before `dev` and `build` via npm's `pre*` hooks, and on its
own via `npm run snippets:manifest`.

The manifest is generated and git-ignored, so it never gets hand-edited and never
drifts from the folders on disk. The app fetches it at runtime, which means a
deployed instance can gain a snippet by adding a folder and regenerating the
manifest, no rebuild of the Vue app required.

Folders starting with `_` or `.` are skipped. That is how `_template` works as a
copy-me starter without showing up in the UI.

### Snippet contract

A snippet folder needs an `index.html` (the standalone entry document) and may
carry an optional `meta.json` plus any sibling assets it references. The manifest
entry adds a derived `id` (the folder name) and `entry`
(`snippets/<id>/index.html`). The `meta.json` fields and their defaults are in
[SNIPPETS.md](SNIPPETS.md).

## Layering

The wrapper follows a container -> composable -> service -> util split so logic
is testable without mounting components:

```
App.vue            container/view: wires composables, picks the active snippet
  TheSidebar       presentational: props in, `select` event out
  SnippetFrame     presentational: renders the sandboxed iframe
  AppEmptyState    presentational: loading / error / not-found / welcome
useSnippets        reactive registry state (data + loading + error)
useHashRoute       reactive current id from the URL hash, with listener teardown
snippetService     the only module that calls fetch
utils/joinBase     pure URL joining, unit-testable without a browser
```

Components never fetch and hold no business logic. `fetch` lives only in the
service. Routing is a composable, not a dependency.

## Navigation without a router

The selected id lives in the URL hash as `#/<id>`. `useHashRoute` reads it,
listens for `hashchange`, and exposes `navigate(id)`. That gives deep-linkable,
bookmarkable snippet URLs and working back/forward behaviour with no router
dependency, which fits a flat single-level dashboard. Add nested routes or real
paths later and this is the piece to replace.

## Sandboxing

The iframe `sandbox` is a per-snippet, overridable allow-list. The default
(`config.ts` -> `DEFAULT_SNIPPET_SANDBOX`) is permissive enough for a first-party
standalone page to run its scripts, forms, and popups, while staying an explicit,
auditable set. A snippet that needs a different privilege set declares `sandbox`
in its `meta.json`. Because snippets are first-party, the default favours "works
out of the box"; tighten it per snippet where a snippet takes untrusted input.
The exact tokens are in [DEVELOPMENT.md](DEVELOPMENT.md) under Configuration.

## Theming

`tokens.css` defines colours, spacing, radii, and typography as CSS custom
properties, with a dark set under `prefers-color-scheme: dark`. Wrapper
components reference tokens only, never hardcoded values. Snippets are isolated
documents, so they bring their own styling and their own dark-mode handling and
do not inherit the wrapper's tokens. That is deliberate: inheriting them would
couple a snippet to the shell.

## The editor and the two layers

Snippets are files, so editing one is a file operation. The editor is a thin UI
over that, not a separate storage system. It behaves differently in dev and in
the static build, and understanding why is the subtle part of the design.

**In development,** `scripts/vite-plugin-snippets.mjs` (a Vite plugin with
`apply: 'serve'`, so it never touches the production build) adds middleware on
`/__api/snippets/:id`:

- `GET` returns `{ id, html, meta }` for editing,
- `PUT` writes `index.html` + `meta.json` and regenerates the manifest,
- `DELETE` removes the folder and regenerates the manifest.

It reuses `generateManifest()` from the manifest script, so there is exactly one
implementation of "scan folders -> manifest". Ids are validated server-side
against `^[a-z0-9][a-z0-9-]*$`, which keeps them URL-safe and blocks path
traversal out of `public/snippets/`.

**In the static build** there is no writable backend. Rather than add one,
snippets live in two independent layers that merge at load time:

- **Bundled snippets** ship in the build (`public/snippets/` -> `dist/`) and are
  listed in `manifest.json`. They render through an iframe `src`. Updating them
  means redeploying.
- **User snippets** live in the browser (`localStorage`, `snippetStore.ts`),
  keyed by id. They render through an iframe `srcdoc` (the stored HTML string).

`useSnippets` merges them into one list. A user snippet with the same id as a
bundled one overrides it (deterministic precedence, user wins) and is flagged so
it can be reset; deleting the local copy reveals the bundled version again.

### Why updates never cause merge problems

The two layers never share storage. A deployment writes files and never reads or
writes the visitor's `localStorage`. So an update can freely add, change, or
remove bundled snippets with no way to conflict with user snippets, because there
is nothing to merge. The only overlap, a shared id, is resolved by precedence
rather than a three-way merge, and is always reversible.

To move a browser-only snippet into the repo on purpose, the editor's
"Herunterladen" exports its HTML; drop it into `public/snippets/<id>/` and it
becomes a bundled snippet on the next build.

### One editor, two backends

`snippetRepository.ts` presents a single `read/save/remove` interface and picks
its backend from `EDITOR_BACKEND` (`import.meta.env.DEV`): the dev-server API in
development (real files), browser storage in production. The UI is identical in
both; only where the bytes land differs. The local backend's `read` falls back to
fetching the shipped file, so a bundled snippet can be opened and edited into an
override even though it isn't in storage yet.

The live preview and saved user snippets both render with a tighter default
sandbox (`allow-scripts`, opaque origin) so snippet code cannot read the app's own
storage, where user snippets are kept.

## What this deliberately is not

- Not a plugin system. Snippets don't register JS with the host.
- Not a micro-frontend framework. No shared runtime, no cross-snippet imports.
- Not a snippet build tool. Snippets are static files; if one needs a build,
  build it elsewhere and drop the output in.

Keeping those out is what keeps snippets independent and the wrapper small.
