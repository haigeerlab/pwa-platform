import { createApp, h } from "vue";
import { createPwa } from "@pwa-platform/vue";
import { PwaUpdateNotice, type PwaUpdateNoticeProps } from "@pwa-platform/vue/ui";
import "@pwa-platform/vue/update-notice.css";

const props: PwaUpdateNoticeProps = { position: "bottom-right", colors: { primaryButtonBackground: "#006e52", primaryButtonText: "#ffffff" }, reloadPage: () => window.location.reload() };
const config = { appId: "ui-consumer", scope: "/", serviceWorkerUrl: "/sw.js", updateMode: "prompt", installEnabled: false } as const;
createApp({ render: () => h(PwaUpdateNotice, props) }).use(createPwa({ config })).mount("#app");
