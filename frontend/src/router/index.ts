import EinstellungenView from "@/views/EinstellungenView.vue";
import HomeView from "@/views/HomeView.vue";
import RechnungView from "@/views/RechnungView.vue";
import SpendenQuittungDetailView from "@/views/SpendenQuittungDetailView.vue";
import SpendenQuittungFormView from "@/views/SpendenQuittungFormView.vue";
import SpendenQuittungView from "@/views/SpendenQuittungView.vue";
import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "home", component: HomeView },
    {
      path: "/spenden-quittung",
      name: "spenden-quittung",
      component: SpendenQuittungView,
    },
    {
      path: "/spenden-quittung/neu",
      name: "spenden-quittung-neu",
      component: SpendenQuittungFormView,
    },
    {
      path: "/spenden-quittung/:id",
      name: "spenden-quittung-detail",
      component: SpendenQuittungDetailView,
    },
    {
      path: "/spenden-quittung/:id/revision",
      name: "spenden-quittung-revision",
      component: SpendenQuittungFormView,
    },
    { path: "/rechnung", name: "rechnung", component: RechnungView },
    {
      path: "/einstellungen",
      name: "einstellungen",
      component: EinstellungenView,
    },
  ],
});

export default router;
