<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EDITOR_BACKEND, NEW_SNIPPET_HTML } from '@/config'
import type { SnippetMeta, SnippetOrigin } from '@/types/snippet'
import { useSnippetEditor } from '@/composables/useSnippetEditor'

interface Props {
  mode: 'new' | 'edit'
  snippetId: string
  existingIds: readonly string[]
  /** Origin of the snippet being edited (edit mode); `null` when creating. */
  snippetSource?: SnippetOrigin | null
  /** Whether the edited snippet is a local override of a bundled one. */
  isOverride?: boolean
}
const props = withDefaults(defineProps<Props>(), { snippetSource: null, isOverride: false })

const emit = defineEmits<{
  saved: [id: string]
  deleted: [id: string]
  cancel: []
}>()

const { isBusy, error, load, save, remove } = useSnippetEditor()

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const PREVIEW_DELAY_MS = 350

const id = ref(props.snippetId)
const title = ref('')
const description = ref('')
const tags = ref('')
const order = ref<number | ''>('')
const html = ref(props.mode === 'new' ? NEW_SNIPPET_HTML : '')
let baseMeta: SnippetMeta = {}

const idValid = computed(() => ID_PATTERN.test(id.value))
const idTaken = computed(() => props.mode === 'new' && props.existingIds.includes(id.value))
const canSave = computed(() => idValid.value && !idTaken.value && !isBusy.value)

// A bundled snippet in the local (browser) backend cannot be deleted — only
// overridden. Deleting an override resets it to the shipped version.
const canDelete = computed(
  () => props.mode === 'edit' && (EDITOR_BACKEND === 'api' || props.snippetSource === 'user'),
)
const deleteLabel = computed(() => (props.isOverride ? 'Auf Original zurücksetzen' : 'Löschen'))
const storageHint = computed(() =>
  EDITOR_BACKEND === 'api' ? 'Speichert als Datei' : 'Speichert in diesem Browser',
)

// Debounced live preview.
const preview = ref(html.value)
let previewTimer: ReturnType<typeof setTimeout> | undefined
watch(html, (value) => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    preview.value = value
  }, PREVIEW_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(previewTimer))

onMounted(async () => {
  if (props.mode !== 'edit') return
  const source = await load(props.snippetId)
  if (!source) return
  baseMeta = source.meta ?? {}
  id.value = source.id
  title.value = baseMeta.title ?? ''
  description.value = baseMeta.description ?? ''
  tags.value = (baseMeta.tags ?? []).join(', ')
  order.value = typeof baseMeta.order === 'number' ? baseMeta.order : ''
  html.value = source.html
  preview.value = source.html
})

function buildMeta(): SnippetMeta {
  const meta: SnippetMeta = { ...baseMeta }
  meta.title = title.value.trim() || id.value
  meta.description = description.value.trim()
  meta.tags = tags.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  if (order.value === '') delete meta.order
  else meta.order = Number(order.value)
  return meta
}

async function onSave() {
  if (!canSave.value) return
  const result = await save(id.value, html.value, buildMeta())
  if (result !== undefined) emit('saved', id.value)
}

async function onDelete() {
  if (!canDelete.value) return
  const question = props.isOverride
    ? `Lokale Änderungen an „${id.value}“ verwerfen und Original wiederherstellen?`
    : `Snippet „${id.value}“ endgültig löschen?`
  if (!window.confirm(question)) return
  const result = await remove(id.value)
  if (result !== undefined) emit('deleted', id.value)
}

function onDownload() {
  const blob = new Blob([html.value], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${id.value || 'snippet'}.html`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="editor">
    <header class="editor__head">
      <div class="editor__heading">
        <h2 class="editor__title">{{ mode === 'new' ? 'Neues Snippet' : 'Snippet bearbeiten' }}</h2>
        <span class="editor__badge">{{ storageHint }}</span>
        <span v-if="isOverride" class="editor__badge editor__badge--warn">lokale Änderung</span>
      </div>
      <div class="editor__actions">
        <button type="button" class="btn" @click="emit('cancel')">Abbrechen</button>
        <button type="button" class="btn" @click="onDownload">Herunterladen</button>
        <button
          v-if="canDelete"
          type="button"
          class="btn btn--danger"
          :disabled="isBusy"
          @click="onDelete"
        >
          {{ deleteLabel }}
        </button>
        <button type="button" class="btn btn--primary" :disabled="!canSave" @click="onSave">
          {{ isBusy ? 'Speichert …' : 'Speichern' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="editor__error">{{ error.message }}</p>

    <div class="editor__meta">
      <label class="field field--id">
        <span class="field__label">ID (Ordnername)</span>
        <input
          v-model="id"
          type="text"
          class="field__input"
          :disabled="mode === 'edit'"
          placeholder="mein-snippet"
          spellcheck="false"
        />
        <span v-if="id && !idValid" class="field__hint field__hint--error">
          Nur Kleinbuchstaben, Ziffern und Bindestriche; nicht mit „-“ beginnen.
        </span>
        <span v-else-if="idTaken" class="field__hint field__hint--error">Diese ID existiert bereits.</span>
      </label>
      <label class="field">
        <span class="field__label">Titel</span>
        <input v-model="title" type="text" class="field__input" placeholder="Anzeigename" />
      </label>
      <label class="field field--wide">
        <span class="field__label">Beschreibung</span>
        <input v-model="description" type="text" class="field__input" placeholder="Kurztext für die Sidebar" />
      </label>
      <label class="field">
        <span class="field__label">Tags</span>
        <input v-model="tags" type="text" class="field__input" placeholder="komma, getrennt" />
      </label>
      <label class="field field--order">
        <span class="field__label">Reihenfolge</span>
        <input v-model="order" type="number" class="field__input" placeholder="100" />
      </label>
    </div>

    <div class="editor__split">
      <div class="editor__pane">
        <div class="editor__pane-label">index.html</div>
        <textarea
          v-model="html"
          class="editor__code"
          spellcheck="false"
          autocomplete="off"
          wrap="off"
        ></textarea>
      </div>
      <div class="editor__pane">
        <div class="editor__pane-label">Vorschau</div>
        <iframe :srcdoc="preview" class="editor__preview" sandbox="allow-scripts" title="Live-Vorschau"></iframe>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--space-4);
  gap: var(--space-4);
  overflow: auto;
}
.editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.editor__heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.editor__title {
  margin: 0;
  font-size: var(--text-lg);
}
.editor__badge {
  font-size: var(--text-sm);
  color: var(--text-muted);
  padding: 2px var(--space-2);
  border: 1px solid var(--border);
  border-radius: 20px;
}
.editor__badge--warn {
  color: #8a5a00;
  border-color: color-mix(in srgb, #8a5a00 40%, var(--border));
}
.editor__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.editor__error {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius);
  background: color-mix(in srgb, red 12%, var(--surface-1));
  color: var(--text);
  font-size: var(--text-sm);
}
.editor__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.field--wide {
  grid-column: span 2;
}
.field__label {
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.field__input {
  font: inherit;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text);
}
.field__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.field__input:disabled {
  color: var(--text-muted);
}
.field__hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.field__hint--error {
  color: #c0392b;
}
.editor__split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  flex: 1;
  min-height: 320px;
}
.editor__pane {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface-1);
}
.editor__pane-label {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.editor__code {
  flex: 1;
  resize: none;
  border: 0;
  padding: var(--space-3);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  line-height: 1.55;
  tab-size: 2;
  background: var(--surface-1);
  color: var(--text);
  white-space: pre;
}
.editor__code:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.editor__preview {
  flex: 1;
  border: 0;
  width: 100%;
  background: #fff;
}
.btn {
  font: inherit;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text);
  cursor: pointer;
}
.btn:hover {
  border-color: var(--accent);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
.btn--danger {
  color: #c0392b;
  border-color: color-mix(in srgb, #c0392b 40%, var(--border));
}
@media (max-width: 720px) {
  .editor__split {
    grid-template-columns: 1fr;
  }
  .field--wide {
    grid-column: auto;
  }
}
</style>
