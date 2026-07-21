import type { SnippetMeta, SnippetSource } from '@/types/snippet'

// Absolute path matched by the dev-server middleware (dev base is `/`).
const API = '/__api/snippets/'

export async function readSnippetSource(id: string): Promise<SnippetSource> {
  const response = await fetch(`${API}${encodeURIComponent(id)}`)
  if (!response.ok) {
    throw new Error(`Snippet „${id}“ konnte nicht geladen werden (${response.status}).`)
  }
  return (await response.json()) as SnippetSource
}

export async function saveSnippet(id: string, html: string, meta: SnippetMeta): Promise<void> {
  const response = await fetch(`${API}${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, meta }),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.error ?? `Speichern fehlgeschlagen (${response.status}).`)
  }
}

export async function deleteSnippet(id: string): Promise<void> {
  const response = await fetch(`${API}${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`Löschen fehlgeschlagen (${response.status}).`)
  }
}
