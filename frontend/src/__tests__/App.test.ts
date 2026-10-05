import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from '../App.vue';
import { NAV_ITEMS } from '../components/navItems';
import { withPrimeVue } from './helpers/primeVue';

const Blank = { template: '<div data-testid="routed-page" />' };

describe('App shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function mountApp() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: NAV_ITEMS.map((item) => ({ path: item.route, component: Blank })),
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: withPrimeVue({ plugins: [router, createPinia()] }),
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('renders the sidebar and the routed page', async () => {
    const { wrapper } = await mountApp();
    expect(wrapper.find('aside.app-shell__sidebar [data-testid="nav-dashboard"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="routed-page"]').exists()).toBe(true);
  });

  it('checks the available templates on start', async () => {
    await mountApp();
    expect(fetch).toHaveBeenCalledWith('/api/templates');
  });

  it('opens the navigation drawer and closes it after navigating', async () => {
    const { router } = await mountApp();

    (document.querySelector('[data-testid="open-nav"]') as HTMLElement).click();
    await flushPromises();
    const drawerLink = document.querySelector(
      '.app-shell__drawer [data-testid="nav-instructor"]',
    ) as HTMLElement | null;
    expect(drawerLink).not.toBeNull();

    drawerLink!.click();
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/instructor');
    expect(document.querySelector('.app-shell__drawer [data-testid="nav-instructor"]')).toBeNull();
  });
});
