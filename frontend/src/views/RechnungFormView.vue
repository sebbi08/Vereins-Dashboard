<script setup lang="ts">
import type { RechnungEingaben, RechnungsempfaengerDto } from 'shared';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';

const router = useRouter();
const route = useRoute();
const store = useAppStore();

const rechnungId = route.params.id ? parseInt(String(route.params.id)) : null;
const istNeueRevision = !!rechnungId;

const senden = ref(false);
const fehler = ref('');
const warnung = ref('');
const info = ref('');
const erfolg = ref('');

const empfaenger = ref<RechnungsempfaengerDto | null>(null);
const neuerEmpfaenger = ref(false);
const empfaengerSuche = ref('');
const empfaengerVorschlaege = ref<RechnungsempfaengerDto[]>([]);
const empfaengerLaden = ref(false);

const eingaben = ref<RechnungEingaben>({
  anrede: '',
  name: '',
  strasse: '',
  ort: '',
  rechnungsdatum: new Date().toISOString().split('T')[0],
  title: '',
  positionen: [{ text: '', priceInCents: 0 }],
  ust: 19,
  einzug: false,
  email: '',
  mailAnrede: 'Sehr geehrte Damen und Herren',
});

let debounceTimer: ReturnType<typeof setTimeout>;
async function sucheEmpfaenger() {
  clearTimeout(debounceTimer);
  if (!empfaengerSuche.value.trim()) {
    empfaengerVorschlaege.value = [];
    return;
  }
  debounceTimer = setTimeout(async () => {
    empfaengerLaden.value = true;
    try {
      const res = await fetch(
        `/api/rechnung/empfaenger?search=${encodeURIComponent(empfaengerSuche.value)}`,
      );
      if (res.ok) empfaengerVorschlaege.value = await res.json();
    } finally {
      empfaengerLaden.value = false;
    }
  }, 300);
}

function waehleEmpfaenger(e: RechnungsempfaengerDto) {
  empfaenger.value = e;
  neuerEmpfaenger.value = false;
  empfaengerSuche.value = e.name;
  empfaengerVorschlaege.value = [];
  eingaben.value.name = e.name;
  eingaben.value.strasse = e.strasse;
  eingaben.value.ort = e.ort;
  eingaben.value.email = e.email ?? '';
  eingaben.value.anrede = e.anrede ?? '';
}

function positionHinzufuegen() {
  eingaben.value.positionen.push({ text: '', priceInCents: 0 });
}

function positionEntfernen(index: number) {
  if (eingaben.value.positionen.length > 1) {
    eingaben.value.positionen.splice(index, 1);
  }
}

function preisZuCentString(index: number): string {
  const cents = eingaben.value.positionen[index].priceInCents;
  return cents ? String(cents) : '';
}

function preisVonCentString(index: number, value: string) {
  const cleaned = value.replace(/[^0-9]/g, '');
  eingaben.value.positionen[index].priceInCents = parseInt(cleaned || '0', 10);
}

const brutto = ref('0,00');
function updateBrutto() {
  const netto = eingaben.value.positionen.reduce((sum, p) => sum + p.priceInCents, 0);
  const steuer = Math.round(netto * (eingaben.value.ust / 100));
  const total = (netto + steuer) / 100;
  brutto.value = total.toFixed(2).replace('.', ',');
}

async function ladeRevision() {
  if (!rechnungId) return;
  const res = await fetch(`/api/rechnung/${rechnungId}`);
  if (!res.ok) return;
  const data = await res.json();

  if (data.aktiveRevision) {
    const e = data.aktiveRevision.eingaben as RechnungEingaben;
    eingaben.value = {
      ...e,
      rechnungsdatum: e.rechnungsdatum.includes('T')
        ? e.rechnungsdatum.split('T')[0]
        : e.rechnungsdatum,
    };
  }

  if (data.empfaenger) {
    empfaenger.value = data.empfaenger;
    empfaengerSuche.value = data.empfaenger.name;
  }
}

onMounted(async () => {
  if (store.rechnungsVorlageVorhanden === false) {
    router.replace('/rechnung');
    return;
  }
  if (store.rechnungsVorlageVorhanden === null) {
    await store.pruefeVorlagen();
    if (!store.rechnungsVorlageVorhanden) {
      router.replace('/rechnung');
      return;
    }
  }

  if (istNeueRevision) {
    await ladeRevision();
  }
  updateBrutto();
});

async function absenden() {
  fehler.value = '';
  warnung.value = '';
  info.value = '';
  erfolg.value = '';

  if (!eingaben.value.name.trim()) {
    fehler.value = 'Name ist erforderlich';
    return;
  }
  if (!eingaben.value.title.trim()) {
    fehler.value = 'Titel ist erforderlich';
    return;
  }
  if (eingaben.value.positionen.some((p) => !p.text.trim())) {
    fehler.value = 'Alle Positionen benötigen einen Text';
    return;
  }

  senden.value = true;

  try {
    let res: Response;

    if (istNeueRevision) {
      res = await fetch(`/api/rechnung/${rechnungId}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eingaben: eingaben.value }),
      });
    } else {
      const body: Record<string, unknown> = { eingaben: eingaben.value };
      if (empfaenger.value && !neuerEmpfaenger.value) {
        body.empfaengerId = empfaenger.value.id;
      } else {
        body.empfaengerDaten = {
          name: eingaben.value.name,
          strasse: eingaben.value.strasse,
          ort: eingaben.value.ort,
          email: eingaben.value.email,
          anrede: eingaben.value.anrede,
        };
      }
      res = await fetch('/api/rechnung', {
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
      warnung.value = result.pdfFehler || 'PDF konnte nicht erzeugt werden.';
    } else {
      erfolg.value = 'Rechnung erfolgreich gespeichert.';
    }

    const zielId = result.rechnungId ?? rechnungId;
    setTimeout(() => router.push(`/rechnung/${zielId}`), 1000);
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
        {{ istNeueRevision ? 'Neue Revision erstellen' : 'Neue Rechnung' }}
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
      <!-- Empfänger -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Briefkopf / Empfänger</h3>

        <div v-if="!istNeueRevision" class="mb-3 relative">
          <label class="block text-sm font-medium text-gray-700 mb-1"
            >Empfänger suchen oder neu anlegen</label
          >
          <input
            v-model="empfaengerSuche"
            type="text"
            placeholder="Name eingeben…"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            @input="sucheEmpfaenger()"
            @focus="sucheEmpfaenger()"
          />
          <div
            v-if="empfaengerVorschlaege.length > 0"
            class="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-auto"
          >
            <button
              v-for="e in empfaengerVorschlaege"
              :key="e.id"
              type="button"
              class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
              @click="waehleEmpfaenger(e)"
            >
              {{ e.name }} — {{ e.strasse }}, {{ e.ort }}
            </button>
          </div>
          <p
            v-if="
              empfaengerSuche &&
              !empfaengerLaden &&
              empfaengerVorschlaege.length === 0 &&
              !empfaenger
            "
            class="text-xs text-gray-500 mt-1"
          >
            Kein Empfänger gefunden. Füllen Sie die Felder unten aus, um einen neuen anzulegen.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Anrede</label>
            <input
              v-model="eingaben.anrede"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- Rechnungsdetails -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Rechnung</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Titel</label>
            <input
              v-model="eingaben.title"
              type="text"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Rechnungsdatum</label>
            <input
              v-model="eingaben.rechnungsdatum"
              type="date"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Positionen</label>
          <div class="space-y-2">
            <div
              v-for="(pos, idx) in eingaben.positionen"
              :key="idx"
              class="flex gap-2 items-start"
            >
              <div class="flex-1">
                <input
                  v-model="pos.text"
                  type="text"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  @input="updateBrutto"
                />
              </div>
              <div class="w-24">
                <input
                  :value="preisZuCentString(idx)"
                  type="text"
                  placeholder="Cent"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  @input="
                    preisVonCentString(idx, ($event.target as HTMLInputElement).value);
                    updateBrutto();
                  "
                />
              </div>
              <button
                v-if="eingaben.positionen.length > 1"
                type="button"
                class="text-red-400 hover:text-red-600 text-sm px-1 py-2"
                @click="positionEntfernen(idx)"
              >
                ×
              </button>
            </div>
          </div>
          <button
            type="button"
            class="mt-2 text-blue-600 hover:underline text-sm"
            @click="
              positionHinzufuegen();
              updateBrutto();
            "
          >
            + Position hinzufügen
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Umsatzsteuer</label>
            <select
              v-model="eingaben.ust"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              @change="updateBrutto"
            >
              <option :value="7">7%</option>
              <option :value="19">19%</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Zahlungsart</label>
            <select
              v-model="eingaben.einzug"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option :value="false">Überweisung</option>
              <option :value="true">Lastschrift (Einzug)</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Bruttobetrag</label>
            <div
              class="w-full border border-gray-200 rounded-lg px-3 py-3 text-sm bg-gray-50 font-medium"
            >
              {{ brutto }} €
            </div>
          </div>
        </div>
      </div>

      <!-- Metadaten -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-4">Metadaten</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            <input
              v-model="eingaben.email"
              type="email"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Mail-Anrede</label>
            <input
              v-model="eingaben.mailAnrede"
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
                : 'Rechnung erstellen'
          }}
        </button>
      </div>
    </form>
  </div>
</template>
