<script setup lang="ts">
import { onMounted, ref } from "vue";
import { loadCatalog, loadProfile } from "./api";

const catalog = ref<unknown>(null);
const profile = ref<unknown>(null);
onMounted(async () => {
  catalog.value = await loadCatalog();
  profile.value = await loadProfile();
});
</script>

<template>
  <main>
    <h1>Business App</h1>
    <pre>{{ catalog }}</pre>
    <pre>{{ profile }}</pre>
  </main>
</template>
