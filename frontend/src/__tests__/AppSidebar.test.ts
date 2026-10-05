import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import AppSidebar from '../components/AppSidebar.vue';
import { activeNavKey, NAV_ITEMS } from '../components/navItems';
import { useThemeMode } from '../composables/useThemeMode';
import { withPrimeVue } from './helpers/primeVue';

const Blank = { template: '<div />' };

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      ...NAV_ITEMS.map((item) => ({ path: item.route, component: Blank })),
      { path: '/invoice/:id', component: Blank },
      { path: '/invoice/draft/:draftId', component: Blank },
    ],
  });
}

async function mountAt(path: string, props: Record<string, unknown> = {}) {
  const router = makeRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AppSidebar, { props, global: withPrimeVue({ plugins: [router] }) });
  await flushPromises();
  return { wrapper, router };
}

describe('activeNavKey', () => {
  it.each([
    ['/', 'dashboard'],
    ['/invoice', 'invoice'],
    ['/invoice/12', 'invoice'],
    ['/invoice/draft/5', 'invoice'],
    ['/invoice/settings', 'invoice-settings'],
    ['/donation-receipt/settings', 'donation-receipt-settings'],
    ['/donation-receipt/3/revision', 'donation-receipt'],
    ['/instructor/new', 'instructor'],
    ['/unknown', null],
  ])('maps %s to %s', (path, key) => {
    expect(activeNavKey(path)).toBe(key);
  });

  it('does not treat /invoices as /invoice', () => {
    expect(activeNavKey('/invoices')).toBeNull();
  });
});

describe('AppSidebar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    useThemeMode().setMode('system');
    document.documentElement.classList.remove('app-dark');
  });

  it('renders a link for every entry with its route as href', async () => {
    const { wrapper } = await mountAt('/');
    for (const item of NAV_ITEMS) {
      const link = wrapper.find(`[data-testid="nav-${item.key}"]`);
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBe(item.route);
      expect(link.text()).toContain(item.label);
    }
  });

  it('highlights only the most specific entry', async () => {
    const { wrapper } = await mountAt('/invoice/settings');
    const active = wrapper.findAll('.app-nav__link--active');
    expect(active).toHaveLength(1);
    expect(active[0].attributes('data-testid')).toBe('nav-invoice-settings');
  });

  it('navigates and emits navigate when a link is clicked', async () => {
    const { wrapper, router } = await mountAt('/');
    await wrapper.find('[data-testid="nav-instructor"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/instructor');
    expect(wrapper.emitted('navigate')).toHaveLength(1);
  });

  it('switches the color mode with the theme toggle', async () => {
    const { wrapper } = await mountAt('/');
    const toggle = wrapper.find('[data-testid="theme-toggle"]');
    const dark = toggle.findAll('button').find((b) => b.text().includes('Dark'))!;

    await dark.trigger('click');

    expect(document.documentElement.classList.contains('app-dark')).toBe(true);
    expect(localStorage.getItem('mv-theme')).toBe('dark');
  });

  it('shows brand and version', async () => {
    const { wrapper } = await mountAt('/');
    expect(wrapper.text()).toContain('MV Dashboard');
    expect(wrapper.find('p.app-nav__version').text()).toContain('Version');
  });

  it('can hide the brand', async () => {
    const { wrapper } = await mountAt('/', { showBrand: false });
    expect(wrapper.find('.app-nav__brand').exists()).toBe(false);
  });
});
