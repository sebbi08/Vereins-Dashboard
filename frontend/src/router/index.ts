import EinstellungenView from '@/views/EinstellungenView.vue';
import HomeView from '@/views/HomeView.vue';
import RechnungView from '@/views/RechnungView.vue';
import RechnungDetailView from '@/views/RechnungDetailView.vue';
import RechnungEinstellungenView from '@/views/RechnungEinstellungenView.vue';
import RechnungFormView from '@/views/RechnungFormView.vue';
import SpendenQuittungDetailView from '@/views/SpendenQuittungDetailView.vue';
import SpendenQuittungFormView from '@/views/SpendenQuittungFormView.vue';
import SpendenQuittungView from '@/views/SpendenQuittungView.vue';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/spenden-quittung',
      name: 'spenden-quittung',
      component: SpendenQuittungView,
    },
    {
      path: '/spenden-quittung/neu',
      name: 'spenden-quittung-neu',
      component: SpendenQuittungFormView,
    },
    {
      path: '/spenden-quittung/:id',
      name: 'spenden-quittung-detail',
      component: SpendenQuittungDetailView,
    },
    {
      path: '/spenden-quittung/:id/revision',
      name: 'spenden-quittung-revision',
      component: SpendenQuittungFormView,
    },
    { path: '/rechnung', name: 'rechnung', component: RechnungView },
    {
      path: '/rechnung/neu',
      name: 'rechnung-neu',
      component: RechnungFormView,
    },
    {
      path: '/rechnung/:id',
      name: 'rechnung-detail',
      component: RechnungDetailView,
    },
    {
      path: '/rechnung/:id/revision',
      name: 'rechnung-revision',
      component: RechnungFormView,
    },
    {
      path: '/rechnung/einstellungen',
      name: 'rechnung-einstellungen',
      component: RechnungEinstellungenView,
    },
    {
      path: '/spenden-quittung/einstellungen',
      name: 'spenden-quittung-einstellungen',
      component: EinstellungenView,
    },
    {
      path: '/einstellungen',
      redirect: '/spenden-quittung/einstellungen',
    },
  ],
});

export default router;
