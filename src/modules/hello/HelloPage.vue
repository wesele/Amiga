<template>
  <div class="hello-page">
    <div class="hello-card">
      <div class="logo">
        <span class="logo-icon">I</span>
        <h1>Amiga</h1>
      </div>
      <p class="subtitle">Language Learning App</p>

      <div class="greeting-section">
        <input
          v-model="name"
          type="text"
          placeholder="Enter your name"
          class="name-input"
          @keyup.enter="doGreet"
        />
        <button class="btn-primary" @click="doGreet">Greet Me</button>
      </div>

      <div v-if="greeting" class="greeting-result">
        {{ greeting }}
      </div>

      <div class="info-bar">
        <span class="badge">v{{ version }}</span>
        <span class="badge badge-green">Windows + Android</span>
        <span class="badge badge-blue">Tauri + Vue 3</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { greet } from "../../shared/api.js";

const name = ref("");
const greeting = ref("");
const version = "0.1.0";

async function doGreet() {
  if (!name.value.trim()) return;
  try {
    greeting.value = await greet(name.value.trim());
  } catch {
    greeting.value = `Hello, ${name.value}! (offline mode)`;
  }
}
</script>

<style scoped>
.hello-page {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: linear-gradient(135deg, #1cb0f6 0%, #58cc02 100%);
}

.hello-card {
  background: white;
  border-radius: 24px;
  padding: 3rem 2.5rem;
  max-width: 420px;
  width: 100%;
  text-align: center;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: #58cc02;
  color: white;
  font-size: 1.75rem;
  font-weight: 800;
  border-radius: 12px;
}

.logo h1 {
  font-size: 2rem;
  font-weight: 800;
  color: #4b4b4b;
}

.subtitle {
  color: #777;
  margin-bottom: 2rem;
  font-size: 0.95rem;
}

.greeting-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.name-input {
  padding: 0.875rem 1rem;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.name-input:focus {
  border-color: #58cc02;
}

.btn-primary {
  padding: 0.875rem;
  background: #58cc02;
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #46a302;
}

.greeting-result {
  background: #f0fdf0;
  color: #2d7d00;
  padding: 1rem;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.info-bar {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}

.badge {
  padding: 0.25rem 0.75rem;
  background: #f0f0f0;
  border-radius: 20px;
  font-size: 0.75rem;
  color: #666;
}

.badge-green {
  background: #e8f5e9;
  color: #2e7d32;
}

.badge-blue {
  background: #e3f2fd;
  color: #1565c0;
}
</style>
