import HomeView from '@/views/HomeView.vue';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/donation-receipt',
      name: 'donation-receipt',
      component: () => import('@/views/DonationReceiptView.vue'),
    },
    {
      path: '/donation-receipt/new',
      name: 'donation-receipt-new',
      component: () => import('@/views/DonationReceiptFormView.vue'),
    },
    {
      path: '/donation-receipt/:id',
      name: 'donation-receipt-detail',
      component: () => import('@/views/DonationReceiptDetailView.vue'),
    },
    {
      path: '/donation-receipt/:id/revision',
      name: 'donation-receipt-revision',
      component: () => import('@/views/DonationReceiptFormView.vue'),
    },
    { path: '/invoice', name: 'invoice', component: () => import('@/views/InvoiceView.vue') },
    {
      path: '/invoice/new',
      name: 'invoice-new',
      component: () => import('@/views/InvoiceFormView.vue'),
    },
    {
      path: '/invoice/draft/:draftId',
      name: 'invoice-draft',
      component: () => import('@/views/InvoiceFormView.vue'),
    },
    {
      path: '/invoice/:id',
      name: 'invoice-detail',
      component: () => import('@/views/InvoiceDetailView.vue'),
    },
    {
      path: '/invoice/:id/revision',
      name: 'invoice-revision',
      component: () => import('@/views/InvoiceFormView.vue'),
    },
    {
      path: '/invoice/settings',
      name: 'invoice-settings',
      component: () => import('@/views/InvoiceSettingsView.vue'),
    },
    {
      path: '/donation-receipt/settings',
      name: 'donation-receipt-settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/instructor',
      name: 'instructor',
      component: () => import('@/views/InstructorView.vue'),
    },
    {
      path: '/instructor/new',
      name: 'instructor-new',
      component: () => import('@/views/InstructorFormView.vue'),
    },
    {
      path: '/instructor/:id',
      name: 'instructor-detail',
      component: () => import('@/views/InstructorFormView.vue'),
    },
    {
      path: '/settings',
      redirect: '/donation-receipt/settings',
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
});

export default router;
