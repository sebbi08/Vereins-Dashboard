<script setup lang="ts">
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-gray-800 mb-6">Dashboard</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <RouterLink
        to="/spenden-quittung"
        class="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
      >
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Spenden Quittung</h3>
        <p class="text-sm text-gray-500">Spenden Quittungen erstellen und verwalten.</p>
      </RouterLink>
      <RouterLink
        to="/rechnung"
        class="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
      >
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Rechnung</h3>
        <p class="text-sm text-gray-500">Rechnungen erstellen und verwalten.</p>
      </RouterLink>
    </div>
  </div>
</template>
