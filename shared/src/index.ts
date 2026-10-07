export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  statusCode: number;
}

export interface DonorDto {
  id: number;
  name: string;
  street: string;
  city: string;
  letterSalutation: string;
  addressSalutation?: string | null;
}

export interface InvoiceLineItem {
  text: string;
  priceInCents: number;
}

export interface InvoiceInputs {
  salutation: string;
  name: string;
  street: string;
  city: string;
  invoiceDate: string;
  title: string;
  lineItems: InvoiceLineItem[];
  vat: number;
  directDebit: boolean;
  email: string;
  emailSalutation: string;
}

/** Invoice fields without the invoice date (drafts get their date on activation). */
export type InvoiceContent = Omit<InvoiceInputs, 'invoiceDate'>;

export interface InvoiceRecipientDto {
  id: number;
  name: string;
  street: string;
  city: string;
  email: string | null;
  salutation: string | null;
}

export interface InvoiceListItem {
  id: number;
  number: string;
  status: 'AKTIV' | 'STORNIERT';
  recipientName: string;
  amountCents: number;
  invoiceDate: string;
  createdAt: string;
  activeRevisionNumber: number | null;
  emailStatus: 'NOT_SENT' | 'SENT' | 'FAILED';
}

export interface InvoiceRevisionDto {
  id: number;
  revisionNumber: number;
  status: 'AKTIV' | 'ERSETZT';
  pdfStatus: PdfStatus;
  pdfError: string | null;
  pdfTechError: string | null;
  emailStatus: 'NOT_SENT' | 'SENT' | 'FAILED';
  emailError: string | null;
  inputs: InvoiceInputs;
  filePath: string | null;
  createdAt: string;
}

export interface InvoiceDto {
  id: number;
  number: string;
  status: 'AKTIV' | 'STORNIERT';
  recipient: InvoiceRecipientDto;
  invoiceDate: string;
  createdAt: string;
  activeRevision: InvoiceRevisionDto | null;
  revisions: InvoiceRevisionDto[];
}

export interface InvoiceDraftDto {
  id: number;
  recipient: InvoiceRecipientDto;
  inputs: InvoiceContent;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDraftListItem {
  id: number;
  recipientName: string;
  title: string;
  amountCents: number;
  updatedAt: string;
}

export type TemplateType = 'ANSCHREIBEN' | 'QUITTUNG' | 'RECHNUNG';

export interface TemplateDto {
  id: number;
  type: TemplateType;
  version: number;
  fileName: string;
  active: boolean;
  uploadedAt: string;
}

export interface ReceiptInputs {
  name: string;
  street: string;
  city: string;
  letterSalutation: string;
  addressSalutation?: string | null;
  donationAmountCents: number;
  donationDate: string;
  withCoverLetter: boolean;
  treasurer: string;
  charitablePurpose: string;
  taxOfficeName: string;
  taxNumber: string;
  exemptionDate: string;
  assessmentPeriod: string;
}

export type RevisionStatus = 'AKTIV' | 'ERSETZT';
export type ReceiptStatus = 'AKTIV' | 'STORNIERT';
export type PdfStatus = 'PENDING' | 'OK' | 'FAILED';

export interface DonationReceiptRevisionDto {
  id: number;
  revisionNumber: number;
  status: RevisionStatus;
  pdfStatus: PdfStatus;
  pdfError: string | null;
  pdfTechError: string | null;
  inputs: ReceiptInputs;
  filePath: string | null;
  createdAt: string;
}

export interface DonationReceiptDto {
  id: number;
  number: string;
  status: ReceiptStatus;
  donor: DonorDto;
  donationDate: string;
  createdAt: string;
  activeRevision: DonationReceiptRevisionDto | null;
  revisions?: DonationReceiptRevisionDto[];
}

export interface DonationReceiptListItem {
  id: number;
  number: string;
  status: ReceiptStatus;
  donorName: string;
  donationAmountCents: number;
  donationDate: string;
  createdAt: string;
  activeRevisionNumber: number | null;
}

export interface SystemSettings {
  treasurer: string;
  charitablePurpose: string;
  taxOfficeName: string;
  taxNumber: string;
  exemptionDate: string;
  assessmentPeriod: string;
}

export interface TemplateValidationError {
  type: TemplateType;
  missingRequiredFields: string[];
}

export interface EmailSettings {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: string;
  emailSubject: string;
  emailBody: string;
  emailTestAddress: string;
}

export * from './instructorRent.js';
export * from './instructorInvoiceText.js';
export * from './instructorInvoiceRequests.js';

import type { InstructorRentResult, TimeBlock } from './instructorRent.js';

export interface InstructorDto {
  id: number;
  recipient: InvoiceRecipientDto;
  hourlyRateCents: number;
  months: number;
  timeBlocks: TimeBlock[];
  calculation: InstructorRentResult;
  createdAt: string;
  updatedAt: string;
}

export interface InstructorListItemDto {
  id: number;
  name: string;
  hourlyRateCents: number;
  months: number;
  calculation: InstructorRentResult;
}

export interface InstructorSettingsDto {
  weeksPerMonth: number;
  invoiceTemplate: string | null; // null = built-in default in use
}

export interface InstructorInvoicePrefillDto {
  recipient: InvoiceRecipientDto;
  title: string;
  lineItems: InvoiceLineItem[];
}
