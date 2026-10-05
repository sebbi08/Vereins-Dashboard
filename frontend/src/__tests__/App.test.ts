import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from '../App.vue';
import { NAV_ITEMS } from '../components/navItems';
import { cancelPendingConfirm } from '../composables/useConfirmAction';
import { withPrimeVue } from './helpers/primeVue';

vi.mock('../composables/useConfirmAction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../composables/useConfirmAction')>()),
  cancelPendingConfirm: vi.fn(),
}));

const Blank = { template: '<div data-testid="routed-page" />' };

describe('App shell', () => {
  beforeEach(() => {
    vi.mocked(cancelPendingConfirm).mockClear();
    setActivePinia(createPinia());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountApp(path = '/') {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: NAV_ITEMS.map((item) => ({ path: item.route, component: Blank })),
    });
    await router.push(path);
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

  it('closes the drawer when the route changes by other means', async () => {
    const { router } = await mountApp();
    (document.querySelector('[data-testid="open-nav"]') as HTMLElement).click();
    await flushPromises();
    expect(document.querySelector('.app-shell__drawer')).not.toBeNull();

    await router.push('/invoice');
    await flushPromises();

    expect(document.querySelector('.app-shell__drawer')).toBeNull();
  });

  it('closes the drawer when the viewport widens to desktop', async () => {
    let listener: ((e: { matches: boolean }) => void) | null = null;
    const removed = vi.fn();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => (listener = cb),
      removeEventListener: removed,
    }));
    const { wrapper } = await mountApp();
    (document.querySelector('[data-testid="open-nav"]') as HTMLElement).click();
    await flushPromises();
    expect(document.querySelector('.app-shell__drawer')).not.toBeNull();

    listener!({ matches: true });
    await flushPromises();
    expect(document.querySelector('.app-shell__drawer')).toBeNull();

    wrapper.unmount();
    expect(removed).toHaveBeenCalled();
  });

  it('exposes drawer state on the open button and labels the drawer', async () => {
    await mountApp();
    const button = document.querySelector('[data-testid="open-nav"]') as HTMLElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    await flushPromises();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.app-shell__drawer')!.getAttribute('aria-label')).toBe(
      'Main navigation',
    );
  });

  it('marks the active sidebar link with aria-current', async () => {
    await mountApp('/instructor');
    const current = document.querySelectorAll('aside.app-shell__sidebar [aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('data-testid')).toBe('nav-instructor');
  });

  it('cancels a pending confirm dialog when the route changes', async () => {
    const { router } = await mountApp();
    expect(cancelPendingConfirm).not.toHaveBeenCalled();
    await router.push('/invoice');
    await flushPromises();
    expect(cancelPendingConfirm).toHaveBeenCalledTimes(1);
  });
});
