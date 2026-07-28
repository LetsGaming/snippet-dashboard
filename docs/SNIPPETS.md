# Writing snippets

A snippet is a standalone HTML page that the dashboard lists and loads in a
sandboxed iframe. It has no contract with the wrapper beyond "be a folder with an
`index.html`". No imports, no build step, no framework. Whatever runs in a plain
browser tab runs here.

## The folder

```
public/snippets/<id>/
  index.html    required. the standalone entry document.
  meta.json     optional. sidebar label, sort order, sandbox. see below.
  ...           optional. any sibling files index.html references
                (css, images, a vendored script), served next to it.
```

The folder name is the id. It shows up in the URL hash (`#/<id>`) and as the key
in the manifest, so keep it lowercase and URL-safe: `^[a-z0-9][a-z0-9-]*$`
(letters, digits, hyphens, starting with a letter or digit). The editor enforces
that pattern. By hand nothing stops you, but a folder like `My Snippet!` makes a
broken URL.

Folders that start with `_` or `.` are skipped by the generator. That is why
`_template` ships as a starter without appearing in the sidebar.

## meta.json

Every field is optional. Drop the file entirely and the snippet still works on
the defaults below.

| Field         | Type       | Default                 | What it does                              |
| ------------- | ---------- | ----------------------- | ----------------------------------------- |
| `title`       | string     | title-cased folder name | Sidebar label                             |
| `description` | string     | `""`                    | Sidebar subtitle                          |
| `tags`        | string[]   | `[]`                    | Free-form labels (reserved for filtering) |
| `order`       | number     | `100`                   | Sort weight, ascending                    |
| `sandbox`     | string     | app default (see below) | Overrides the iframe `sandbox` attribute  |

The sidebar sorts by `order` ascending, then by title. Give the snippets you want
near the top a low `order` (the R34 calculator uses `10`, the distro quiz `1`) and
leave the rest at the default `100`.

An invalid `meta.json` is not fatal: the generator prints a warning and treats the
snippet as if the file were absent, so a typo can't break the build.

## The editor

Run `npm run dev` and the sidebar grows a "+ Neues Snippet" button and a "✎" on
each snippet.

- **+ Neues Snippet** opens an empty editor. Type an id and metadata, write the
  HTML, watch the live preview update as you type, save.
- **✎** opens an existing snippet for editing, and can delete it.

Where a save lands depends on where you run it, and this is the one thing worth
being clear about:

- **In dev,** the editor writes real files under `public/snippets/<id>/` through a
  dev-only API and regenerates the manifest. The result is on disk and
  commit-ready, the same outcome as editing the files by hand.
- **In the static build,** there is no backend to write to, so the editor saves to
  this browser's `localStorage` instead. Those snippets are per-device: they live
  only in the browser that made them, and a redeploy never touches them.

If a browser snippet uses the same id as a bundled one, the browser copy wins and
is flagged as an override in the sidebar and editor. "Reset" deletes the local
copy and the bundled version reappears. Nothing is lost either way.

To turn a browser snippet into a committed one, open it and hit **Herunterladen**.
That exports its HTML. Drop it into `public/snippets/<id>/`, add a `meta.json` if
you want, and it becomes a bundled snippet on the next build.

## Sandboxing

Every snippet runs under an iframe `sandbox` allow-list. There are two defaults,
depending on how the snippet is loaded:

- **Bundled snippets** (files under `public/snippets/`, loaded via iframe `src`)
  default to `allow-scripts allow-same-origin allow-forms allow-popups
  allow-modals allow-downloads`. That is enough for a normal first-party page.
- **Browser snippets** (saved in `localStorage`, loaded via iframe `srcdoc`) and
  the live editor preview default to `allow-scripts` only, which gives them an
  opaque origin. They can run their code but cannot reach the app's own storage.

Set `sandbox` in `meta.json` to replace the default for one snippet. It is a full
replace, not a merge, so list every token you need:

```json
{
  "title": "Locked-down viewer",
  "sandbox": "allow-scripts"
}
```

`allow-downloads` is the one that bites quietly. Without it a snippet can build a
blob URL, set `download` on an anchor and click it, and the browser will refuse
without raising anything the page can catch — it only logs to the console. If a
snippet of yours offers a file and nothing arrives, check the sandbox before you
debug the snippet.

One thing to keep in mind: adding `allow-same-origin` to a `srcdoc` snippet (a
browser snippet, or any snippet you set that way) puts it on the app's own origin,
where it could read the storage the other browser snippets live in. Only widen the
sandbox for snippets you wrote and trust, and tighten it for anything that handles
input you didn't.

## Dark mode and styling

Snippets are isolated documents, so they do not inherit the wrapper's theme tokens
(by design, see [ARCHITECTURE.md](ARCHITECTURE.md#theming)). Each snippet brings
its own styles and its own dark-mode handling. The pattern the template uses:

```css
:root {
  color-scheme: light dark;
  --bg: #faf9f6;
  --fg: #1c1b19;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #17171a; --fg: #f2f1ee; }
}
```

`color-scheme: light dark` lets form controls and scrollbars follow the OS theme;
the media query handles your own colours. Copy `_template/index.html` for a
working starting point.

## Dependencies

A snippet may pull in whatever it needs the plain-HTML way: an inline `<script>`,
a vendored file sitting next to `index.html`, or a `<script src>` from a CDN. The
wrapper processes none of it and imposes no framework. If a snippet needs a real
build (a bundler, a compile step), build it somewhere else and drop the output
into its folder as static files.

The iframe loads with `referrerpolicy="no-referrer"`, so requests a snippet makes
don't leak the dashboard URL.

## A minimal snippet

```
public/snippets/coin-flip/
  index.html
  meta.json
```

`index.html`:

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Coin Flip</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      button { font: inherit; padding: .6rem 1.1rem; }
    </style>
  </head>
  <body>
    <main>
      <output id="r">?</output>
      <button onclick="r.textContent = Math.random() < .5 ? 'Kopf' : 'Zahl'">Werfen</button>
    </main>
  </body>
</html>
```

`meta.json`:

```json
{
  "title": "Coin Flip",
  "description": "Kopf oder Zahl.",
  "order": 50
}
```

Run `npm run snippets:manifest` (or just `npm run dev`) and it shows up in the
sidebar.
