<script setup lang="ts">
import { APP_TITLE } from '@/config'
import type { Snippet } from '@/types/snippet'

interface Props {
  snippets: readonly Snippet[]
  activeId: string
  editable?: boolean
}
withDefaults(defineProps<Props>(), { editable: false })

const emit = defineEmits<{
  select: [id: string]
  edit: [id: string]
  create: []
}>()
</script>

<template>
  <nav class="sidebar" aria-label="Snippets">
    <div class="sidebar__brand">
      <img src="/favicon.svg" alt="" class="sidebar__logo" width="20" height="20" />
      <span>{{ APP_TITLE }}</span>
    </div>

    <ul v-if="snippets.length" class="sidebar__list">
      <li v-for="snippet in snippets" :key="snippet.id" class="sidebar__row">
        <button
          type="button"
          class="sidebar__item"
          :class="{ 'sidebar__item--active': snippet.id === activeId }"
          :aria-current="snippet.id === activeId ? 'page' : undefined"
          @click="emit('select', snippet.id)"
        >
          <span class="sidebar__item-title">
            {{ snippet.title }}
            <span v-if="snippet.source === 'user'" class="sidebar__badge" :title="snippet.isOverride ? 'lokale Änderung' : 'lokales Snippet'">•</span>
          </span>
          <span v-if="snippet.description" class="sidebar__item-desc">{{ snippet.description }}</span>
        </button>
        <button
          v-if="editable"
          type="button"
          class="sidebar__edit"
          :aria-label="`„${snippet.title}“ bearbeiten`"
          title="Bearbeiten"
          @click="emit('edit', snippet.id)"
        >
          ✎
        </button>
      </li>
    </ul>

    <p v-else class="sidebar__empty">Keine Snippets gefunden.</p>

    <button v-if="editable" type="button" class="sidebar__create" @click="emit('create')">
      + Neues Snippet
    </button>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  height: 100%;
  background: var(--surface-1);
}
.sidebar__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  font-size: var(--text-base);
  padding: var(--space-1) var(--space-2);
}
.sidebar__logo {
  border-radius: var(--radius-sm);
}
.sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.sidebar__row {
  display: flex;
  align-items: stretch;
  gap: var(--space-1);
}
.sidebar__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  text-align: left;
  padding: var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.sidebar__item:hover {
  background: var(--surface-2);
}
.sidebar__item--active {
  background: var(--surface-2);
  border-color: var(--accent);
}
.sidebar__item-title {
  font-weight: 500;
}
.sidebar__badge {
  color: var(--accent);
  font-size: 1.1em;
  line-height: 0;
  vertical-align: middle;
}
.sidebar__item-desc {
  font-size: var(--text-sm);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar__edit {
  flex: none;
  width: 34px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-base);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, background 0.12s;
}
.sidebar__row:hover .sidebar__edit,
.sidebar__edit:focus-visible {
  opacity: 1;
}
.sidebar__edit:hover {
  background: var(--surface-2);
  color: var(--text);
}
.sidebar__empty {
  color: var(--text-muted);
  font-size: var(--text-sm);
  padding: 0 var(--space-2);
}
.sidebar__create {
  margin-top: auto;
  padding: var(--space-3);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.sidebar__create:hover {
  border-color: var(--accent);
  background: var(--surface-2);
}
</style>
