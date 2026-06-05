<script setup lang="ts">
import type { PdfStatus, RechnungDto, RechnungRevisionDto } from 'shared';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const id = parseInt(String(route.params.id));

const rechnung = ref<RechnungDto | null>(null);
const laden = ref(false);
const fehler = ref('');
const storniertFehler = ref('');
const retryPdfErfolg = ref<Record<number, string>>({});
const retryPdfFehler = ref<Record<number, string>>({});
const retryLaden = ref<Record<number, boolean>>({});

async function laden_() {
  laden.value = true;
  try {
    const res = await fetch(`/api/rechnung/${id}`);
    if (!res.ok) {
      fehler.value = 'Rechnung konnte nicht geladen werden';
      return;
    }
    rechnung.value = await res.json();
  } catch {
    fehler.value = 'Netzwerkfehler';
  } finally {
    laden.value = false;
  }
}

onMounted(laden_);

function formatBetrag(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(iso));
}

function berechneBrutto(rev: RechnungRevisionDto): number {
  const netto = rev.eingaben.positionen.reduce((sum, p) => sum + p.priceInCents, 0);
  const steuer = Math.round(netto * (rev.eingaben.ust / 100));
  return netto + steuer;
}

function ustLabel(ust: number): string {
  return ust === 7 ? '7%' : '19%';
}

function zahlungsartLabel(einzug: boolean): string {
  return einzug ? 'Lastschrift (Einzug)' : 'Überweisung';
}

async function stornieren() {
  storniertFehler.value = '';
  try {
    const res = await fetch(`/api/rechnung/${id}/stornieren`, { method: 'PATCH' });
    if (!res.ok) {
      const err = await res.json();
      storniertFehler.value = err.error || 'Fehler beim Stornieren';
      return;
    }
    await laden_();
  } catch {
    storniertFehler.value = 'Netzwerkfehler';
  }
}

async function retryPdf(revisionId: number) {
  retryPdfErfolg.value[revisionId] = '';
  retryPdfFehler.value[revisionId] = '';
  retryLaden.value[revisionId] = true;

  try {
    const res = await fetch(`/api/rechnung/revision/${revisionId}/retry-pdf`, { method: 'POST' });
    const result = await res.json();

    if (res.ok) {
      retryPdfErfolg.value[revisionId] = 'PDF erfolgreich generiert';
      await laden_();
    } else {
      retryPdfFehler.value[revisionId] = result.error || 'Fehler beim Retry';
    }
  } catch {
    retryPdfFehler.value[revisionId] = 'Netzwerkfehler';
  } finally {
    retryLaden.value[revisionId] = false;
  }
}

function downloadPdf(revisionId: number) {
  window.open(`/api/rechnung/revision/${revisionId}/download`, '_blank');
}

function pdfStatusBadge(status: PdfStatus) {
  const map: Record<PdfStatus, string> = {
    PENDING: 'bg-gray-100 text-gray-600',
    OK: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
  };
  return `inline-block text-xs font-medium px-2 py-0.5 rounded-full ${map[status] || ''}`;
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="text-gray-400 hover:text-gray-700" @click="router.push('/rechnung')">
        ← Zurück
      </button>
      <h2 class="text-2xl font-bold text-gray-800">Rechnung {{ rechnung?.nummer }}</h2>
    </div>

    <div v-if="laden" class="p-8 text-center text-gray-400">Lädt…</div>
    <div v-else-if="fehler" class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
      {{ fehler }}
    </div>
    <template v-else-if="rechnung">
      <div class="space-y-6">
        <!-- Status -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">Status</p>
              <span
                :class="[
                  'inline-block text-sm font-medium px-2 py-0.5 rounded-full mt-1',
                  rechnung.status === 'AKTIV'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500',
                ]"
              >
                {{ rechnung.status }}
              </span>
            </div>
            <div>
              <p class="text-sm text-gray-500">Erstellt am</p>
              <p class="text-sm font-medium text-gray-800 mt-1">
                {{ formatDatum(rechnung.createdAt) }}
              </p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Empfänger</p>
              <p class="text-sm font-medium text-gray-800 mt-1">{{ rechnung.empfaenger.name }}</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3">
          <button
            v-if="rechnung.status === 'AKTIV'"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            @click="router.push(`/rechnung/${id}/revision`)"
          >
            Neue Revision
          </button>
          <button
            v-if="rechnung.status === 'AKTIV'"
            class="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
            @click="stornieren"
          >
            Stornieren
          </button>
          <p v-if="storniertFehler" class="text-red-600 text-sm">{{ storniertFehler }}</p>
        </div>

        <!-- Revisionen -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <h3 class="font-semibold text-gray-800 px-6 py-4 border-b">Revisionen</h3>
          <div v-if="!rechnung.revisionen?.length" class="p-6 text-center text-gray-400 text-sm">
            Keine Revisionen vorhanden
          </div>
          <div v-else class="divide-y">
            <div v-for="rev in rechnung.revisionen" :key="rev.id" class="p-6">
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-semibold text-gray-800"
                    >Revision {{ rev.revisionNummer }}</span
                  >
                  <span :class="pdfStatusBadge(rev.pdfStatus)">{{ rev.pdfStatus }}</span>
                  <span
                    :class="[
                      'inline-block text-xs font-medium px-2 py-0.5 rounded-full',
                      rev.status === 'AKTIV'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500',
                    ]"
                  >
                    {{ rev.status }}
                  </span>
                </div>
                <p class="text-xs text-gray-400">{{ formatDatum(rev.erstelltAm) }}</p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span class="text-gray-500">Empfänger:</span>
                  <span class="text-gray-800"
                    >{{ rev.eingaben.name }}, {{ rev.eingaben.strasse }},
                    {{ rev.eingaben.ort }}</span
                  >
                </div>
                <div>
                  <span class="text-gray-500">Titel:</span>
                  <span class="text-gray-800">{{ rev.eingaben.title }}</span>
                </div>
                <div>
                  <span class="text-gray-500">USt:</span>
                  <span class="text-gray-800">{{ ustLabel(rev.eingaben.ust) }}</span>
                </div>
                <div>
                  <span class="text-gray-500">Zahlung:</span>
                  <span class="text-gray-800">{{ zahlungsartLabel(rev.eingaben.einzug) }}</span>
                </div>
                <div class="md:col-span-2">
                  <span class="text-gray-500">Betrag (Brutto):</span>
                  <span class="text-gray-800 font-medium">{{
                    formatBetrag(berechneBrutto(rev))
                  }}</span>
                </div>
              </div>

              <!-- Positionen -->
              <div class="mt-3">
                <p class="text-xs text-gray-500 mb-1">Positionen:</p>
                <div class="bg-gray-50 rounded-lg p-3 text-sm">
                  <div
                    v-for="(pos, idx) in rev.eingaben.positionen"
                    :key="idx"
                    class="flex justify-between py-1 border-b border-gray-100 last:border-0"
                  >
                    <span class="text-gray-700">{{ pos.text }}</span>
                    <span class="text-gray-800 font-medium">{{
                      formatBetrag(pos.priceInCents)
                    }}</span>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-3 mt-3">
                <button
                  v-if="rev.pdfStatus === 'OK'"
                  class="text-blue-600 hover:underline text-sm"
                  @click="downloadPdf(rev.id)"
                >
                  PDF herunterladen
                </button>
                <button
                  v-if="rev.pdfStatus === 'FAILED' && rev.status === 'AKTIV'"
                  class="text-amber-600 hover:underline text-sm"
                  :disabled="retryLaden[rev.id]"
                  @click="retryPdf(rev.id)"
                >
                  {{ retryLaden[rev.id] ? 'Generiere...' : 'PDF neu generieren' }}
                </button>
                <p v-if="retryPdfErfolg[rev.id]" class="text-green-600 text-xs">
                  {{ retryPdfErfolg[rev.id] }}
                </p>
                <p v-if="retryPdfFehler[rev.id]" class="text-red-600 text-xs">
                  {{ retryPdfFehler[rev.id] }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
