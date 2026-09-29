import { createApp } from "vue";
import App from "./App.vue";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
createApp(App).mount("#app");
