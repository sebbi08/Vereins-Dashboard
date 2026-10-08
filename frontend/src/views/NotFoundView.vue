<script setup lang="ts">
import Button from 'primevue/button';
import { useRouter } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';

const router = useRouter();
</script>

<template>
  <div class="page">
    <PageHeader title="Page not found" />
    <div class="stack">
      <p class="muted">This address does not exist. It may have been mistyped or moved.</p>
      <div class="row">
        <Button
          label="Go to the start page"
          icon="pi pi-home"
          data-testid="go-home"
          @click="router.push('/')"
        />
      </div>
    </div>
  </div>
</template>
