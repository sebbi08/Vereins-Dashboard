import Aura from '@primeuix/themes/aura';
import type { PrimeVueConfiguration, PrimeVueLocaleOptions } from '@primevue/core/config';
import { defaultOptions } from 'primevue/config';

/** German date formatting for DatePicker; all other PrimeVue labels stay English. */
export const DE_DATE_LOCALE = {
  dateFormat: 'dd.mm.yy',
  firstDayOfWeek: 1,
  dayNames: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  dayNamesShort: ['Son', 'Mon', 'Die', 'Mit', 'Don', 'Fre', 'Sam'],
  dayNamesMin: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  monthNames: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ],
  monthNamesShort: [
    'Jan',
    'Feb',
    'Mär',
    'Apr',
    'Mai',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Okt',
    'Nov',
    'Dez',
  ],
};

export function primeVueOptions(license?: string) {
  return {
    theme: { preset: Aura, options: { darkModeSelector: '.app-dark' } },
    // defaultOptions.locale is typed with optional keys; at runtime it is fully populated.
    locale: { ...defaultOptions.locale, ...DE_DATE_LOCALE } as PrimeVueLocaleOptions,
    license: license || undefined,
  } satisfies PrimeVueConfiguration;
}
