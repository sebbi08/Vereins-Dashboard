<script setup lang="ts">
import type { SpendenQuittungListItem } from 'shared';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';

const router = useRouter();
const store = useAppStore();
const quittungen = ref<SpendenQuittungListItem[]>([]);
const laden = ref(false);
const fehler = ref('');

const search = ref('');
const vonDatum = ref('');
const bisDatum = ref('');
const mitStorniert = ref(false);

async function laden_() {
  laden.value = true;
  fehler.value = '';
  try {
    const params = new URLSearchParams();
    if (search.value) params.set('search', search.value);
    if (vonDatum.value) params.set('vonDatum', vonDatum.value);
    if (bisDatum.value) params.set('bisDatum', bisDatum.value);
    if (mitStorniert.value) params.set('mitStorniert', 'true');
    const res = await fetch(`/api/spenden-quittung?${params}`);
    quittungen.value = await res.json();
  } catch {
    fehler.value = 'Fehler beim Laden der Quittungen';
  } finally {
    laden.value = false;
  }
}

onMounted(laden_);

let debounce: ReturnType<typeof setTimeout>;
function onSearchInput() {
  clearTimeout(debounce);
  debounce = setTimeout(laden_, 350);
}

function formatBetrag(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}

const anzahlGesamt = computed(() => quittungen.value.length);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6 gap-3">
      <h2 class="text-2xl font-bold text-gray-800">Spenden Quittungen</h2>
      <div class="flex items-center gap-2">
        <button
          class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          @click="router.push('/spenden-quittung/einstellungen')"
        >
          Einstellungen
        </button>
        <button
          :disabled="!store.quittungsVorlageVorhanden"
          :title="
            !store.quittungsVorlageVorhanden
              ? 'Bitte zuerst eine Vorlage in den Einstellungen hochladen'
              : undefined
          "
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="router.push('/spenden-quittung/neu')"
        >
          + Neue Quittung
        </button>
      </div>
    </div>

    <!-- Vorlage fehlt Banner -->
    <div
      v-if="store.quittungsVorlageVorhanden === false"
      class="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"
    >
      <span class="mt-0.5 text-lg leading-none">⚠️</span>
      <span>
        Keine Spendenquittungs-Vorlage hinterlegt. Bitte zuerst eine Vorlage hochladen, bevor
        Quittungen erstellt werden können.
        <router-link
          to="/spenden-quittung/einstellungen"
          class="ml-1 font-medium underline hover:text-amber-900"
        >
          >Zu den Einstellungen →</router-link
        >
      </span>
    </div>

    <!-- Filter -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          v-model="search"
          type="text"
          placeholder="Suche nach Name oder Nummer…"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 col-span-2"
          @input="onSearchInput"
        />
        <input
          v-model="vonDatum"
          type="date"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="laden_"
        />
        <input
          v-model="bisDatum"
          type="date"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="laden_"
        />
      </div>
      <div class="mt-2 flex items-center gap-2">
        <input
          id="mitStorniert"
          v-model="mitStorniert"
          type="checkbox"
          class="rounded"
          @change="laden_"
        />
        <label for="mitStorniert" class="text-sm text-gray-600">Stornierte anzeigen</label>
        <span class="ml-auto text-sm text-gray-500">{{ anzahlGesamt }} Einträge</span>
      </div>
    </div>

    <!-- Fehler -->
    <div
      v-if="fehler"
      class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm"
    >
      {{ fehler }}
    </div>

    <!-- Tabelle -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div v-if="laden" class="p-8 text-center text-gray-400 text-sm">Lädt…</div>
      <div v-else-if="quittungen.length === 0" class="p-8 text-center text-gray-400 text-sm">
        Keine Quittungen gefunden.
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th class="text-left px-4 py-3 font-medium text-gray-600">Nummer</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Spender</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Betrag</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Spendendatum</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Rev.</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="q in quittungen"
            :key="q.id"
            class="border-b border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <td class="px-4 py-3 font-mono text-xs font-medium text-gray-800">{{ q.nummer }}</td>
            <td class="px-4 py-3 text-gray-700">{{ q.spenderName }}</td>
            <td class="px-4 py-3 text-right font-medium text-gray-800">
              {{ formatBetrag(q.spendenbetragCents) }}
            </td>
            <td class="px-4 py-3 text-gray-600">{{ formatDatum(q.spendendatum) }}</td>
            <td class="px-4 py-3 text-gray-500">R{{ q.aktiveRevisionNummer ?? '–' }}</td>
            <td class="px-4 py-3">
              <span
                :class="[
                  'inline-block text-xs font-medium px-2 py-0.5 rounded-full',
                  q.status === 'AKTIV'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500',
                ]"
              >
                {{ q.status }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <button
                class="text-blue-600 hover:underline text-xs"
                @click="router.push(`/spenden-quittung/${q.id}`)"
              >
                Details
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
