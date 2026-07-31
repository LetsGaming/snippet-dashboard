import type { SnippetOrigin } from '@/types/snippet'

/**
 * The iframe sandbox policy. Defaults, the user-snippet allow-list and the resolution
 * live together on purpose: split across a config file and a component computed, the
 * rule was easy to bypass and hard to see.
 *
 * Free of runtime imports so it can be unit-tested without Vite or a browser (the type
 * import is erased at runtime).
 */

/**
 * Default sandbox for bundled snippets without their own override.
 *
 * `allow-downloads` is what lets a snippet hand a file to the user. Without it the
 * browser drops the download and only logs to the console — the click looks like it
 * worked and nothing happens. Bundled snippets are first-party files from this repo,
 * so the token costs nothing here.
 */
export const DEFAULT_SNIPPET_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads'

/**
 * Tighter default for user snippets rendered via `srcdoc`: `allow-scripts` alone
 * gives them an opaque origin, so snippet code can run but cannot reach the app's
 * own storage (where user snippets and their metadata live).
 */
export const USER_SNIPPET_SANDBOX = 'allow-scripts'

/**
 * What a *user* snippet may ask for via `meta.sandbox`.
 *
 * A user snippet is pasted-in code kept in the same browser storage the app uses. A
 * free-form override let it ask for `allow-same-origin` and thereby read that storage —
 * every saved plan and every other snippet — which is exactly what the tighter default
 * above exists to prevent. Bundled snippets are first-party files and keep their
 * override unfiltered.
 *
 * Deliberately absent: `allow-same-origin` (see above), `allow-downloads` (pasted-in
 * code should not push files at the user), `allow-popups-to-escape-sandbox` and
 * `allow-top-navigation*` (both hand control to a document outside the sandbox).
 */
export const USER_SANDBOX_TOKENS: ReadonlySet<string> = new Set([
  'allow-scripts',
  'allow-forms',
  'allow-modals',
  'allow-popups',
  'allow-pointer-lock',
])

/**
 * The sandbox an iframe actually gets. Resolved once, where snippets enter the
 * registry, so no view can render a snippet with an unresolved allow-list.
 *
 * For user snippets an override is intersected with the allow-list above; tokens
 * outside it are dropped rather than the whole override being rejected, so a snippet
 * asking for one forbidden token still runs.
 */
export function resolveSandbox(source: SnippetOrigin, requested: string | null): string {
  if (source !== 'user') return requested ?? DEFAULT_SNIPPET_SANDBOX
  if (requested === null) return USER_SNIPPET_SANDBOX
  const granted = requested
    .split(/\s+/)
    .filter((token) => USER_SANDBOX_TOKENS.has(token))
  return [...new Set(granted)].join(' ')
}
