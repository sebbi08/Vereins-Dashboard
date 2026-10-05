import type { InvoiceRecipientDto } from 'shared';

/** id null = new recipient; otherwise saving updates that recipient in place. */
export interface RecipientFormValue {
  id: number | null;
  name: string;
  street: string;
  city: string;
  email: string;
  salutation: string;
}

export function emptyRecipient(): RecipientFormValue {
  return { id: null, name: '', street: '', city: '', email: '', salutation: '' };
}

export function fromRecipientDto(dto: InvoiceRecipientDto): RecipientFormValue {
  return {
    id: dto.id,
    name: dto.name,
    street: dto.street,
    city: dto.city,
    email: dto.email ?? '',
    salutation: dto.salutation ?? '',
  };
}

export function toRecipientData(value: RecipientFormValue) {
  return {
    name: value.name,
    street: value.street,
    city: value.city,
    email: value.email || null,
    salutation: value.salutation || null,
  };
}
