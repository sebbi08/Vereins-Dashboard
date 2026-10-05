<script setup lang="ts">
import Card from 'primevue/card';

defineProps<{
  title: string;
}>();
</script>

<template>
  <Card class="form-section">
    <template #title>{{ title }}</template>
    <template #content>
      <slot />
    </template>
  </Card>
</template>

<style scoped>
.form-section {
  margin-bottom: 1.5rem;
}
</style>
