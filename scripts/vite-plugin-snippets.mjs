/**
 * Dev-only Vite plugin exposing a tiny file API so the in-app editor can
 * create, read, update and delete snippet folders on disk. Every write
 * regenerates the manifest, so a saved snippet is picked up immediately.
 *
 * Not part of the production build (`apply: 'serve'`): the built site is static
 * and has no writable backend.
 */
import { readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateManifest } from './generate-manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SNIPPETS_DIR = join(HERE, '..', 'public', 'snippets')
const API_PREFIX = '/__api/snippets/'
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/ // lowercase, no traversal, url-safe
const MAX_BODY_BYTES = 5_000_000

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY_BYTES) reject(new Error('Request body too large'))
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function snippetsApiPlugin() {
  return {
    name: 'snippets-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith(API_PREFIX)) return next()

        const id = decodeURIComponent(req.url.slice(API_PREFIX.length).split('?')[0].replace(/\/+$/, ''))
        if (!ID_PATTERN.test(id)) return send(res, 400, { error: 'Ungültige Snippet-ID' })

        const dir = join(SNIPPETS_DIR, id)

        try {
          if (req.method === 'GET') {
            if (!(await exists(join(dir, 'index.html')))) return send(res, 404, { error: 'Nicht gefunden' })
            const html = await readFile(join(dir, 'index.html'), 'utf8')
            let meta = {}
            if (await exists(join(dir, 'meta.json'))) {
              try {
                meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
              } catch {
                meta = {}
              }
            }
            return send(res, 200, { id, html, meta })
          }

          if (req.method === 'PUT') {
            const body = await readJsonBody(req)
            const html = typeof body.html === 'string' ? body.html : ''
            const meta = body.meta && typeof body.meta === 'object' ? body.meta : {}
            await mkdir(dir, { recursive: true })
            await writeFile(join(dir, 'index.html'), html, 'utf8')
            await writeFile(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
            const manifest = await generateManifest({ silent: true })
            return send(res, 200, { id, ok: true, count: manifest.count })
          }

          if (req.method === 'DELETE') {
            if (!(await exists(dir))) return send(res, 404, { error: 'Nicht gefunden' })
            await rm(dir, { recursive: true, force: true })
            const manifest = await generateManifest({ silent: true })
            return send(res, 200, { id, ok: true, count: manifest.count })
          }

          return send(res, 405, { error: 'Methode nicht erlaubt' })
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
      })
    },
  }
}
