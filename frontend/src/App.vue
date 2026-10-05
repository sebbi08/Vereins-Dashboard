<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue';
import { cancelPendingConfirm } from '@/composables/useConfirmAction';
import { useAppStore } from '@/stores/app';
import Button from 'primevue/button';
import ConfirmDialog from 'primevue/confirmdialog';
import Drawer from 'primevue/drawer';
import Toast from 'primevue/toast';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const store = useAppStore();
const drawerOpen = ref(false);

const route = useRoute();

// Close the drawer on any navigation, and when the viewport grows past the mobile layout.
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
    // A dialog left open across navigation must not run the previous page's action.
    cancelPendingConfirm();
  },
);

const desktopQuery = window.matchMedia('(min-width: 768px)');
function onViewportChange(event: { matches: boolean }) {
  if (event.matches) drawerOpen.value = false;
}

onMounted(() => {
  store.checkTemplates();
  desktopQuery.addEventListener('change', onViewportChange);
});
onUnmounted(() => desktopQuery.removeEventListener('change', onViewportChange));
</script>

<template>
  <div class="app-shell">
    <aside class="app-shell__sidebar">
      <AppSidebar />
    </aside>

    <div class="app-shell__main">
      <header class="app-shell__topbar">
        <Button
          icon="pi pi-bars"
          text
          aria-label="Open navigation"
          aria-controls="app-nav-drawer"
          :aria-expanded="drawerOpen"
          data-testid="open-nav"
          @click="drawerOpen = true"
        />
        <span class="app-shell__topbar-brand">MV Dashboard</span>
      </header>

      <main class="app-shell__content">
        <RouterView />
      </main>
    </div>

    <Drawer
      id="app-nav-drawer"
      v-model:visible="drawerOpen"
      header="MV Dashboard"
      class="app-shell__drawer"
      aria-label="Main navigation"
    >
      <AppSidebar :show-brand="false" />
    </Drawer>

    <Toast />
    <ConfirmDialog :style="{ width: '28rem' }" :breakpoints="{ '575px': '90vw' }" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}

.app-shell__sidebar {
  width: var(--app-sidebar-width);
  flex-shrink: 0;
  padding: 1rem 0.5rem;
  background: var(--p-content-background);
  border-right: 1px solid var(--p-content-border-color);
  position: sticky;
  top: 0;
  height: 100vh;
  box-sizing: border-box;
}

.app-shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-shell__topbar {
  display: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--p-content-background);
  border-bottom: 1px solid var(--p-content-border-color);
}

.app-shell__topbar-brand {
  font-weight: 700;
}

.app-shell__content {
  flex: 1;
  padding: 2rem;
}

@media (max-width: 767px) {
  .app-shell__sidebar {
    display: none;
  }

  .app-shell__topbar {
    display: flex;
  }

  .app-shell__content {
    padding: 1rem;
  }
}
</style>
