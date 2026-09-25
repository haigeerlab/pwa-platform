<!-- The module gives this route's route rule `noScripts: true` (derived from policy.offlineFallback.path), so the
     built HTML carries no app-entry <script> and never hydrates — it must not rewrite the address bar when a
     navigation to another route falls back to it (design section 3, T1 deviation C). -->
<template>
  <main id="shell">
    <h1>offline</h1>
    <p id="offline">You are offline</p>
  </main>
</template>
