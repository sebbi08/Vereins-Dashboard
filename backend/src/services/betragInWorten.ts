import { ToWords } from 'to-words';

const converter = new ToWords({
  localeCode: 'de-DE',
});

export function amountInWords(cents: number): string {
  const euro = Math.floor(cents / 100);
  const cent = cents % 100;

  let result = converter.convert(euro) + ' Euro';
  if (cent > 0) {
    result += ' und ' + converter.convert(cent) + ' Cent';
  }

  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function formatAmount(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
