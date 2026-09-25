<script setup lang="ts">
// Calls usePwa() directly at the top level, unguarded — no <ClientOnly> (T7b, spec decision 18): this must build
// and prerender fine now that the virtual module and the runtime plugin both run server-side too. Used by
// test/server-binding.test.ts to read the state's initial value back out of the prerendered HTML.
import { usePwa } from "@pwa-platform/vue";

const pwa = usePwa();
</script>

<template>
  <main>
    <h1>home</h1>
    <p id="pwa-state" :data-registered="pwa.state.value.registered">{{ pwa.state.value.registered }}</p>
  </main>
</template>
