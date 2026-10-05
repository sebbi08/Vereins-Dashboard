<script setup lang="ts">
import { RouterLink } from 'vue-router';

const navItems = [
  { name: 'Dashboard', to: '/' },
  { name: 'Donation Receipt', to: '/donation-receipt' },
  { name: 'Invoice', to: '/invoice' },
  { name: 'Instructor Rent', to: '/instructor' },
];

const appVersion = import.meta.env.VITE_APP_VERSION;
</script>

<template>
  <aside class="w-64 min-h-screen bg-white shadow-md flex flex-col">
    <div class="px-6 py-5 border-b border-gray-200">
      <h1 class="text-xl font-bold text-gray-800">MV Dashboard</h1>
    </div>
    <nav class="flex-1 px-4 py-6 space-y-1">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="block px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        active-class="bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
      >
        {{ item.name }}
      </RouterLink>
    </nav>
    <footer class="px-4 py-3 border-t border-gray-200">
      <p class="text-xs text-gray-400 text-center">Version {{ appVersion }}</p>
    </footer>
  </aside>
</template>
