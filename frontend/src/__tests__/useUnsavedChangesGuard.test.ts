import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';

const { confirmAction } = vi.hoisted(() => ({ confirmAction: vi.fn() }));
vi.mock('../composables/useConfirmAction', () => ({
  useConfirmAction: () => ({ confirmAction }),
}));

const dirty = ref(false);
let allowLeave: () => void = () => {};

const FormPage = defineComponent({
  setup() {
    ({ allowLeave } = useUnsavedChangesGuard(() => dirty.value));
    return () => null;
  },
});

let router: Router;

async function mountApp() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/form', component: FormPage },
      { path: '/other', component: { render: () => null } },
    ],
  });
  await router.push('/form');
  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  });
  await flushPromises();
  return wrapper;
}

function beforeUnload(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  dirty.value = false;
  confirmAction.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUnsavedChangesGuard', () => {
  it('leaves a clean form without asking', async () => {
    await mountApp();
    await router.push('/other');
    expect(confirmAction).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/other');
  });

  it('stays on a dirty form when the user keeps editing', async () => {
    confirmAction.mockResolvedValue(false);
    await mountApp();
    dirty.value = true;

    await router.push('/other');

    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('unsaved changes') }),
    );
    expect(router.currentRoute.value.path).toBe('/form');
  });

  it('leaves a dirty form when the user discards the changes', async () => {
    confirmAction.mockResolvedValue(true);
    await mountApp();
    dirty.value = true;

    await router.push('/other');

    expect(router.currentRoute.value.path).toBe('/other');
  });

  it('leaves without asking after allowLeave(), e.g. right after saving', async () => {
    await mountApp();
    dirty.value = true;
    allowLeave();

    await router.push('/other');

    expect(confirmAction).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/other');
  });

  it('asks the browser to confirm closing the tab only while dirty', async () => {
    const wrapper = await mountApp();
    expect(beforeUnload().defaultPrevented).toBe(false);

    dirty.value = true;
    expect(beforeUnload().defaultPrevented).toBe(true);

    wrapper.unmount();
    expect(beforeUnload().defaultPrevented).toBe(false);
  });
});
