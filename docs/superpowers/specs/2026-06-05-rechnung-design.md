# Rechnungs-Modul Design

## Übersicht

Das Rechnungs-Modul ermöglicht das Erstellen von Rechnungen aus einer docx-Vorlage heraus, die per UI hochgeladen wird. Es folgt dem gleichen Muster wie das Spendenquittungs-Modul: Vorlage hochladen → Formular ausfüllen → PDF generieren → Revisionen verwalten.

## Datenmodell

```prisma
model Rechnungsempfaenger {
  id          Int        @id @default(autoincrement())
  name        String
  strasse     String
  ort         String
  email       String?
  anrede      String?    // z.B. "Hallo Pia,"
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  rechnungen  Rechnung[]
}

model Rechnung {
  id               Int                    @id @default(autoincrement())
  nummer           String                 @unique
  jahr             Int
  laufendeNummer   Int
  status           String                 @default("AKTIV")  // AKTIV | STORNIERT
  empfaengerId     Int
  empfaenger       Rechnungsempfaenger    @relation(fields: [empfaengerId], references: [id])
  rechnungsdatum   DateTime
  createdAt        DateTime               @default(now())
  revisionen       RechnungRevision[]
}

model RechnungRevision {
  id              Int       @id @default(autoincrement())
  rechnungId      Int
  rechnung        Rechnung  @relation(fields: [rechnungId], references: [id])
  revisionNummer  Int
  status          String    @default("AKTIV")  // AKTIV | ERSETZT

  // Briefkopf (Snapshot zum Erstellzeitpunkt)
  anrede          String
  name            String
  strasse         String
  ort             String
  rechnungsdatum  DateTime

  // Rechnungsinhalt
  title           String
  positionen      String     // JSON: [{"text": "...", "priceInCents": 8750}, ...]
  ust             Int        // 7 oder 19
  einzug          Boolean    // true = Lastschrift, false = Überweisung

  // Metadaten
  email           String
  mailAnrede      String

  // Vorlage
  vorlageId       Int
  vorlage         Vorlage    @relation(fields: [vorlageId], references: [id])

  pdfStatus       String     @default("PENDING")  // PENDING | OK | FAILED
  pdfFehler       String?
  pdfTechFehler   String?
  dateiPfad       String?
  erstelltAm      DateTime   @default(now())
}
```

### Rechnungsnummer

Format: `"<laufendeNummer> / <jahr>"` (z.B. "1 / 2026"). Fortlaufend pro Jahr, analog zu `quittungsNummer.ts`. Implementiert als `rechnungsNummer.ts` Service.

## API-Routen (`/api/rechnung`)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/` | Liste mit `?search=`, `?vonDatum=`, `?bisDatum=`, `?mitStorniert=true` |
| GET | `/:id` | Detail inkl. aller Revisionen und Empfängerdaten |
| GET | `/empfaenger` | Empfänger suchen (`?search=`) |
| POST | `/` | Neue Rechnung ({ empfaengerId?, empfaengerDaten?, eingaben }) + PDF |
| POST | `/:id/revision` | Neue Revision ({ eingaben }) |
| PATCH | `/:id/stornieren` | Rechnung stornieren |
| GET | `/revision/:revisionId/download` | PDF-Download |
| POST | `/revision/:revisionId/retry-pdf` | PDF-Neugenerierung bei FAILED |

## Shared Types (shared/src/index.ts)

```ts
export type VorlageTyp = 'ANSCHREIBEN' | 'QUITTUNG' | 'RECHNUNG';

export interface Rechnungsposition {
  text: string;
  priceInCents: number;
}

export interface RechnungEingaben {
  anrede: string;
  name: string;
  strasse: string;
  ort: string;
  rechnungsdatum: string;       // ISO-Datum
  title: string;
  positionen: Rechnungsposition[];
  ust: number;                   // 7 oder 19
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
```

## PDF-Generierung

Neue Funktion `generiereRechnungPdf(prisma, revisionId)` in `pdfGenerierung.ts`.

Zweipass-Ansatz mit docxtemplater (wie Referenzimplementierung):

1. **Pass 1**: Template-Platzhalter ersetzen:
   - `Anrede`, `Name`, `Strasse`, `Ort`, `Heute`, `Title`, `ReNr`
   - `Netto`, `Steuer`, `Brutto` (aus Positionen + USt berechnet)
   - `ust`, `MailAnrede`
   - `PaymentDetails`: "Der Betrag wird [...] eingezogen" oder "Bitte überweisen Sie [...]"
   - `TableWithServices`: Generiertes OOXML-Tabellen-XML mit Header ("Leistung" / "Preis") und Platzhaltern `{text0}`, `{price0}`, ...

2. **Pass 2**: Pro-Position-Platzhalter `{text0}`, `{price0}€`, etc. ersetzen

3. **docx → PDF**: via `libreoffice --headless --convert-to pdf`

Netto/Steuer/Brutto-Berechnung:
- Netto = Summe aller `positionen[].priceInCents`
- Steuer = round(Netto * ust / 100)
- Brutto = Netto + Steuer

## Template-Validierung

Neue Validierung für `RECHNUNG` in `vorlagenValidierung.ts`.
Pflichtfelder im docx (via docxtemplater-Platzhalter-Suche):
`Name`, `Strasse`, `Ort`, `Heute`, `Title`, `TableWithServices`, `Netto`, `Steuer`, `Brutto`, `ust`, `PaymentDetails`

## Vorlagen-Routen-Erweiterung

- `ERLAUBTE_ENDUNGEN` um `RECHNUNG: '.docx'` erweitern
- `GUELTIGE_TYPEN` um `RECHNUNG` erweitern
- `getDummyDaten` um RECHNUNG-Fall erweitern
- `generierePreviewVorlage` um RECHNUNG-Fall erweitern (docx → pdf)

## Rechnungsempfänger

Eigenes Modell `Rechnungsempfaenger`, getrennt von `Spender`. API: `GET /api/rechnung/empfaenger?search=` für Autocomplete. Bei POST /api/rechnung kann entweder `empfaengerId` (bestehender Empfänger) oder `empfaengerDaten` (neuer Empfänger) mitgegeben werden — analog zur Spender-Logik in spendenQuittung.ts.

## Frontend

### Views

| View | Route | Beschreibung |
|---|---|---|
| `RechnungView` | `/rechnung` | Liste mit Suche, Datum-Filter, "Neue Rechnung"-Button. Prüft auf aktive RECHNUNG-Vorlage. |
| `RechnungFormView` | `/rechnung/neu` und `/rechnung/:id/revision` | Formular mit Briefkopf, Positionen-Tabelle (dynamische Zeilen), USt-Auswahl (7%/19%), Zahlungsart (Einzug/Überweisung), Metadaten |
| `RechnungDetailView` | `/rechnung/:id` | Detail mit Revisionstabelle, Download, Storno, neue Revision |

### Komponenten

Keine neuen Komponenten nötig. Vorhandene UI-Patterns (Cards, Forms, Modals) aus EinstellungenView und SpendenQuittungFormView wiederverwenden.

### Einstellungen (`EinstellungenView`)

Neuer Abschnitt "Rechnung (.docx)" für Vorlagen-Upload/Preview (analog zu "Anschreiben (.docx)" und "Spendenquittung (.pdf)").

### App Store

`rechnungsVorlageVorhanden` ref analog zu `quittungsVorlageVorhanden`.

### Navigation

Bereits vorhanden: `/rechnung` in AppSidebar und Router.

## Rechnungsnummer Service

Neue Datei `backend/src/services/rechnungsNummer.ts`, analog zu `quittungsNummer.ts`.

Fortlaufende Nummer pro Jahr, Format `"1 / 2026"`.

## Konfiguration

Neues Verzeichnis in `config.ts`:
```ts
export const RECHNUNGEN_DIR = path.join(DATA_DIR, 'rechnungen');
```

## Tests

- Unit-Test für `rechnungsNummer.ts`
- Integration-Test für `rechnung.ts` Routen
- Integration-Test für Vorlagen-Validierung (RECHNUNG)
- E2E-Test für Rechnungs-Workflow (analog `spendenquittung.spec.ts`)

## Abweichungen von Spendenquittung

- Kein "Mit Anschreiben"-Feature (Rechnung ist ein einzelnes Dokument)
- Kein AdressAnrede-Feld (nur MailAnrede)
- Positionen-Tabelle statt einfachem Betrag
- USt-Auswahl (7%/19%) statt fixer Vereinsdaten
- Rechnungsempfänger statt Spender
- docx-Vorlage statt PDF-Formular
