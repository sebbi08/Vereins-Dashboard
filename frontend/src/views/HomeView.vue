<script setup lang="ts">
import Card from 'primevue/card';
import { RouterLink } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';

interface Tile {
  key: string;
  title: string;
  icon: string;
  description: string;
  links: { label: string; to: string }[];
}

const tiles: Tile[] = [
  {
    key: 'invoice',
    title: 'Invoice',
    icon: 'pi pi-file',
    description: 'Create and manage invoices.',
    links: [{ label: 'Open Invoice', to: '/invoice' }],
  },
  {
    key: 'donation-receipt',
    title: 'Donation Receipt',
    icon: 'pi pi-heart',
    description: 'Create and manage donation receipts.',
    links: [{ label: 'Open Donation Receipt', to: '/donation-receipt' }],
  },
  {
    key: 'instructor',
    title: 'Instructor Rent',
    icon: 'pi pi-users',
    description: 'Calculate room rent for instructors.',
    links: [{ label: 'Open Instructor Rent', to: '/instructor' }],
  },
  {
    key: 'settings',
    title: 'Settings',
    icon: 'pi pi-cog',
    description: 'Templates, email and association data.',
    links: [
      { label: 'Invoice settings', to: '/invoice/settings' },
      { label: 'Receipt settings', to: '/donation-receipt/settings' },
    ],
  },
];
</script>

<template>
  <div class="page">
    <PageHeader title="Dashboard" />
    <div class="tiles">
      <Card v-for="tile in tiles" :key="tile.key" :data-testid="`tile-${tile.key}`" class="tile">
        <template #title>
          <span class="tile__title">
            <span :class="tile.icon" aria-hidden="true" />
            {{ tile.title }}
          </span>
        </template>
        <template #content>
          <p class="muted tile__description">{{ tile.description }}</p>
          <div class="row gap-2">
            <RouterLink v-for="link in tile.links" :key="link.to" :to="link.to" class="tile__link">
              {{ link.label }} <span class="pi pi-arrow-right" aria-hidden="true" />
            </RouterLink>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1.5rem;
}

.tile__title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.tile__description {
  margin: 0 0 1rem;
}

.tile__link {
  color: var(--p-primary-color);
  text-decoration: none;
  font-weight: 500;
}

.tile__link:hover {
  text-decoration: underline;
}
</style>
