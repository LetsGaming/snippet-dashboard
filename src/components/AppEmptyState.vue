<script setup lang="ts">
interface Props {
  title: string
  message?: string
}
defineProps<Props>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__mark" aria-hidden="true">◱</div>
    <h2 class="empty-state__title">{{ title }}</h2>
    <p v-if="message" class="empty-state__message">{{ message }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  text-align: center;
  color: var(--text-muted);
}
.empty-state__mark {
  font-size: 2.5rem;
  color: var(--text-faint);
}
.empty-state__title {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text);
}
.empty-state__message {
  margin: 0;
  max-width: 42ch;
  font-size: var(--text-sm);
}
</style>
