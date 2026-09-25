<!-- No <ClientOnly> (T7b, spec decision 18): usePwa() now works unguarded during SSR/prerendering too, since the
     module's runtime plugin runs on both sides and the virtual module resolves in both builds (src/runtime/plugin.ts).
     T7 found the opposite (crashed SSR, worked around here with <ClientOnly>, reported rather than fixed at the
     time) — this file is that fix landing in the fixture. onMounted still only runs client-side, which is what
     keeps register() from ever being attempted during SSR. -->
<script setup lang="ts">
import { usePwa } from "@pwa-platform/vue";

const pwa = usePwa();
const registerError = ref<string | null>(null);

onMounted(async () => {
  try {
    await pwa.register();
  } catch (error) {
    registerError.value = error instanceof Error ? error.message : String(error);
  }
});
</script>

<template>
  <div
    id="pwa-shell"
    :data-registered="pwa.state.value.registered"
    :data-update-waiting="pwa.state.value.updateWaiting"
    :data-install-eligible="pwa.state.value.installEligible"
    :data-installed="pwa.state.value.installed"
  >
    <p id="registered">{{ pwa.state.value.registered ? "registered" : "not registered" }}</p>
    <p v-if="registerError" id="register-error">{{ registerError }}</p>
    <button v-if="pwa.state.value.updateWaiting" id="apply-update" type="button" @click="pwa.applyUpdate()">
      Apply update
    </button>
  </div>
</template>
