<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import { ref } from 'vue';

defineProps<{
  error: string | null;
  techError: string | null;
}>();

const showDetails = ref(false);
</script>

<template>
  <Message severity="warn" data-testid="pdf-failure">
    <div class="stack gap-sm">
      <span>{{ error || 'PDF could not be generated. Please try again.' }}</span>
      <Button
        v-if="techError"
        :label="showDetails ? 'Hide Details' : 'Show Details'"
        size="small"
        text
        data-testid="toggle-tech-error"
        @click="showDetails = !showDetails"
      />
      <pre v-if="techError && showDetails" class="pdf-failure__tech">{{ techError }}</pre>
    </div>
  </Message>
</template>

<style scoped>
.pdf-failure__tech {
  white-space: pre-wrap;
  font-size: 0.75rem;
  margin: 0;
}
</style>
