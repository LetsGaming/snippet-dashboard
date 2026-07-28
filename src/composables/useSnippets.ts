import { ref } from 'vue'
import { DEFAULT_SNIPPET_ORDER } from '@/config'
import { fetchManifest } from '@/services/snippetService'
import { listUserSnippets } from '@/services/snippetStore'
import type { ManifestSnippet, Snippet, SnippetMeta } from '@/types/snippet'

function fromBundled(entry: ManifestSnippet): Snippet {
  return { ...entry, source: 'bundled', srcdoc: null, isOverride: false }
}

function fromUser(id: string, html: string, meta: SnippetMeta, isOverride: boolean): Snippet {
  return {
    id,
    title: meta.title?.trim() || id,
    description: meta.description ?? '',
    tags: meta.tags ?? [],
    entry: '',
    sandbox: meta.sandbox ?? null,
    order: typeof meta.order === 'number' ? meta.order : DEFAULT_SNIPPET_ORDER,
    source: 'user',
    srcdoc: html,
    isOverride,
  }
}

/**
 * Reactive registry: bundled snippets from the manifest merged with the user's
 * browser-stored snippets. A user snippet with the same id overrides the
 * bundled one (deterministic precedence — no merge).
 */
export function useSnippets() {
  const snippets = ref<Snippet[]>([])
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  async function load(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const manifest = await fetchManifest()
      const merged = new Map<string, Snippet>()
      const bundledIds = new Set<string>()

      for (const entry of manifest.snippets) {
        merged.set(entry.id, fromBundled(entry))
        bundledIds.add(entry.id)
      }
      for (const [id, stored] of Object.entries(listUserSnippets())) {
        merged.set(id, fromUser(id, stored.html, stored.meta, bundledIds.has(id)))
      }

      snippets.value = [...merged.values()].sort(
        (a, b) => a.order - b.order || a.title.localeCompare(b.title),
      )
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      snippets.value = []
    } finally {
      isLoading.value = false
    }
  }

  return { snippets, isLoading, error, load }
}
