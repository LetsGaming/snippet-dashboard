<script setup lang="ts">
import { computed, onMounted } from 'vue'
import AppEmptyState from '@/components/AppEmptyState.vue'
import SnippetEditor from '@/components/SnippetEditor.vue'
import SnippetFrame from '@/components/SnippetFrame.vue'
import TheSidebar from '@/components/TheSidebar.vue'
import { EDITOR_ENABLED } from '@/config'
import { useHashRoute } from '@/composables/useHashRoute'
import { useSnippets } from '@/composables/useSnippets'

const { snippets, isLoading, error, load } = useSnippets()
const { current, navigate } = useHashRoute()

const EDIT_PREFIX = 'edit/'

/** Interpret the hash into a small route: home / new / edit / snippet. */
const route = computed(() => {
  const value = current.value
  if (value === 'new') return { name: 'new' as const, id: '' }
  if (value.startsWith(EDIT_PREFIX)) return { name: 'edit' as const, id: value.slice(EDIT_PREFIX.length) }
  if (value) return { name: 'snippet' as const, id: value }
  return { name: 'home' as const, id: '' }
})

const activeSnippet = computed(() =>
  route.value.name === 'snippet'
    ? (snippets.value.find((snippet) => snippet.id === route.value.id) ?? null)
    : null,
)

const editTarget = computed(() =>
  route.value.name === 'edit'
    ? (snippets.value.find((snippet) => snippet.id === route.value.id) ?? null)
    : null,
)

const sidebarActiveId = computed(() =>
  route.value.name === 'snippet' || route.value.name === 'edit' ? route.value.id : '',
)

const existingIds = computed(() => snippets.value.map((snippet) => snippet.id))

async function onEditorSaved(id: string) {
  await load()
  navigate(id)
}

async function onEditorDeleted() {
  await load()
  navigate('')
}

onMounted(load)
</script>

<template>
  <div class="app">
    <TheSidebar
      class="app__sidebar"
      :snippets="snippets"
      :active-id="sidebarActiveId"
      :editable="EDITOR_ENABLED"
      @select="navigate"
      @edit="(id) => navigate(`${EDIT_PREFIX}${id}`)"
      @create="navigate('new')"
    />

    <main class="app__main">
      <AppEmptyState v-if="isLoading" title="Lädt Snippets …" />

      <AppEmptyState
        v-else-if="error"
        title="Snippets konnten nicht geladen werden"
        :message="error.message"
      />

      <SnippetEditor
        v-else-if="route.name === 'new' || route.name === 'edit'"
        :key="current"
        :mode="route.name"
        :snippet-id="route.id"
        :existing-ids="existingIds"
        :snippet-source="editTarget?.source ?? null"
        :is-override="editTarget?.isOverride ?? false"
        @saved="onEditorSaved"
        @deleted="onEditorDeleted"
        @cancel="navigate(route.id || '')"
      />

      <SnippetFrame v-else-if="activeSnippet" :snippet="activeSnippet" />

      <AppEmptyState
        v-else-if="route.name === 'snippet'"
        title="Snippet nicht gefunden"
        :message="`Kein Snippet mit der ID „${route.id}“.`"
      />

      <AppEmptyState v-else title="Willkommen" message="Wähle links ein Snippet aus." />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  height: 100vh;
}
.app__sidebar {
  border-right: 1px solid var(--border);
  overflow-y: auto;
}
.app__main {
  position: relative;
  overflow: hidden;
}
@media (max-width: 720px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .app__sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
    max-height: 42vh;
  }
}
</style>
