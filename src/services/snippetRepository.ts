import { EDITOR_BACKEND } from '@/config'
import * as api from '@/services/editorService'
import * as store from '@/services/snippetStore'
import type { SnippetMeta, SnippetSource } from '@/types/snippet'
import { joinBase } from '@/utils/url'

/** What the editor needs from a persistence backend. */
export interface SnippetRepository {
  read(id: string): Promise<SnippetSource>
  save(id: string, html: string, meta: SnippetMeta): Promise<void>
  remove(id: string): Promise<void>
}

/** Dev: read/write real files through the dev-server API. */
const apiRepository: SnippetRepository = {
  read: api.readSnippetSource,
  save: api.saveSnippet,
  remove: api.deleteSnippet,
}

/** Prod: read/write this browser's storage; fall back to the bundled file. */
const localRepository: SnippetRepository = {
  async read(id) {
    const stored = store.readUserSnippet(id)
    if (stored) return { id, html: stored.html, meta: stored.meta }

    // No local copy yet — load the shipped source so it can be edited into an
    // override (used when the ✎ is clicked on a bundled snippet in production).
    const base = import.meta.env.BASE_URL
    const htmlResponse = await fetch(joinBase(base, `snippets/${id}/index.html`))
    if (!htmlResponse.ok) throw new Error(`Snippet „${id}“ nicht gefunden.`)
    const html = await htmlResponse.text()

    let meta: SnippetMeta = {}
    try {
      const metaResponse = await fetch(joinBase(base, `snippets/${id}/meta.json`))
      if (metaResponse.ok) meta = (await metaResponse.json()) as SnippetMeta
    } catch {
      meta = {}
    }
    return { id, html, meta }
  },
  async save(id, html, meta) {
    store.writeUserSnippet(id, html, meta)
  },
  async remove(id) {
    store.deleteUserSnippet(id)
  },
}

export function getRepository(): SnippetRepository {
  return EDITOR_BACKEND === 'local' ? localRepository : apiRepository
}
