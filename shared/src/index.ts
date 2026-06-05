export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  statusCode: number;
}

export interface SpenderDto {
  id: number;
  name: string;
  strasse: string;
  ort: string;
  briefAnrede: string;
  adressAnrede?: string | null;
}

export interface Rechnungsposition {
  text: string;
  priceInCents: number;
}

export interface RechnungEingaben {
  anrede: string;
  name: string;
  strasse: string;
  ort: string;
  rechnungsdatum: string;
  title: string;
  positionen: Rechnungsposition[];
  ust: number;
  einzug: boolean;
  email: string;
  mailAnrede: string;
}

export interface RechnungsempfaengerDto {
  id: number;
  name: string;
  strasse: string;
  ort: string;
  email: string | null;
  anrede: string | null;
}

export interface RechnungListItem {
  id: number;
  nummer: string;
  status: 'AKTIV' | 'STORNIERT';
  empfaengerName: string;
  betragCents: number;
  rechnungsdatum: string;
  createdAt: string;
  aktiveRevisionNummer: number | null;
}

export interface RechnungRevisionDto {
  id: number;
  revisionNummer: number;
  status: 'AKTIV' | 'ERSETZT';
  pdfStatus: PdfStatus;
  pdfFehler: string | null;
  pdfTechFehler: string | null;
  eingaben: RechnungEingaben;
  dateiPfad: string | null;
  erstelltAm: string;
}

export interface RechnungDto {
  id: number;
  nummer: string;
  status: 'AKTIV' | 'STORNIERT';
  empfaenger: RechnungsempfaengerDto;
  rechnungsdatum: string;
  createdAt: string;
  aktiveRevision: RechnungRevisionDto | null;
  revisionen: RechnungRevisionDto[];
}

export type VorlageTyp = 'ANSCHREIBEN' | 'QUITTUNG' | 'RECHNUNG';

export interface VorlageDto {
  id: number;
  typ: VorlageTyp;
  version: number;
  dateiName: string;
  aktiv: boolean;
  hochgeladenAm: string;
}

export interface QuittungEingaben {
  name: string;
  strasse: string;
  ort: string;
  briefAnrede: string;
  adressAnrede?: string | null;
  spendenbetragCents: number;
  spendendatum: string;
  mitAnschreiben: boolean;
  kassenwart: string;
  gemeinnuetzigerZweck: string;
  finanzamtName: string;
  steuernummer: string;
  freistellungsdatum: string;
  veranlagungszeitraum: string;
}

export type RevisionStatus = 'AKTIV' | 'ERSETZT';
export type QuittungStatus = 'AKTIV' | 'STORNIERT';
export type PdfStatus = 'PENDING' | 'OK' | 'FAILED';

export interface SpendenQuittungRevisionDto {
  id: number;
  revisionNummer: number;
  status: RevisionStatus;
  pdfStatus: PdfStatus;
  pdfFehler: string | null;
  pdfTechFehler: string | null;
  eingaben: QuittungEingaben;
  dateiPfad: string | null;
  erstelltAm: string;
}

export interface SpendenQuittungDto {
  id: number;
  nummer: string;
  status: QuittungStatus;
  spender: SpenderDto;
  spendendatum: string;
  createdAt: string;
  aktiveRevision: SpendenQuittungRevisionDto | null;
  revisionen?: SpendenQuittungRevisionDto[];
}

export interface SpendenQuittungListItem {
  id: number;
  nummer: string;
  status: QuittungStatus;
  spenderName: string;
  spendenbetragCents: number;
  spendendatum: string;
  createdAt: string;
  aktiveRevisionNummer: number | null;
}

export interface SystemEinstellungen {
  kassenwart: string;
  gemeinnuetzigerZweck: string;
  finanzamtName: string;
  steuernummer: string;
  freistellungsdatum: string;
  veranlagungszeitraum: string;
}

export interface VorlagenValidierungsfehler {
  typ: VorlageTyp;
  fehlendePflichtfelder: string[];
}
