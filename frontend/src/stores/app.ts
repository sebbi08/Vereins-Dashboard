import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStore = defineStore("app", () => {
  const appName = ref("MV Dashboard");

  // true = aktive Quittungs-Vorlage vorhanden, false = keine, null = noch nicht geprüft
  const quittungsVorlageVorhanden = ref<boolean | null>(null);

  async function pruefeVorlagen() {
    try {
      const res = await fetch("/api/vorlagen");
      if (!res.ok) {
        quittungsVorlageVorhanden.value = false;
        return;
      }
      const vorlagen: { typ: string }[] = await res.json();
      quittungsVorlageVorhanden.value = vorlagen.some(
        (v) => v.typ === "QUITTUNG",
      );
    } catch {
      quittungsVorlageVorhanden.value = false;
    }
  }

  return { appName, quittungsVorlageVorhanden, pruefeVorlagen };
});
