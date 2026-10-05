<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div>
      <h2 data-testid="page-title" class="page-header__title">{{ title }}</h2>
      <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.page-header__title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.page-header__subtitle {
  margin: 0.25rem 0 0;
  color: var(--p-text-muted-color);
}

.page-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
