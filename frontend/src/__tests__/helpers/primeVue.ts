import type { MountingOptions } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { primeVueOptions } from '../../primevue';

type GlobalOptions = NonNullable<MountingOptions<Record<string, unknown>>['global']>;

/** Mount `global` options with PrimeVue, ToastService and ConfirmationService installed. */
export function withPrimeVue(global: GlobalOptions = {}): GlobalOptions {
  return {
    ...global,
    plugins: [
      ...(global.plugins ?? []),
      [PrimeVue, primeVueOptions()],
      ToastService,
      ConfirmationService,
    ],
  };
}
