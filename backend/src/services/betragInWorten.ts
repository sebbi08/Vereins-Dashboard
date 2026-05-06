const einheiten = [
  '',
  'ein',
  'zwei',
  'drei',
  'vier',
  'fünf',
  'sechs',
  'sieben',
  'acht',
  'neun',
  'zehn',
  'elf',
  'zwölf',
  'dreizehn',
  'vierzehn',
  'fünfzehn',
  'sechzehn',
  'siebzehn',
  'achtzehn',
  'neunzehn',
];

const zehner = [
  '',
  '',
  'zwanzig',
  'dreißig',
  'vierzig',
  'fünfzig',
  'sechzig',
  'siebzig',
  'achtzig',
  'neunzig',
];

function zahlInWorte(n: number): string {
  if (n === 0) return 'null';
  if (n < 20) return einheiten[n];
  if (n < 100) {
    const z = Math.floor(n / 10);
    const e = n % 10;
    return e > 0 ? einheiten[e] + 'und' + zehner[z] : zehner[z];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return (h === 1 ? 'ein' : einheiten[h]) + 'hundert' + (rest > 0 ? zahlInWorte(rest) : '');
  }
  if (n < 1000000) {
    const t = Math.floor(n / 1000);
    const rest = n % 1000;
    const tWord = t === 1 ? 'eintausend' : zahlInWorte(t) + 'tausend';
    return tWord + (rest > 0 ? zahlInWorte(rest) : '');
  }
  return String(n);
}

export function betragInWorten(cents: number): string {
  const euro = Math.floor(cents / 100);
  const cent = cents % 100;

  let result = zahlInWorte(euro) + ' Euro';
  if (cent > 0) {
    result += ' und ' + zahlInWorte(cent) + ' Cent';
  }

  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function formatBetrag(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function formatDatum(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
