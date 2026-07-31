/** Shared, app-wide constants. One source — imported, never re-derived. */

export const APP_TITLE = 'Snippet Dashboard'

/* The iframe sandbox policy lives in services/sandboxPolicy.ts — defaults, the
   user-snippet allow-list and the resolution belong together. */

/** Location of the generated manifest, relative to the app base URL. */
export const MANIFEST_PATH = 'snippets/manifest.json'

/** Default sort weight for snippets without an explicit `order`. */
export const DEFAULT_SNIPPET_ORDER = 100

/**
 * The editor is available in every environment. Persistence differs by backend:
 * `api` writes real files via the dev server; `local` writes to this browser's
 * storage (used in the static production build, where there is no backend).
 */
export const EDITOR_ENABLED = true
export const EDITOR_BACKEND: 'api' | 'local' = import.meta.env.DEV ? 'api' : 'local'

/** Starting HTML offered when creating a new snippet. */
export const NEW_SNIPPET_HTML = `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Neues Snippet</title>
    <style>
      :root { color-scheme: light dark; --accent: #534ab7; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Hallo 👋</h1>
      <p>Dein Snippet-Code kommt hier rein.</p>
    </main>
  </body>
</html>
`
