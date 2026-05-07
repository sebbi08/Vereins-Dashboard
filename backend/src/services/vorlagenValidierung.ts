import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import type { VorlageTyp, VorlagenValidierungsfehler } from 'shared';

const PFLICHTFELDER_ANSCHREIBEN: Array<string | string[]> = [
  ['BriefAnrede', 'briefAnrede'],
  'Name',
  'Strasse',
  'Ort',
  'Heute',
  'Betrag',
  'TagDerZuwendung',
  'Kassenwart',
];

const PFLICHTFELDER_QUITTUNG = [
  'Name',
  'Betrag',
  'BetragInBuchstaben',
  'TagDerZuwendung',
  'Zweck',
  'Steuer Nr',
  'SteuerNrDatum',
  'VeranlagungsZeitraum',
];

export function validiereAnschreibenVorlage(buffer: Buffer): VorlagenValidierungsfehler | null {
  const zip = new PizZip(buffer);
  const docXml = zip.files['word/document.xml']?.asText() ?? '';

  const fehlend = PFLICHTFELDER_ANSCHREIBEN.filter((pflichtfeld) => {
    if (Array.isArray(pflichtfeld)) {
      return !pflichtfeld.some((variante) => docXml.includes(variante));
    }
    return !docXml.includes(pflichtfeld);
  }).map((pflichtfeld) => (Array.isArray(pflichtfeld) ? pflichtfeld[0] : pflichtfeld));

  if (fehlend.length > 0) {
    return { typ: 'ANSCHREIBEN', fehlendePflichtfelder: fehlend };
  }
  return null;
}

export async function validiereQuittungsVorlage(
  buffer: Buffer,
): Promise<VorlagenValidierungsfehler | null> {
  const pdfDoc = await PDFDocument.load(buffer);
  const form = pdfDoc.getForm();
  const vorhandeneFelder = form.getFields().map((f) => f.getName());

  const fehlend = PFLICHTFELDER_QUITTUNG.filter((p) => !vorhandeneFelder.includes(p));

  if (fehlend.length > 0) {
    return { typ: 'QUITTUNG', fehlendePflichtfelder: fehlend };
  }
  return null;
}

export async function validiereVorlage(
  typ: VorlageTyp,
  buffer: Buffer,
): Promise<VorlagenValidierungsfehler | null> {
  if (typ === 'ANSCHREIBEN') {
    return validiereAnschreibenVorlage(buffer);
  }
  return validiereQuittungsVorlage(buffer);
}
