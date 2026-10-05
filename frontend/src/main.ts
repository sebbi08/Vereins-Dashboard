import { createPinia } from 'pinia';
import 'primeicons/primeicons.css';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { createApp } from 'vue';
import App from './App.vue';
import './assets/layout.css';
import { primeVueOptions } from './primevue';
import router from './router';
import './style.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(PrimeVue, primeVueOptions(import.meta.env.VITE_PRIMEUI_LICENSE));
app.use(ToastService);
app.use(ConfirmationService);
app.mount('#app');
