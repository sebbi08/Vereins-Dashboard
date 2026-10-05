<script setup lang="ts">
import Menu from 'primevue/menu';
import SelectButton from 'primevue/selectbutton';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { type ThemeMode, useThemeMode } from '../composables/useThemeMode';
import { activeNavKey, NAV_ITEMS } from './navItems';

withDefaults(defineProps<{ showBrand?: boolean }>(), { showBrand: true });

const route = useRoute();
const activeKey = computed(() => activeNavKey(route.path));

const { mode, setMode } = useThemeMode();
const themeOptions: { label: string; value: ThemeMode; icon: string }[] = [
  { label: 'System', value: 'system', icon: 'pi pi-desktop' },
  { label: 'Light', value: 'light', icon: 'pi pi-sun' },
  { label: 'Dark', value: 'dark', icon: 'pi pi-moon' },
];

const appVersion = import.meta.env.VITE_APP_VERSION;
</script>

<template>
  <div class="app-nav">
    <h1 v-if="showBrand" class="app-nav__brand">MV Dashboard</h1>

    <nav aria-label="Main navigation">
      <Menu :model="NAV_ITEMS" class="app-nav__menu" aria-label="Main navigation menu">
        <template #item="{ item, props }">
          <RouterLink v-slot="{ href, navigate }" :to="item.route" custom>
            <a
              :href="href"
              v-bind="props.action"
              :data-testid="`nav-${item.key}`"
              :aria-current="item.key === activeKey ? 'page' : undefined"
              class="app-nav__link"
              :class="{
                'app-nav__link--active': item.key === activeKey,
                'app-nav__link--sub': item.sub,
              }"
              @click="navigate"
            >
              <span :class="item.icon" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </a>
          </RouterLink>
        </template>
      </Menu>
    </nav>

    <div class="app-nav__footer">
      <SelectButton
        :model-value="mode"
        :options="themeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        data-testid="theme-toggle"
        aria-label="Color mode"
        size="small"
        @update:model-value="setMode"
      >
        <template #option="{ option }">
          <span :class="option.icon" aria-hidden="true" />
          <span>{{ option.label }}</span>
        </template>
      </SelectButton>
      <p class="app-nav__version">Version {{ appVersion }}</p>
    </div>
  </div>
</template>

<style scoped>
.app-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.app-nav__brand {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 1.25rem;
  font-weight: 700;
}

.app-nav__menu {
  width: 100%;
  border: none;
  background: transparent;
}

.app-nav__link {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  text-decoration: none;
}

.app-nav__link--sub {
  padding-left: 2.25rem;
  font-size: 0.875rem;
}

.app-nav__link--active {
  color: var(--p-primary-color);
  font-weight: 600;
}

.app-nav__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0 0.75rem;
}

.app-nav__version {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
