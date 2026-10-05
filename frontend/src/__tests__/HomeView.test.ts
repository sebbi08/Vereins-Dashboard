import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { NAV_ITEMS } from '../components/navItems';
import HomeView from '../views/HomeView.vue';
import { withPrimeVue } from './helpers/primeVue';

async function mountHome() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: NAV_ITEMS.map((item) => ({ path: item.route, component: { template: '<div />' } })),
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(HomeView, { global: withPrimeVue({ plugins: [router] }) });
  await flushPromises();
  return wrapper;
}

describe('HomeView', () => {
  it('shows the page title', async () => {
    const wrapper = await mountHome();
    expect(wrapper.find('[data-testid="page-title"]').text()).toBe('Dashboard');
  });

  it.each([
    ['invoice', 'Invoice', ['/invoice']],
    ['donation-receipt', 'Donation Receipt', ['/donation-receipt']],
    ['instructor', 'Instructor Rent', ['/instructor']],
    ['settings', 'Settings', ['/invoice/settings', '/donation-receipt/settings']],
  ])('has a %s tile linking to its pages', async (key, title, hrefs) => {
    const wrapper = await mountHome();
    const tile = wrapper.find(`[data-testid="tile-${key}"]`);
    expect(tile.exists()).toBe(true);
    expect(tile.text()).toContain(title);
    expect(tile.findAll('a').map((a) => a.attributes('href'))).toEqual(hrefs);
  });
});
