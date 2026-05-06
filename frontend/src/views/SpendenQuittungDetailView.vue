<script setup lang="ts">
import type { SpendenQuittungDto } from 'shared';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const id = parseInt(String(route.params.id));

const quittung = ref<SpendenQuittungDto | null>(null);
const laden = ref(false);
const fehler = ref('');
const stornierBestaetigung = ref(false);

async function ladeQuittung() {
  laden.value = true;
  try {
    const res = await fetch(`/api/spenden-quittung/${id}`);
    if (!res.ok) throw new Error();
    quittung.value = await res.json();
  } catch {
    fehler.value = 'Quittung konnte nicht geladen werden';
  } finally {
    laden.value = false;
  }
}

async function stornieren() {
  const res = await fetch(`/api/spenden-quittung/${id}/stornieren`, { method: 'PATCH' });
  if (res.ok) {
    stornierBestaetigung.value = false;
    await ladeQuittung();
  }
}

onMounted(ladeQuittung);

function formatBetrag(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="text-gray-400 hover:text-gray-700" @click="router.push('/spenden-quittung')">
        ← Zurück
      </button>
      <h2 class="text-2xl font-bold text-gray-800">Quittung Details</h2>
    </div>

    <div v-if="fehler" class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">{{ fehler }}</div>
    <div v-if="laden" class="text-gray-400 text-sm">Lädt…</div>

    <template v-if="quittung">
      <!-- Header -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-4">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <span class="font-mono text-lg font-bold text-gray-800">{{ quittung.nummer }}</span>
              <span
                :class="[
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  quittung.status === 'AKTIV' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                ]"
              >{{ quittung.status }}</span>
            </div>
            <p class="text-gray-600 text-sm">{{ quittung.spender.anrede }} {{ quittung.spender.name }}</p>
            <p class="text-gray-500 text-xs">{{ quittung.spender.strasse }}, {{ quittung.spender.ort }}</p>
          </div>
          <div class="flex gap-2">
            <button
              v-if="quittung.status === 'AKTIV'"
              class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              @click="router.push(`/spenden-quittung/${id}/revision`)"
            >
              Neue Revision
            </button>
            <button
              v-if="quittung.status === 'AKTIV'"
              class="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50"
              @click="stornierBestaetigung = true"
            >
              Stornieren
            </button>
          </div>
        </div>
      </div>

      <!-- Stornieren Bestätigung -->
      <div v-if="stornierBestaetigung" class="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
        <p class="text-sm text-red-700 mb-3">Quittung <strong>{{ quittung.nummer }}</strong> wirklich stornieren? Diese Aktion kann nicht rückgängig gemacht werden.</p>
        <div class="flex gap-2">
          <button class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm" @click="stornieren">Ja, stornieren</button>
          <button class="border border-gray-300 px-4 py-2 rounded-lg text-sm" @click="stornierBestaetigung = false">Abbrechen</button>
        </div>
      </div>

      <!-- Revisionshistorie -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100">
          <h3 class="font-semibold text-gray-800">Revisionen</h3>
        </div>
        <div v-for="rev in quittung.revisionen" :key="rev.id" class="border-b border-gray-100 last:border-0 p-6">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-800">R{{ rev.revisionNummer }}</span>
              <span
                :class="[
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  rev.status === 'AKTIV' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400',
                ]"
              >{{ rev.status }}</span>
              <span class="text-xs text-gray-400">{{ formatDateTime(rev.erstelltAm) }}</span>
            </div>
            <a
              v-if="rev.dateiPfad"
              :href="`/api/spenden-quittung/revision/${rev.id}/download`"
              target="_blank"
              class="text-blue-600 hover:underline text-sm"
            >
              PDF herunterladen
            </a>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span class="text-gray-500 text-xs">Betrag</span>
              <p class="font-medium text-gray-800">{{ formatBetrag(rev.eingaben.spendenbetragCents) }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Spendendatum</span>
              <p class="text-gray-700">{{ formatDatum(rev.eingaben.spendendatum) }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Zahlungsweg</span>
              <p class="text-gray-700">{{ rev.eingaben.zahlungsweg === 'BANK' ? 'Banküberweisung' : 'Bar' }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Mit Anschreiben</span>
              <p class="text-gray-700">{{ rev.eingaben.mitAnschreiben ? 'Ja' : 'Nein' }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Kassenwart</span>
              <p class="text-gray-700">{{ rev.eingaben.kassenwart }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Finanzamt</span>
              <p class="text-gray-700">{{ rev.eingaben.finanzamtName }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Steuernummer</span>
              <p class="text-gray-700">{{ rev.eingaben.steuernummer }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs">Veranlagungszeitraum</span>
              <p class="text-gray-700">{{ rev.eingaben.veranlagungszeitraum }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
