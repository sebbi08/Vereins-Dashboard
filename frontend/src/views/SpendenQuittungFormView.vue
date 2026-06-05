<script setup lang="ts">
import type { QuittungEingaben, SpenderDto, SystemEinstellungen } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SpenderAutocomplete from '../components/SpenderAutocomplete.vue';
import { useAppStore } from '../stores/app';

const router = useRouter();
const route = useRoute();
const store = useAppStore();

const quittungId = route.params.id ? parseInt(String(route.params.id)) : null;
const istNeueRevision = !!quittungId;

const senden = ref(false);
const fehler = ref('');
const erfolg = ref('');
const warnung = ref('');
const info = ref('');
const stammdatenHinweis = ref(false);

const spender = ref<SpenderDto | null>(null);
const neuerSpender = ref(false);
const validationAttempted = ref(false);

const eingaben = ref<QuittungEingaben>({
  name: '',
  strasse: '',
  ort: '',
  briefAnrede: '',
  adressAnrede: '',
  spendenbetragCents: 0,
  spendendatum: new Date().toISOString().split('T')[0],
  mitAnschreiben: true,
  kassenwart: '',
  gemeinnuetzigerZweck: '',
  finanzamtName: '',
  steuernummer: '',
  freistellungsdatum: '',
  veranlagungszeitraum: '',
});

const betragEuro = ref('');

const briefAnredeFehlt = computed(
  () => eingaben.value.mitAnschreiben && !eingaben.value.briefAnrede.trim(),
);
const zeigeBriefAnredeFehler = computed(() => briefAnredeFehlt.value && validationAttempted.value);

function betragVonEuro(val: string): number {
  const cleaned = val.replace(',', '.').replace(/[^0-9.]/g, '');
  return Math.round(parseFloat(cleaned || '0') * 100);
}

function betragZuEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function normalizeDateInputValue(value: string): string {
  return value.includes('T') ? value.split('T')[0] : value;
}

async function ladeEinstellungen() {
  const res = await fetch('/api/einstellungen');
  if (!res.ok) return;
  const data: Partial<SystemEinstellungen> = await res.json();
  if (data.kassenwart) eingaben.value.kassenwart = data.kassenwart;
  if (data.gemeinnuetzigerZweck) eingaben.value.gemeinnuetzigerZweck = data.gemeinnuetzigerZweck;
  if (data.finanzamtName) eingaben.value.finanzamtName = data.finanzamtName;
  if (data.steuernummer) eingaben.value.steuernummer = data.steuernummer;
  if (data.freistellungsdatum) eingaben.value.freistellungsdatum = data.freistellungsdatum;
  if (data.veranlagungszeitraum) eingaben.value.veranlagungszeitraum = data.veranlagungszeitraum;
}

async function ladeRevisionUndStammdaten() {
  if (!quittungId) return;
  const res = await fetch(`/api/spenden-quittung/${quittungId}`);
  if (!res.ok) return;
  const data = await res.json();

  if (data.aktiveRevision) {
    const e = data.aktiveRevision.eingaben as QuittungEingaben;
    eingaben.value = {
      ...e,
      spendendatum: normalizeDateInputValue(e.spendendatum),
    };
    betragEuro.value = betragZuEuro(e.spendenbetragCents);
  }

  if (data.spender) {
    spender.value = data.spender;
    const vorher = {
      name: eingaben.value.name,
      strasse: eingaben.value.strasse,
      ort: eingaben.value.ort,
      briefAnrede: eingaben.value.briefAnrede,
      adressAnrede: eingaben.value.adressAnrede ?? '',
    };

    eingaben.value.name = data.spender.name;
    eingaben.value.strasse = data.spender.strasse;
    eingaben.value.ort = data.spender.ort;
    eingaben.value.briefAnrede = data.spender.briefAnrede;
    eingaben.value.adressAnrede = data.spender.adressAnrede ?? '';

    stammdatenHinweis.value =
      vorher.name !== eingaben.value.name ||
      vorher.strasse !== eingaben.value.strasse ||
      vorher.ort !== eingaben.value.ort ||
      vorher.briefAnrede !== eingaben.value.briefAnrede ||
      vorher.adressAnrede !== (eingaben.value.adressAnrede ?? '');
  }
}

onMounted(async () => {
  if (store.quittungsVorlageVorhanden === false) {
    router.replace('/spenden-quittung');
    return;
  }
  if (store.quittungsVorlageVorhanden === null) {
    await store.pruefeVorlagen();
    if (!store.quittungsVorlageVorhanden) {
      router.replace('/spenden-quittung');
      return;
    }
  }

  await ladeEinstellungen();
  if (istNeueRevision) {
    await ladeRevisionUndStammdaten();
  }
});

function onSpenderAusgewaehlt(s: SpenderDto | null) {
  spender.value = s;
  if (s) {
    neuerSpender.value = false;
    eingaben.value.name = s.name;
    eingaben.value.strasse = s.strasse;
    eingaben.value.ort = s.ort;
    eingaben.value.briefAnrede = s.briefAnrede;
    eingaben.value.adressAnrede = s.adressAnrede ?? '';
  }
}

function onNeuerSpender(daten: { name: string; strasse: string; ort: string }) {
  neuerSpender.value = true;
  spender.value = null;
  eingaben.value.name = daten.name;
  eingaben.value.strasse = daten.strasse;
  eingaben.value.ort = daten.ort;
  if (!eingaben.value.briefAnrede) {
    eingaben.value.briefAnrede = 'Sehr geehrte Damen und Herren';
  }
}

async function absenden() {
  validationAttempted.value = true;
  fehler.value = '';
  warnung.value = '';
  info.value = '';
  erfolg.value = '';

  if (briefAnredeFehlt.value) {
    fehler.value = 'Bitte BriefAnrede ausfüllen, wenn ein Anschreiben erstellt wird.';
    return;
  }

  senden.value = true;
  eingaben.value.spendenbetragCents = betragVonEuro(betragEuro.value);

  try {
    let res: Response;

    if (istNeueRevision) {
      res = await fetch(`/api/spenden-quittung/${quittungId}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eingaben: eingaben.value }),
      });
    } else {
      const body: Record<string, unknown> = { eingaben: eingaben.value };
      if (spender.value && !neuerSpender.value) {
        body.spenderId = spender.value.id;
      } else {
        body.spenderDaten = {
          name: eingaben.value.name,
          strasse: eingaben.value.strasse,
          ort: eingaben.value.ort,
          briefAnrede: eingaben.value.briefAnrede,
          adressAnrede: eingaben.value.adressAnrede,
        };
      }
      res = await fetch('/api/spenden-quittung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    const result = await res.json();

    if (!res.ok) {
      fehler.value = result.error || 'Unbekannter Fehler';
      return;
    }

    if (result.pdfStatus === 'FAILED') {
      warnung.value = result.pdfFehler || 'PDF konnte nicht erzeugt werden. Bitte Retry versuchen.';
      if (result.spenderUpdated) {
        info.value = 'Spender-Stammdaten wurden aktualisiert.';
      }
    } else {
      erfolg.value = 'Quittung erfolgreich gespeichert.';
      if (result.spenderUpdated) {
        info.value = 'Spender-Stammdaten wurden aktualisiert.';
      }
    }

    const zielId = result.quittungId ?? quittungId;
    setTimeout(() => router.push(`/spenden-quittung/${zielId}`), 1000);
  } catch {
    fehler.value = 'Netzwerkfehler beim Speichern';
  } finally {
    senden.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="text-gray-400 hover:text-gray-700" @click="router.back()">← Zurück</button>
      <h2 class="text-2xl font-bold text-gray-800">
        {{ istNeueRevision ? 'Neue Revision erstellen' : 'Neue Spendenquittung' }}
      </h2>
    </div>

    <div
      v-if="fehler"
      class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ fehler }}
    </div>
    <div
      v-if="warnung"
      class="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg mb-4 text-sm"
    >
      {{ warnung }}
    </div>
    <div
      v-if="info"
      class="bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ info }}
    </div>
    <div
      v-if="erfolg"
      class="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ erfolg }}
    </div>

    <form class="space-y-6" @submit.prevent="absenden">
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Spender</h3>

        <div v-if="!istNeueRevision" class="mb-3">
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Spender suchen oder neu anlegen</label
          >
          <SpenderAutocomplete
            :model-value="spender"
            @update:model-value="onSpenderAusgewaehlt"
            @neu="onNeuerSpender"
          />
        </div>

        <div
          v-if="istNeueRevision && stammdatenHinweis"
          class="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700"
        >
          Diese Revision wurde mit den aktuellen Spender-Stammdaten vorbefüllt.
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="eingaben.name"
              type="text"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Straße</label>
            <input
              v-model="eingaben.strasse"
              type="text"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">PLZ Ort</label>
            <input
              v-model="eingaben.ort"
              type="text"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">BriefAnrede</label>
            <input
              v-model="eingaben.briefAnrede"
              type="text"
              :class="[
                'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                zeigeBriefAnredeFehler
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500',
              ]"
            />
            <p v-if="zeigeBriefAnredeFehler" class="mt-1 text-xs text-red-600">
              BriefAnrede ist erforderlich, wenn ein Anschreiben erstellt wird.
            </p>
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >AdressAnrede (optional)</label
            >
            <input
              v-model="eingaben.adressAnrede"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Spende</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Betrag (€)</label>
            <input
              v-model="betragEuro"
              type="text"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Spendendatum</label>
            <input
              v-model="eingaben.spendendatum"
              type="date"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="flex items-center gap-2 pt-6">
            <input
              id="mitAnschreiben"
              v-model="eingaben.mitAnschreiben"
              type="checkbox"
              class="rounded"
            />
            <label for="mitAnschreiben" class="text-sm text-gray-700">Mit Anschreiben</label>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Vereinsdaten (aus Einstellungen)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Kassenwart</label>
            <input
              v-model="eingaben.kassenwart"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Gemeinnütziger Zweck</label>
            <input
              v-model="eingaben.gemeinnuetzigerZweck"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Finanzamt</label>
            <input
              v-model="eingaben.finanzamtName"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Steuernummer</label>
            <input
              v-model="eingaben.steuernummer"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Datum Freistellungsbescheid</label
            >
            <input
              v-model="eingaben.freistellungsdatum"
              type="date"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Veranlagungszeitraum</label>
            <input
              v-model="eingaben.veranlagungszeitraum"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          @click="router.back()"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          :disabled="senden"
          class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {{
            senden
              ? istNeueRevision
                ? 'Revision wird gespeichert…'
                : 'Wird generiert…'
              : istNeueRevision
                ? 'Revision speichern'
                : 'Quittung erstellen'
          }}
        </button>
      </div>
    </form>
  </div>
</template>
