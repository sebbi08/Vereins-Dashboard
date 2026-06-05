<script setup lang="ts">
import type { VorlageDto } from 'shared';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const vorlage = ref<VorlageDto | null>(null);
const uploadFehler = ref('');
const uploadErfolg = ref('');

const showVorschauModal = ref(false);
const vorschauLaden = ref(false);
const vorschauFehler = ref('');
const vorschauDataUrl = ref<string | null>(null);
const vorschauObjektUrl = ref<string | null>(null);
const pendingUploadDatei = ref<File | null>(null);

async function ladeVorlage() {
  const res = await fetch('/api/vorlagen');
  if (res.ok) {
    const vorlagen: VorlageDto[] = await res.json();
    vorlage.value = vorlagen.find((v) => v.typ === 'RECHNUNG') ?? null;
  }
}

onMounted(ladeVorlage);

async function vorlageHochladen(datei: File): Promise<boolean> {
  uploadFehler.value = '';
  uploadErfolg.value = '';

  const formData = new FormData();
  formData.append('vorlage', datei);

  const res = await fetch('/api/vorlagen/RECHNUNG/upload', {
    method: 'POST',
    body: formData,
  });

  if (res.ok) {
    uploadErfolg.value = 'Vorlage erfolgreich hochgeladen';
    await ladeVorlage();
    return true;
  }

  const err = await res.json();
  uploadFehler.value = err.fehlendePflichtfelder
    ? `Fehlende Pflichtfelder: ${err.fehlendePflichtfelder.join(', ')}`
    : err.error || 'Unbekannter Fehler';
  return false;
}

function schliesseVorschauModal() {
  pendingUploadDatei.value = null;
  if (vorschauObjektUrl.value) {
    URL.revokeObjectURL(vorschauObjektUrl.value);
    vorschauObjektUrl.value = null;
  }
  showVorschauModal.value = false;
  vorschauDataUrl.value = null;
  vorschauFehler.value = '';
}

async function zeigeAktuelleVorschau() {
  if (!vorlage.value) return;

  uploadFehler.value = '';
  uploadErfolg.value = '';
  vorschauFehler.value = '';
  vorschauDataUrl.value = null;
  vorschauLaden.value = true;
  pendingUploadDatei.value = null;
  showVorschauModal.value = true;

  if (vorschauObjektUrl.value) {
    URL.revokeObjectURL(vorschauObjektUrl.value);
    vorschauObjektUrl.value = null;
  }

  try {
    const res = await fetch('/api/vorlagen/preview/RECHNUNG');
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const message = err?.error || 'Keine Vorschau vorhanden';
      vorschauFehler.value = message;
      uploadFehler.value = message;
      return;
    }

    const blob = await res.blob();
    const objektUrl = URL.createObjectURL(blob);
    vorschauObjektUrl.value = objektUrl;
    vorschauDataUrl.value = objektUrl;
  } catch {
    const message = 'Netzwerkfehler beim Laden der Vorschau';
    vorschauFehler.value = message;
    uploadFehler.value = message;
  } finally {
    vorschauLaden.value = false;
  }
}

async function vorlagePreview(event: Event) {
  const input = event.target as HTMLInputElement;
  const datei = input.files?.[0];
  if (!datei) return;

  uploadFehler.value = '';
  uploadErfolg.value = '';
  vorschauFehler.value = '';
  vorschauDataUrl.value = null;
  vorschauLaden.value = true;

  try {
    const formData = new FormData();
    formData.append('vorlage', datei);

    const res = await fetch('/api/vorlagen/RECHNUNG/preview', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      const message = err.fehlendePflichtfelder
        ? `Fehlende Pflichtfelder: ${err.fehlendePflichtfelder.join(', ')}`
        : err.error || 'Vorschau konnte nicht generiert werden';
      vorschauFehler.value = message;
      uploadFehler.value = message;
      return;
    }

    const result = await res.json();
    vorschauDataUrl.value = `data:application/pdf;base64,${result.data}`;
    pendingUploadDatei.value = datei;
    showVorschauModal.value = true;
  } catch {
    const message = 'Netzwerkfehler beim Generieren der Vorschau';
    vorschauFehler.value = message;
    uploadFehler.value = message;
  } finally {
    vorschauLaden.value = false;
    input.value = '';
  }
}

async function speichereVorschau() {
  const datei = pendingUploadDatei.value;
  if (!datei) {
    vorschauFehler.value = 'Keine Datei für den Upload vorhanden';
    return;
  }

  vorschauLaden.value = true;
  const success = await vorlageHochladen(datei);
  vorschauLaden.value = false;

  if (success) {
    schliesseVorschauModal();
  }
}

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="text-gray-400 hover:text-gray-700" @click="router.back()">← Zurück</button>
      <h2 class="text-2xl font-bold text-gray-800">Rechnung Einstellungen</h2>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 class="font-semibold text-gray-800 mb-4">Rechnungsvorlage</h3>

      <div class="border border-gray-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-2">
          <div>
            <p class="font-medium text-gray-800 text-sm">Rechnung (.docx)</p>
            <p v-if="vorlage" class="text-xs text-gray-500">
              Version {{ vorlage.version }} · hochgeladen am
              {{ formatDatum(vorlage.hochgeladenAm) }}
            </p>
            <p v-else class="text-xs text-orange-500">Keine Vorlage hinterlegt</p>
          </div>
          <a
            v-if="vorlage"
            :href="'/api/vorlagen/RECHNUNG/download'"
            class="text-blue-600 hover:underline text-sm"
          >
            Herunterladen
          </a>
        </div>
        <div v-if="uploadFehler" class="text-red-600 text-xs mb-2">
          {{ uploadFehler }}
        </div>
        <div v-if="uploadErfolg" class="text-green-600 text-xs mb-2">
          {{ uploadErfolg }}
        </div>
        <label class="cursor-pointer">
          <span
            class="inline-block border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50"
          >
            Neue Vorlage hochladen
          </span>
          <input type="file" class="hidden" accept=".docx" @change="vorlagePreview($event)" />
        </label>
        <button
          type="button"
          class="ml-2 inline-block border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!vorlage"
          @click="zeigeAktuelleVorschau()"
        >
          Aktuelle Vorschau anzeigen
        </button>
        <p v-if="!vorlage" class="mt-2 text-xs text-orange-500">Keine aktive Vorlage vorhanden</p>
      </div>
    </div>

    <div
      v-if="showVorschauModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h3 class="text-lg font-semibold text-gray-800">Rechnung Vorschau</h3>
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
          v-if="vorschauDataUrl && !vorschauFehler && pendingUploadDatei"
          class="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50"
        >
          <button
            @click="schliesseVorschauModal"
            class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Schließen
          </button>
          <button
            :disabled="vorschauLaden"
            @click="speichereVorschau"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Vorlage speichern
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
