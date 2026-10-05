import { describe, expect, it } from 'vitest';
import { calculateGross, validateRequiredFields } from '../../services/invoiceCreation';

const valid = {
  salutation: '',
  name: 'Firma',
  street: 'Weg 1',
  city: 'Stadt',
  title: 'Titel',
  lineItems: [{ text: 'Pos', priceInCents: 1000 }],
  vat: 19,
  directDebit: false,
  email: '',
  emailSalutation: '',
};

describe('validateRequiredFields', () => {
  it('accepts complete inputs', () => {
    expect(validateRequiredFields(valid)).toBeNull();
  });

  it('requires a street', () => {
    expect(validateRequiredFields({ ...valid, street: ' ' })).toBe('Street is required');
  });

  it('requires a positive price per line item', () => {
    expect(
      validateRequiredFields({ ...valid, lineItems: [{ text: 'Pos', priceInCents: 0 }] }),
    ).toBe('Line item 1: Price must be greater than 0');
  });

  it('only allows 7% or 19% VAT', () => {
    expect(validateRequiredFields({ ...valid, vat: 16 })).toBe('VAT must be 7% or 19%');
  });
});

describe('calculateGross', () => {
  it('adds rounded VAT to the net sum', () => {
    const positions = JSON.stringify([
      { text: 'A', priceInCents: 1000 },
      { text: 'B', priceInCents: 2000 },
    ]);
    expect(calculateGross(positions, 19)).toBe(3570);
  });
});
