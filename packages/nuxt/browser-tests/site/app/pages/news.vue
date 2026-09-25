<script setup lang="ts">
// Request-time public page (not in nitro.prerender.routes): rendered fresh on every request, so #rendered-at
// differs per visit — the offline scenario proves the worker never serves a cached copy of this page.
// useState (not a bare const) so the server's value survives hydration instead of a client-side re-render
// silently overwriting it with a second, different Date.now().
const renderedAt = useState("renderedAt", () => Date.now());
</script>

<template>
  <main id="shell">
    <h1>news</h1>
    <p id="rendered-at">{{ renderedAt }}</p>
    <!-- Carries <PwaShell> too (base-url.spec.ts only, scenario 8): a *prerendered* page's script tags and
         payload are baked in at build time with the build's own app.baseURL, so they still point at the old
         base and 404 once NUXT_APP_BASE_URL moves the deployment — JS never runs, so nothing on `/` could ever
         show the runtime mismatch under an overridden base. This page is rendered fresh per request by the
         live server instead, so it picks up the override correctly. See base-url.spec.ts's own comment. -->
    <PwaShell />
  </main>
</template>
