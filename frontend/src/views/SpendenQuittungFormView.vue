<script setup lang="ts">
import type { QuittungEingaben, SpenderDto, SystemEinstellungen } from 'shared';
import { onMounted, ref } from 'vue';
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

const spender = ref<SpenderDto | null>(null);
const neuerSpender = ref(false);

const eingaben = ref<QuittungEingaben>({
  anrede: '',
  name: '',
  strasse: '',
  ort: '',
  spendenbetragCents: 0,
  spendendatum: new Date().toISOString().split('T')[0],
  mitAnschreiben: true,
  zahlungsweg: 'BANK',
  kassenwart: '',
  gemeinnuetzigerZweck: '',
  finanzamtName: '',
  steuernummer: '',
  freistellungsdatum: '',
  veranlagungszeitraum: '',
});

const betragEuro = ref('');

function betragVonEuro(val: string): number {
  const cleaned = val.replace(',', '.').replace(/[^0-9.]/g, '');
  return Math.round(parseFloat(cleaned || '0') * 100);
}

function betragZuEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
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

async function ladeAktiveRevision() {
  if (!quittungId) return;
  const res = await fetch(`/api/spenden-quittung/${quittungId}`);
  if (!res.ok) return;
  const data = await res.json();
  if (data.aktiveRevision) {
    const e = data.aktiveRevision.eingaben as QuittungEingaben;
    eingaben.value = { ...e };
    betragEuro.value = betragZuEuro(e.spendenbetragCents);
    if (data.spender) {
      spender.value = data.spender;
    }
  }
}

onMounted(async () => {
  // Redirect zurück zur Liste wenn keine aktive Quittungs-Vorlage hinterlegt ist
  if (store.quittungsVorlageVorhanden === false) {
    router.replace('/spenden-quittung');
    return;
  }
  // Falls der Store noch nicht geprüft hat (z.B. direkter URL-Aufruf), jetzt prüfen
  if (store.quittungsVorlageVorhanden === null) {
    await store.pruefeVorlagen();
    if (!store.quittungsVorlageVorhanden) {
      router.replace('/spenden-quittung');
      return;
    }
  }
  await ladeEinstellungen();
  if (istNeueRevision) {
    await ladeAktiveRevision();
  }
});

function onSpenderAusgewaehlt(s: SpenderDto | null) {
  spender.value = s;
  if (s) {
    neuerSpender.value = false;
    eingaben.value.anrede = s.anrede;
    eingaben.value.name = s.name;
    eingaben.value.strasse = s.strasse;
    eingaben.value.ort = s.ort;
  }
}

function onNeuerSpender(daten: { anrede: string; name: string; strasse: string; ort: string }) {
  neuerSpender.value = true;
  spender.value = null;
  eingaben.value.anrede = daten.anrede;
  eingaben.value.name = daten.name;
  eingaben.value.strasse = daten.strasse;
  eingaben.value.ort = daten.ort;
}

async function absenden() {
  fehler.value = '';
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
          anrede: eingaben.value.anrede,
          name: eingaben.value.name,
          strasse: eingaben.value.strasse,
          ort: eingaben.value.ort,
        };
      }
      res = await fetch('/api/spenden-quittung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    if (!res.ok) {
      const err = await res.json();
      fehler.value = err.error || 'Unbekannter Fehler';
      return;
    }

    const result = await res.json();
    erfolg.value = 'Quittung erfolgreich erstellt!';
    const zielId = result.quittungId ?? quittungId;
    setTimeout(() => router.push(`/spenden-quittung/${zielId}`), 800);
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
      v-if="erfolg"
      class="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ erfolg }}
    </div>

    <form class="space-y-6" @submit.prevent="absenden">
      <!-- Spender -->
      <div v-if="!istNeueRevision" class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Spender</h3>
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Spender suchen oder neu anlegen</label
          >
          <SpenderAutocomplete
            :model-value="spender"
            @update:model-value="onSpenderAusgewaehlt"
            @neu="onNeuerSpender"
          />
        </div>
        <div v-if="neuerSpender || spender" class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Anrede</label>
            <select
              v-model="eingaben.anrede"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Ohne</option>
              <option value="Herr">Herr</option>
              <option value="Frau">Frau</option>
            </select>
          </div>
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
              placeholder="67105 Schifferstadt"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- Spende -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Spende</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Betrag (€)</label>
            <input
              v-model="betragEuro"
              type="text"
              required
              placeholder="100,00"
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
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Zahlungsweg</label>
            <select
              v-model="eingaben.zahlungsweg"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="BANK">Banküberweisung</option>
              <option value="BAR">Bar</option>
            </select>
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

      <!-- Vereinsdaten -->
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
              placeholder="2021–2023"
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
          {{ senden ? 'Wird generiert…' : 'Quittung erstellen' }}
        </button>
      </div>
    </form>
  </div>
</template>
