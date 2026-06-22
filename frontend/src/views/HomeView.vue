<script setup lang="ts"></script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-gray-800 mb-6">Dashboard</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <RouterLink
        to="/donation-receipt"
        class="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
      >
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Donation Receipt</h3>
        <p class="text-sm text-gray-500">Create and manage donation receipts.</p>
      </RouterLink>
      <RouterLink
        to="/invoice"
        class="block p-6 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
      >
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Invoice</h3>
        <p class="text-sm text-gray-500">Create and manage invoices.</p>
      </RouterLink>
    </div>
  </div>
</template>
