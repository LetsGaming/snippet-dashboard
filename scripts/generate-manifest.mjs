/**
 * Scans `public/snippets/<id>/` for snippet folders and writes `manifest.json`.
 *
 * A folder is a snippet when it contains `index.html`. Folders starting with
 * `.` or `_` are ignored (e.g. `_template`). Optional `meta.json` per folder
 * overrides title / description / tags / order / sandbox.
 *
 * Zero dependencies. Exported as `generateManifest()` (used by the dev-server
 * plugin) and runnable directly (used by predev / prebuild).
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SNIPPETS_DIR = join(HERE, '..', 'public', 'snippets')
const MANIFEST_PATH = join(SNIPPETS_DIR, 'manifest.json')
const ENTRY_FILE = 'index.html'
const META_FILE = 'meta.json'
const DEFAULT_ORDER = 100

const titleFromId = (id) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readMeta(dir) {
  const metaPath = join(dir, META_FILE)
  if (!(await exists(metaPath))) return {}
  try {
    return JSON.parse(await readFile(metaPath, 'utf8'))
  } catch (err) {
    console.warn(`[manifest] Invalid ${META_FILE} in "${dir}" ignored: ${err.message}`)
    return {}
  }
}

/** Build the manifest from disk and write it. Returns the manifest object. */
export async function generateManifest({ silent = false } = {}) {
  const entries = await readdir(SNIPPETS_DIR, { withFileTypes: true }).catch(() => [])
  const snippets = []

  for (const entry of entries) {
    const id = entry.name
    if (!entry.isDirectory() || id.startsWith('.') || id.startsWith('_')) continue

    const dir = join(SNIPPETS_DIR, id)
    if (!(await exists(join(dir, ENTRY_FILE)))) {
      if (!silent) console.warn(`[manifest] Skipping "${id}": no ${ENTRY_FILE}`)
      continue
    }

    const meta = await readMeta(dir)
    snippets.push({
      id,
      title: typeof meta.title === 'string' ? meta.title : titleFromId(id),
      description: typeof meta.description === 'string' ? meta.description : '',
      tags: Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === 'string') : [],
      entry: `snippets/${id}/${ENTRY_FILE}`,
      sandbox: typeof meta.sandbox === 'string' ? meta.sandbox : null,
      order: Number.isFinite(meta.order) ? meta.order : DEFAULT_ORDER,
    })
  }

  snippets.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

  const manifest = { generatedAt: new Date().toISOString(), count: snippets.length, snippets }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  if (!silent) console.log(`[manifest] Wrote ${snippets.length} snippet(s) → ${MANIFEST_PATH}`)
  return manifest
}

// Run when invoked directly (`node scripts/generate-manifest.mjs`).
const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (invokedDirectly) {
  generateManifest().catch((err) => {
    console.error('[manifest] Failed:', err)
    process.exit(1)
  })
}
