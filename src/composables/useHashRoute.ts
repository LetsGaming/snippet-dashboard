import { onMounted, onUnmounted, ref } from 'vue'

const HASH_PREFIX = '#/'

function parseHash(hash: string): string {
  return hash.startsWith(HASH_PREFIX) ? decodeURIComponent(hash.slice(HASH_PREFIX.length)) : ''
}

/**
 * Dependency-free routing: the current snippet id lives in the URL hash
 * (`#/<id>`), which keeps links shareable and the back button working without
 * pulling in a router. Registers its listener and mirrors the matching
 * teardown in the same composable.
 */
export function useHashRoute() {
  const current = ref(parseHash(window.location.hash))

  function sync(): void {
    current.value = parseHash(window.location.hash)
  }

  function navigate(id: string): void {
    window.location.hash = id ? `${HASH_PREFIX}${encodeURIComponent(id)}` : ''
  }

  onMounted(() => window.addEventListener('hashchange', sync))
  onUnmounted(() => window.removeEventListener('hashchange', sync))

  return { current, navigate }
}
