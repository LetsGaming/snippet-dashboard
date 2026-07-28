import { MANIFEST_PATH } from '@/config'
import type { SnippetManifest } from '@/types/snippet'
import { joinBase } from '@/utils/url'

/**
 * Fetches the snippet manifest. This is the single boundary to the outside
 * world; components and composables never call `fetch` directly.
 */
export async function fetchManifest(signal?: AbortSignal): Promise<SnippetManifest> {
  const url = joinBase(import.meta.env.BASE_URL, MANIFEST_PATH)
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as SnippetManifest
}
