<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue';
</script>

<template>
  <div class="flex min-h-screen bg-gray-100">
    <AppSidebar />
    <main class="flex-1 p-8">
      <RouterView />
    </main>
  </div>
</template>
