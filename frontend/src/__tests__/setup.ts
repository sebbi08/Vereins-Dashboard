import { enableAutoUnmount } from '@vue/test-utils';
import { afterEach } from 'vitest';

// Unmount every wrapper after each test so listeners and teleported DOM never leak.
enableAutoUnmount(afterEach);

// jsdom has no matchMedia; PrimeVue and useThemeMode query it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

// jsdom has no ResizeObserver; PrimeVue Textarea (autoResize) observes its element.
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
