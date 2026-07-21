import type { SnippetMeta } from '@/types/snippet'

/**
 * Per-browser persistence for user-created snippets. This is the second,
 * independent layer beside the bundled (file-based) snippets: a deployment
 * never touches it, so app updates can never conflict with user snippets.
 */
const STORAGE_KEY = 'snippet-dashboard:user-snippets:v1'

export interface StoredSnippet {
  html: string
  meta: SnippetMeta
  updatedAt: string
}

type Store = Record<string, StoredSnippet>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listUserSnippets(): Store {
  return readStore()
}

export function readUserSnippet(id: string): StoredSnippet | null {
  return readStore()[id] ?? null
}

export function writeUserSnippet(id: string, html: string, meta: SnippetMeta): void {
  const store = readStore()
  store[id] = { html, meta, updatedAt: new Date().toISOString() }
  writeStore(store)
}

export function deleteUserSnippet(id: string): void {
  const store = readStore()
  delete store[id]
  writeStore(store)
}
