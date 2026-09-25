<script setup lang="ts">
// Prerendered shell page. The PWA state and register() call live in <PwaShell> (no <ClientOnly> needed since T7b —
// see that component's own comment). "Load lazy" needs no PWA binding, so it stays here: a plain client-side
// navigation to /lazy, used only by reload.spec.ts (scenario 9) to provoke a chunk-load error under router control.
import { APP_VERSION } from "../version.js";

// Mirrored in browser-tests/page.ts's LAZY_NAV_OUTCOME_KEY: the settlement of this one navigateTo() call is the
// state reload.spec.ts (scenario 9) polls on, instead of a fixed sleep, to know the router has finished trying.
// A page that reloads (the "automatic" variant under test) tears down this document before the promise can ever
// settle here — that case is observed a different way, by waiting for the real navigation instead.
const LAZY_NAV_OUTCOME_KEY = "__pwaNuxtE2eLazyNavOutcome";

function goLazy(): void {
  const outcome = navigateTo("/lazy");
  if (outcome instanceof Promise) {
    outcome
      .then(() => Reflect.set(window, LAZY_NAV_OUTCOME_KEY, "resolved"))
      .catch((error: unknown) => Reflect.set(window, LAZY_NAV_OUTCOME_KEY, `rejected:${String(error)}`));
  } else {
    Reflect.set(window, LAZY_NAV_OUTCOME_KEY, "sync");
  }
}
</script>

<template>
  <main id="shell">
    <h1>home</h1>
    <p id="version">{{ APP_VERSION }}</p>
    <PwaShell />
    <NuxtLink id="about-link" to="/about" :prefetch="false">About</NuxtLink>
    <button id="go-lazy" type="button" @click="goLazy">Load lazy</button>
  </main>
</template>
