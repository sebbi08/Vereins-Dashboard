<script setup lang="ts">
import type { SystemEinstellungen, VorlageDto, VorlageTyp } from 'shared';
import { onMounted, ref } from 'vue';

const einstellungen = ref<SystemEinstellungen>({
  kassenwart: '',
  gemeinnuetzigerZweck: '',
  finanzamtName: '',
  steuernummer: '',
  freistellungsdatum: '',
  veranlagungszeitraum: '',
});

const vorlagen = ref<VorlageDto[]>([]);
const speichern = ref(false);
const erfolg = ref('');
const fehler = ref('');
const uploadFehler = ref<Record<string, string>>({});
const uploadErfolg = ref<Record<string, string>>({});

const showVorschauModal = ref(false);
const vorschauLaden = ref(false);
const vorschauFehler = ref('');
const vorschauDataUrl = ref<string | null>(null);
const vorschauObjektUrl = ref<string | null>(null);
const aktuelleVorschauTyp = ref<VorlageTyp | null>(null);
const pendingUploadDateien = ref<Partial<Record<VorlageTyp, File | null>>>({
  ANSCHREIBEN: null,
  QUITTUNG: null,
});

async function ladeEinstellungen() {
  const res = await fetch('/api/einstellungen');
  if (res.ok) {
    const data = await res.json();
    Object.assign(einstellungen.value, data);
  }
}

async function ladeVorlagen() {
  const res = await fetch('/api/vorlagen');
  if (res.ok) vorlagen.value = await res.json();
}

onMounted(async () => {
  await Promise.all([ladeEinstellungen(), ladeVorlagen()]);
});

async function einstellungenSpeichern() {
  speichern.value = true;
  fehler.value = '';
  erfolg.value = '';
  try {
    const res = await fetch('/api/einstellungen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(einstellungen.value),
    });
    if (!res.ok) throw new Error();
    erfolg.value = 'Einstellungen gespeichert';
  } catch {
    fehler.value = 'Fehler beim Speichern';
  } finally {
    speichern.value = false;
  }
}

async function vorlageHochladenDatei(typ: VorlageTyp, datei: File): Promise<boolean> {
  uploadFehler.value[typ] = '';
  uploadErfolg.value[typ] = '';

  const formData = new FormData();
  formData.append('vorlage', datei);

  const res = await fetch(`/api/vorlagen/${typ}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (res.ok) {
    uploadErfolg.value[typ] = 'Vorlage erfolgreich hochgeladen';
    await ladeVorlagen();
    return true;
  }

  const err = await res.json();
  uploadFehler.value[typ] = err.fehlendePflichtfelder
    ? `Fehlende Pflichtfelder: ${err.fehlendePflichtfelder.join(', ')}`
    : err.error || 'Unbekannter Fehler';
  return false;
}

function schliesseVorschauModal() {
  if (aktuelleVorschauTyp.value) {
    pendingUploadDateien.value[aktuelleVorschauTyp.value] = null;
  }
  if (vorschauObjektUrl.value) {
    URL.revokeObjectURL(vorschauObjektUrl.value);
    vorschauObjektUrl.value = null;
  }
  showVorschauModal.value = false;
  vorschauDataUrl.value = null;
  vorschauFehler.value = '';
  aktuelleVorschauTyp.value = null;
}

function hatAktiveVorlage(typ: VorlageTyp): boolean {
  return Boolean(vorlageVonTyp(typ));
}

function hatPendingUpload(typ: VorlageTyp | null): boolean {
  if (!typ) return false;
  return Boolean(pendingUploadDateien.value[typ]);
}

async function zeigeAktuelleVorschau(typ: VorlageTyp) {
  if (!hatAktiveVorlage(typ)) return;

  uploadFehler.value[typ] = '';
  uploadErfolg.value[typ] = '';
  vorschauFehler.value = '';
  vorschauDataUrl.value = null;
  vorschauLaden.value = true;
  aktuelleVorschauTyp.value = typ;
  pendingUploadDateien.value[typ] = null;
  showVorschauModal.value = true;

  if (vorschauObjektUrl.value) {
    URL.revokeObjectURL(vorschauObjektUrl.value);
    vorschauObjektUrl.value = null;
  }

  try {
    const res = await fetch(`/api/vorlagen/preview/${typ}`);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const message = err?.error || 'Keine Vorschau vorhanden';
      vorschauFehler.value = message;
      uploadFehler.value[typ] = message;
      return;
    }

    const blob = await res.blob();
    const objektUrl = URL.createObjectURL(blob);
    vorschauObjektUrl.value = objektUrl;
    vorschauDataUrl.value = objektUrl;
  } catch {
    const message = 'Netzwerkfehler beim Laden der Vorschau';
    vorschauFehler.value = message;
    uploadFehler.value[typ] = message;
  } finally {
    vorschauLaden.value = false;
  }
}

async function vorlagePreview(typ: VorlageTyp, event: Event) {
  const input = event.target as HTMLInputElement;
  const datei = input.files?.[0];
  if (!datei) return;

  uploadFehler.value[typ] = '';
  uploadErfolg.value[typ] = '';
  vorschauFehler.value = '';
  vorschauDataUrl.value = null;
  vorschauLaden.value = true;
  aktuelleVorschauTyp.value = typ;

  try {
    const formData = new FormData();
    formData.append('vorlage', datei);

    const res = await fetch(`/api/vorlagen/${typ}/preview`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      const message = err.fehlendePflichtfelder
        ? `Fehlende Pflichtfelder: ${err.fehlendePflichtfelder.join(', ')}`
        : err.error || 'Vorschau konnte nicht generiert werden';
      vorschauFehler.value = message;
      uploadFehler.value[typ] = message;
      return;
    }

    const result = await res.json();
    vorschauDataUrl.value = `data:application/pdf;base64,${result.data}`;
    pendingUploadDateien.value[typ] = datei;
    showVorschauModal.value = true;
  } catch {
    const message = 'Netzwerkfehler beim Generieren der Vorschau';
    vorschauFehler.value = message;
    uploadFehler.value[typ] = message;
  } finally {
    vorschauLaden.value = false;
    input.value = '';
  }
}

async function speichernUndSchliessen(typ: VorlageTyp) {
  const datei = pendingUploadDateien.value[typ];
  if (!datei) {
    vorschauFehler.value = 'Keine Datei für den Upload vorhanden';
    return;
  }

  vorschauLaden.value = true;
  const success = await vorlageHochladenDatei(typ, datei);
  vorschauLaden.value = false;

  if (success) {
    schliesseVorschauModal();
  }
}

async function speichernAktuelleVorschau() {
  if (!aktuelleVorschauTyp.value) return;
  await speichernUndSchliessen(aktuelleVorschauTyp.value);
}

function vorlageVonTyp(typ: string): VorlageDto | undefined {
  return vorlagen.value.find((v) => v.typ === typ);
}

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-gray-800 mb-6">Spenden Quittung Einstellungen</h2>

    <div
      v-if="fehler"
      class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ fehler }}
    </div>
    <div
      v-if="erfolg"
      class="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ erfolg }}
    </div>

    <!-- Vereinsdaten -->
    <form
      class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6"
      @submit.prevent="einstellungenSpeichern"
    >
      <h3 class="font-semibold text-gray-800 mb-4">Vereinsdaten (Vorausfüllung)</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Kassenwart</label>
          <input
            v-model="einstellungen.kassenwart"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Gemeinnütziger Zweck</label>
          <input
            v-model="einstellungen.gemeinnuetzigerZweck"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Finanzamt</label>
          <input
            v-model="einstellungen.finanzamtName"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Steuernummer</label>
          <input
            v-model="einstellungen.steuernummer"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Datum Freistellungsbescheid</label
          >
          <input
            v-model="einstellungen.freistellungsdatum"
            type="date"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Veranlagungszeitraum</label>
          <input
            v-model="einstellungen.veranlagungszeitraum"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <button
          type="submit"
          :disabled="speichern"
          class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {{ speichern ? 'Wird gespeichert…' : 'Speichern' }}
        </button>
      </div>
    </form>

    <!-- Vorlagen -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 class="font-semibold text-gray-800 mb-4">Vorlagen</h3>
      <div class="space-y-4">
        <div
          v-for="typ in ['ANSCHREIBEN', 'QUITTUNG'] as const"
          :key="typ"
          class="border border-gray-200 rounded-lg p-4"
        >
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="font-medium text-gray-800 text-sm">
                {{ typ === 'ANSCHREIBEN' ? 'Anschreiben (.docx)' : 'Spendenquittung (.pdf)' }}
              </p>
              <p v-if="vorlageVonTyp(typ)" class="text-xs text-gray-500">
                Version {{ vorlageVonTyp(typ)!.version }} · hochgeladen am
                {{ formatDatum(vorlageVonTyp(typ)!.hochgeladenAm) }}
              </p>
              <p v-else class="text-xs text-orange-500">Keine Vorlage hinterlegt</p>
            </div>
            <a
              v-if="vorlageVonTyp(typ)"
              :href="`/api/vorlagen/${typ}/download`"
              class="text-blue-600 hover:underline text-sm"
            >
              Herunterladen
            </a>
          </div>
          <div v-if="uploadFehler[typ]" class="text-red-600 text-xs mb-2">
            {{ uploadFehler[typ] }}
          </div>
          <div v-if="uploadErfolg[typ]" class="text-green-600 text-xs mb-2">
            {{ uploadErfolg[typ] }}
          </div>
          <label class="cursor-pointer">
            <span
              class="inline-block border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50"
            >
              Neue Vorlage hochladen
            </span>
            <input
              type="file"
              class="hidden"
              :accept="typ === 'ANSCHREIBEN' ? '.docx' : '.pdf'"
              @change="vorlagePreview(typ, $event)"
            />
          </label>
          <button
            type="button"
            class="ml-2 inline-block border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!hatAktiveVorlage(typ)"
            @click="zeigeAktuelleVorschau(typ)"
          >
            Aktuelle Vorschau anzeigen
          </button>
          <p v-if="!hatAktiveVorlage(typ)" class="mt-2 text-xs text-orange-500">
            Keine aktive Vorlage vorhanden
          </p>
        </div>
      </div>
    </div>

    <div
      v-if="showVorschauModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h3 class="text-lg font-semibold text-gray-800">
            {{
              aktuelleVorschauTyp === 'ANSCHREIBEN' ? 'Anschreiben Vorschau' : 'Quittung Vorschau'
            }}
          </h3>
          <button @click="schliesseVorschauModal" class="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>

        <div class="p-6 overflow-auto">
          <div v-if="vorschauLaden" class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span class="ml-3 text-gray-600">Vorschau wird generiert...</span>
          </div>

          <div
            v-if="vorschauFehler"
            class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700"
          >
            {{ vorschauFehler }}
          </div>

          <iframe
            v-if="vorschauDataUrl && !vorschauFehler"
            :src="vorschauDataUrl"
            class="w-full h-[600px] border rounded-lg"
            title="Vorlagen Vorschau"
          ></iframe>

          <div
            v-else-if="!vorschauLaden && !vorschauFehler"
            class="text-center text-gray-500 py-12"
          >
            Keine Vorschau verfügbar
          </div>
        </div>

        <div
          v-if="vorschauDataUrl && !vorschauFehler && hatPendingUpload(aktuelleVorschauTyp)"
          class="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50"
        >
          <button
            @click="schliesseVorschauModal"
            class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Schließen
          </button>
          <button
            :disabled="vorschauLaden || !aktuelleVorschauTyp"
            @click="speichernAktuelleVorschau"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Vorlage speichern
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
