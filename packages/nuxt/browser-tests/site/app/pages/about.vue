<script setup lang="ts">
import { APP_VERSION } from "../version.js";
</script>

<template>
  <main id="shell">
    <h1>about</h1>
    <p id="version">{{ APP_VERSION }}</p>
  </main>
</template>
