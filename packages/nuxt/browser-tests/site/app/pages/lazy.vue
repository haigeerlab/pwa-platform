<!-- Not prerendered and never visited on first load: its client chunk is only ever fetched by the router's own
     dynamic import when index.vue's "Load lazy" button navigates here — the mechanism reload.spec.ts (scenario 9)
     needs a real chunk-load failure to come from.

     Renders APP_VERSION on purpose (measured, not merely tidy): without any reference to it, this page's compiled
     output is byte-identical between the v1 and v2 builds, so it gets the *same* content hash in both — the v2
     server then genuinely has a file at v1's own chunk URL, and reload.spec.ts's "the chunk 404s against v2" setup
     silently stopped being true. -->
<script setup lang="ts">
import { APP_VERSION } from "../version.js";
</script>

<template>
  <main id="shell">
    <h1>lazy</h1>
    <p id="version">{{ APP_VERSION }}</p>
    <NuxtLink id="home-link" to="/" :prefetch="false">Home</NuxtLink>
  </main>
</template>
