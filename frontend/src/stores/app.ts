import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  // true = active receipt template present, false = none, null = not yet checked
  const receiptTemplateAvailable = ref<boolean | null>(null);
  const invoiceTemplateAvailable = ref<boolean | null>(null);

  async function checkTemplates() {
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) {
        markUnavailable();
        return;
      }
      const templates: { type: string }[] = await res.json();
      receiptTemplateAvailable.value = templates.some((v) => v.type === 'QUITTUNG');
      invoiceTemplateAvailable.value = templates.some((v) => v.type === 'RECHNUNG');
    } catch {
      markUnavailable();
    }
  }

  /** Without a template list, neither document type can be created. */
  function markUnavailable() {
    receiptTemplateAvailable.value = false;
    invoiceTemplateAvailable.value = false;
  }

  return { receiptTemplateAvailable, invoiceTemplateAvailable, checkTemplates };
});
