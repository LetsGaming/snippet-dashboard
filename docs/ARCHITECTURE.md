# Architecture

This document explains how the wrapper is put together and, more importantly,
*why* — so that changes stay consistent with the design.

## Goal

One entry point that hosts many small, standalone tools ("snippets"). The hard
requirements shaped every decision:

- **Independence.** A snippet must be changeable, removable, or addable without
  affecting any other snippet.
- **Trivial to add.** Dropping a folder in should be enough.
- **Minimal wrapper dependencies.** The shell stays lean; snippets may carry
  their own weight.

## Why iframes

Snippets are arbitrary HTML documents with their own `<style>` and `<script>`.
The only browser primitive that isolates all three axes — DOM, CSS scope, and
JavaScript globals — is the `<iframe>`. Shadow DOM scopes CSS and DOM but shares
the JS global scope and won't execute `<script>` injected via markup; inlining
snippet markup into the Vue tree would let styles and globals collide. So each
snippet is loaded as its own document in an iframe.

The iframe is **keyed by snippet id** (`:key="snippet.id"`). Switching snippets
destroys the previous iframe and creates a fresh one, so no state, timer, or
listener from one snippet can survive into another.

## Why `public/snippets/`

Files in `public/` are served verbatim and copied to the build output untouched
by the bundler. That is exactly what a self-contained snippet wants: its
`index.html`, and any sibling assets or dependencies it references, ship as-is
at a predictable URL (`<base>/snippets/<id>/index.html`). Snippets are therefore
completely outside the Vue build pipeline — the strongest possible form of
independence.

The trade-off: `public/` is not visible to `import.meta.glob`, so the app can't
discover snippets at build time by globbing. That is what the manifest solves.

## The manifest

`scripts/generate-manifest.mjs` (zero dependencies, Node built-ins only) scans
`public/snippets/`, treats every folder containing `index.html` as a snippet,
reads an optional `meta.json`, and writes `public/snippets/manifest.json`. It
runs automatically before `dev` and `build` via npm's `pre*` hooks, and can be
run on its own with `npm run snippets:manifest`.

Because the manifest is generated (and git-ignored), it is never hand-edited and
never drifts from the folders on disk. The app fetches it at runtime, which also
means a deployed instance can gain a snippet by uploading a folder and
regenerating the manifest — no rebuild of the Vue app required.

Folders starting with `_` or `.` are skipped, which is how `_template` serves as
a copy-me starter without appearing in the UI.

### Snippet contract

A snippet folder:

```
public/snippets/<id>/
  index.html        (required) the standalone entry document
  meta.json         (optional) metadata; see below
  ...                (optional) any sibling assets the snippet references
```

`meta.json` fields, all optional:

| Field         | Type       | Default                    | Meaning                                   |
| ------------- | ---------- | -------------------------- | ----------------------------------------- |
| `title`       | string     | title-cased folder name    | Sidebar label                             |
| `description` | string     | `""`                       | Sidebar subtitle                          |
| `tags`        | string[]   | `[]`                       | Free-form labels (reserved for filtering) |
| `order`       | number     | `100`                      | Ascending sort weight                     |
| `sandbox`     | string     | app default (see below)    | Overrides the iframe `sandbox` attribute  |

The manifest entry adds a derived `id` (folder name) and `entry`
(`snippets/<id>/index.html`).

## Layering

The wrapper follows a standard container → composable → service → util split so
that logic is testable without mounting components:

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

Components never fetch and hold no business logic; `fetch` lives solely in the
service; routing is a composable rather than a dependency.

## Navigation without a router

The selected snippet id is stored in the URL hash as `#/<id>`. `useHashRoute`
reads it, listens for `hashchange`, and exposes `navigate(id)`. This yields
deep-linkable, bookmarkable snippet URLs and working back/forward behaviour with
no router dependency — appropriate for a flat, single-level dashboard.

## Sandboxing

The iframe `sandbox` is a per-snippet, overridable allow-list. The default
(`config.ts` → `DEFAULT_SNIPPET_SANDBOX`) is permissive enough for a first-party
standalone page to run its scripts, forms, and popups, while remaining an
explicit, auditable set. A snippet that needs a different privilege set declares
`sandbox` in its `meta.json`. Because snippets are first-party, the default
favours "works out of the box"; tighten it per snippet where a snippet handles
untrusted input.

## Theming

`tokens.css` defines colours, spacing, radii, and typography as CSS custom
properties, with a dark set under `prefers-color-scheme: dark`. Wrapper
components reference tokens only — no hardcoded values. Snippets, being isolated
documents, carry their own styling and their own dark-mode handling; they do not
inherit the wrapper's tokens (nor should they, to stay independent).

## The editor (dev only)

Because snippets are files, editing them is a file operation — so the editor is
a thin UI over a small dev-server API, not a separate storage system.

- `scripts/vite-plugin-snippets.mjs` is a Vite plugin with `apply: 'serve'`
  (dev only). It adds middleware on `/__api/snippets/:id`:
  - `GET` returns `{ id, html, meta }` for editing,
  - `PUT` writes `index.html` + `meta.json` and regenerates the manifest,
  - `DELETE` removes the folder and regenerates the manifest.
- It reuses `generateManifest()` from the manifest script, so there is exactly
  one implementation of "scan folders → manifest".
- `SnippetEditor.vue` is the form: metadata fields, an `index.html` textarea,
  and a debounced live `srcdoc` preview in a sandboxed iframe. It talks to the
  API through `editorService` (wrapped by `useSnippetEditor` for reactive
  busy/error state) — the component itself never calls `fetch`.
- Ids are validated server-side against `^[a-z0-9][a-z0-9-]*$`, which keeps them
  URL-safe and blocks path traversal out of `public/snippets/`.

The editor is deliberately dev-only: it writes source files that become part of
the repository and the next build. The production bundle is static and ships no
writable endpoint. `EDITOR_ENABLED` (`import.meta.env.DEV`) gates the UI so the
sidebar controls and editor routes only appear where the API exists.

Preview note: the live preview sandboxes with `allow-scripts` only (opaque
origin), so an in-progress snippet can run its JavaScript without same-origin
access. Saved snippets render through `SnippetFrame` with the normal, more
permissive default sandbox.

## Two layers: bundled vs. user snippets

The editor writes files in development, but a production build is static and has
no writable backend. Rather than add one, snippets exist in two independent
layers that are merged at load time:

- **Bundled snippets** ship in the build (`public/snippets/` → `dist/`) and are
  listed in `manifest.json`. They render through an iframe `src`. Updating the
  app means redeploying these files.
- **User snippets** live in the browser (`localStorage`, `snippetStore.ts`),
  keyed by id. They render through an iframe `srcdoc` (the stored HTML string).

`useSnippets` merges them into one list; a user snippet with the same id as a
bundled one overrides it (deterministic precedence), and is flagged so it can be
reset — deleting the local copy simply reveals the bundled version again.

### Why updates never cause merge problems

The two layers never share storage. A deployment writes files; it never reads or
writes the visitor's `localStorage`. So an update can freely add, change, or
remove bundled snippets with no possibility of conflicting with user snippets —
there is nothing to merge. The only interaction, a shared id, is resolved by
precedence (user wins) rather than a three-way merge, and is always reversible.

To move a browser-only snippet into the repository deliberately, the editor's
**Herunterladen** exports its HTML; drop it into `public/snippets/<id>/` and it
becomes a bundled snippet on the next build.

### One editor, two backends

`snippetRepository.ts` presents a single `read/save/remove` interface and picks
the backend from `EDITOR_BACKEND` (`import.meta.env.DEV`): the dev-server API in
development (real files), browser storage in production. The editor UI is
identical in both; only where bytes land differs. The local backend's `read`
falls back to fetching the shipped file, so a bundled snippet can be opened and
edited into an override even though it isn't in storage yet.

Security note: user snippets render with a tighter default sandbox
(`allow-scripts`, opaque origin) so their code cannot read the app's own storage
where snippets are kept.

## What this deliberately is not

- Not a plugin system — snippets don't register JS with the host.
- Not a micro-frontend framework — no shared runtime, no cross-snippet imports.
- Not a snippet build tool — snippets are static files; if one needs a build,
  build it elsewhere and drop the output in.

Keeping those out is what keeps snippets independent and the wrapper small.
