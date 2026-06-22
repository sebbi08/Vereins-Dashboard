import DonationReceiptDetailView from '@/views/DonationReceiptDetailView.vue';
import DonationReceiptFormView from '@/views/DonationReceiptFormView.vue';
import DonationReceiptView from '@/views/DonationReceiptView.vue';
import HomeView from '@/views/HomeView.vue';
import InvoiceDetailView from '@/views/InvoiceDetailView.vue';
import InvoiceFormView from '@/views/InvoiceFormView.vue';
import InvoiceSettingsView from '@/views/InvoiceSettingsView.vue';
import InvoiceView from '@/views/InvoiceView.vue';
import SettingsView from '@/views/SettingsView.vue';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/donation-receipt',
      name: 'donation-receipt',
      component: DonationReceiptView,
    },
    {
      path: '/donation-receipt/new',
      name: 'donation-receipt-new',
      component: DonationReceiptFormView,
    },
    {
      path: '/donation-receipt/:id',
      name: 'donation-receipt-detail',
      component: DonationReceiptDetailView,
    },
    {
      path: '/donation-receipt/:id/revision',
      name: 'donation-receipt-revision',
      component: DonationReceiptFormView,
    },
    { path: '/invoice', name: 'invoice', component: InvoiceView },
    {
      path: '/invoice/new',
      name: 'invoice-new',
      component: InvoiceFormView,
    },
    {
      path: '/invoice/:id',
      name: 'invoice-detail',
      component: InvoiceDetailView,
    },
    {
      path: '/invoice/:id/revision',
      name: 'invoice-revision',
      component: InvoiceFormView,
    },
    {
      path: '/invoice/settings',
      name: 'invoice-settings',
      component: InvoiceSettingsView,
    },
    {
      path: '/donation-receipt/settings',
      name: 'donation-receipt-settings',
      component: SettingsView,
    },
    {
      path: '/settings',
      redirect: '/donation-receipt/settings',
    },
  ],
});

export default router;
