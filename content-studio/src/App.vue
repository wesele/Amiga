<template>
  <AppLayout>
    <router-view />
  </AppLayout>
  <AsyncLoading />
</template>

<script setup>
import AppLayout from './components/AppLayout.vue'
import AsyncLoading from './components/AsyncLoading.vue'
</script>
