/**
 * Join the app base URL with a path relative to it. Pure and framework-free so
 * it can be unit-tested without a browser or Vite. Callers pass
 * `import.meta.env.BASE_URL` as `base`.
 */
export function joinBase(base: string, relativePath: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}${relativePath.replace(/^\/+/, '')}`
}
