<script setup lang="ts">
import type { SystemEinstellungen, VorlageDto } from 'shared';
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

async function vorlageHochladen(typ: 'ANSCHREIBEN' | 'QUITTUNG', event: Event) {
  const input = event.target as HTMLInputElement;
  const datei = input.files?.[0];
  if (!datei) return;

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
  } else {
    const err = await res.json();
    uploadFehler.value[typ] =
      err.fehlendePflichtfelder
        ? `Fehlende Pflichtfelder: ${err.fehlendePflichtfelder.join(', ')}`
        : err.error || 'Unbekannter Fehler';
  }

  input.value = '';
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
    <h2 class="text-2xl font-bold text-gray-800 mb-6">Einstellungen</h2>

    <div v-if="fehler" class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">{{ fehler }}</div>
    <div v-if="erfolg" class="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg mb-4 text-sm">{{ erfolg }}</div>

    <!-- Vereinsdaten -->
    <form class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6" @submit.prevent="einstellungenSpeichern">
      <h3 class="font-semibold text-gray-800 mb-4">Vereinsdaten (Vorausfüllung)</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Kassenwart</label>
          <input v-model="einstellungen.kassenwart" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Gemeinnütziger Zweck</label>
          <input v-model="einstellungen.gemeinnuetzigerZweck" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Finanzamt</label>
          <input v-model="einstellungen.finanzamtName" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Steuernummer</label>
          <input v-model="einstellungen.steuernummer" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Datum Freistellungsbescheid</label>
          <input v-model="einstellungen.freistellungsdatum" type="text" placeholder="01.01.2024" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Veranlagungszeitraum</label>
          <input v-model="einstellungen.veranlagungszeitraum" type="text" placeholder="2021–2023" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
        <div v-for="typ in ['ANSCHREIBEN', 'QUITTUNG'] as const" :key="typ" class="border border-gray-200 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="font-medium text-gray-800 text-sm">{{ typ === 'ANSCHREIBEN' ? 'Anschreiben (.docx)' : 'Spendenquittung (.pdf)' }}</p>
              <p v-if="vorlageVonTyp(typ)" class="text-xs text-gray-500">
                Version {{ vorlageVonTyp(typ)!.version }} · hochgeladen am {{ formatDatum(vorlageVonTyp(typ)!.hochgeladenAm) }}
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
          <div v-if="uploadFehler[typ]" class="text-red-600 text-xs mb-2">{{ uploadFehler[typ] }}</div>
          <div v-if="uploadErfolg[typ]" class="text-green-600 text-xs mb-2">{{ uploadErfolg[typ] }}</div>
          <label class="cursor-pointer">
            <span class="inline-block border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50">
              Neue Vorlage hochladen
            </span>
            <input
              type="file"
              class="hidden"
              :accept="typ === 'ANSCHREIBEN' ? '.docx' : '.pdf'"
              @change="vorlageHochladen(typ, $event)"
            />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
