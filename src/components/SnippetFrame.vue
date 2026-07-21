<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DEFAULT_SNIPPET_SANDBOX, USER_SNIPPET_SANDBOX } from '@/config'
import type { Snippet } from '@/types/snippet'
import { joinBase } from '@/utils/url'

interface Props {
  snippet: Snippet
}
const props = defineProps<Props>()

const isLoading = ref(true)
const isInline = computed(() => props.snippet.srcdoc !== null)
const src = computed(() => joinBase(import.meta.env.BASE_URL, props.snippet.entry))
const sandbox = computed(
  () =>
    props.snippet.sandbox ??
    (props.snippet.source === 'user' ? USER_SNIPPET_SANDBOX : DEFAULT_SNIPPET_SANDBOX),
)

// Reset the loading overlay whenever we switch to a different snippet.
watch(
  () => props.snippet.id,
  () => {
    isLoading.value = true
  },
)

function onLoad(): void {
  isLoading.value = false
}
</script>

<template>
  <div class="snippet-frame">
    <div v-if="isLoading" class="snippet-frame__loading" role="status">Lädt …</div>
    <!--
      `:key` forces a fresh iframe per snippet, so switching fully tears down the
      previous document — no shared state can leak across. User snippets render
      from an inline `srcdoc`; bundled ones load their file via `src`.
    -->
    <iframe
      v-if="isInline"
      :key="`user:${snippet.id}`"
      :srcdoc="snippet.srcdoc ?? ''"
      :sandbox="sandbox"
      :title="snippet.title"
      class="snippet-frame__iframe"
      referrerpolicy="no-referrer"
      @load="onLoad"
    />
    <iframe
      v-else
      :key="`bundled:${snippet.id}`"
      :src="src"
      :sandbox="sandbox"
      :title="snippet.title"
      class="snippet-frame__iframe"
      referrerpolicy="no-referrer"
      @load="onLoad"
    />
  </div>
</template>

<style scoped>
.snippet-frame {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--surface-1);
}
.snippet-frame__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
.snippet-frame__loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--surface-1);
  color: var(--text-muted);
  font-size: var(--text-sm);
}
</style>
