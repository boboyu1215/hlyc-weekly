import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './assets/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// 主题初始化（在 pinia 之后、mount 之前，确保 HTML 根元素立即应用主题）
const savedTheme = localStorage.getItem('hlzc_theme');
const themeClass = (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
document.documentElement.classList.add(themeClass);

app.mount('#app');
