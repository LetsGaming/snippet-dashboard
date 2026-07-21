import { ref } from 'vue'
import { getRepository } from '@/services/snippetRepository'
import type { SnippetMeta } from '@/types/snippet'

/** Reactive wrapper around the active editor repository (dev API or browser store). */
export function useSnippetEditor() {
  const repository = getRepository()
  const isBusy = ref(false)
  const error = ref<Error | null>(null)

  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    isBusy.value = true
    error.value = null
    try {
      return await operation()
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      return undefined
    } finally {
      isBusy.value = false
    }
  }

  return {
    isBusy,
    error,
    load: (id: string) => run(() => repository.read(id)),
    save: (id: string, html: string, meta: SnippetMeta) => run(() => repository.save(id, html, meta)),
    remove: (id: string) => run(() => repository.remove(id)),
  }
}
