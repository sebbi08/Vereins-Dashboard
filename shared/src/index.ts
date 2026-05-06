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
  anrede: string;
  name: string;
  strasse: string;
  ort: string;
}

export type VorlageTyp = "ANSCHREIBEN" | "QUITTUNG";

export interface VorlageDto {
  id: number;
  typ: VorlageTyp;
  version: number;
  dateiName: string;
  aktiv: boolean;
  hochgeladenAm: string;
}

export type Zahlungsweg = "BANK" | "BAR";

export interface QuittungEingaben {
  anrede: string;
  name: string;
  strasse: string;
  ort: string;
  spendenbetragCents: number;
  spendendatum: string;
  mitAnschreiben: boolean;
  zahlungsweg: Zahlungsweg;
  kassenwart: string;
  gemeinnuetzigerZweck: string;
  finanzamtName: string;
  steuernummer: string;
  freistellungsdatum: string;
  veranlagungszeitraum: string;
}

export type RevisionStatus = "AKTIV" | "ERSETZT";
export type QuittungStatus = "AKTIV" | "STORNIERT";

export interface SpendenQuittungRevisionDto {
  id: number;
  revisionNummer: number;
  status: RevisionStatus;
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
