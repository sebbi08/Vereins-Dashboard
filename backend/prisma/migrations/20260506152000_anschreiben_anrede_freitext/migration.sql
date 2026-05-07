-- Optionaler Freitext für die Anrede im Anschreiben (z.B. Ansprechpartner bei Firmen)
ALTER TABLE "SpendenQuittungRevision"
ADD COLUMN "anschreibenAnredeFreitext" TEXT;
