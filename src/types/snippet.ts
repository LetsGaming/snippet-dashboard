/** A snippet entry as emitted into `manifest.json` (bundled snippets). */
export interface ManifestSnippet {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly tags: readonly string[]
  /** Path to the entry document, relative to the app base URL. */
  readonly entry: string
  readonly sandbox: string | null
  readonly order: number
}

/** Shape of the generated `manifest.json`. */
export interface SnippetManifest {
  readonly generatedAt: string
  readonly count: number
  readonly snippets: readonly ManifestSnippet[]
}

/** Where a merged snippet comes from. */
export type SnippetOrigin = 'bundled' | 'user'

/**
 * A snippet in the merged runtime registry. Adds the origin and, for user
 * snippets, the inline HTML rendered via `srcdoc` (bundled ones load `entry`).
 */
export interface Snippet extends ManifestSnippet {
  readonly source: SnippetOrigin
  /** Inline HTML for user snippets; `null` for bundled (rendered via `entry`). */
  readonly srcdoc: string | null
  /** A user snippet shadowing a bundled id (local override). */
  readonly isOverride: boolean
}

/** Editable `meta.json` contents. All fields optional. */
export interface SnippetMeta {
  title?: string
  description?: string
  tags?: string[]
  order?: number
  sandbox?: string
}

/** A snippet's raw source, as read/written by the editor. */
export interface SnippetSource {
  readonly id: string
  readonly html: string
  readonly meta: SnippetMeta
}
