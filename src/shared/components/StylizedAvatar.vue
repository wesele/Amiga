<template>
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke-width="2" 
    stroke-linecap="round" 
    stroke-linejoin="round" 
    :width="size" 
    :height="size"
  >
    <!-- Base face and body -->
    <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" stroke="#58cc02" />
    <path d="M6 20c0-4 2-6 6-6s6 2 6 6" stroke="#1cb0f6" />
    
    <!-- Variation specific parts -->
    <g v-if="id === 0"> <!-- Simple Smile -->
      <path d="M9 13c1 1 3 1 4 0" stroke="#58cc02" />
      <circle cx="9" cy="10" r="0.5" fill="#58cc02" />
      <circle cx="15" cy="10" r="0.5" fill="#58cc02" />
    </g>
    <g v-else-if="id === 1"> <!-- Cool / Sunglasses -->
      <rect x="8" y="9" width="3" height="2" rx="0.5" fill="#1cb0f6" />
      <rect x="13" y="9" width="3" height="2" rx="0.5" fill="#1cb0f6" />
      <line x1="11" y1="10" x2="13" y2="10" stroke="#1cb0f6" />
      <path d="M10 14c1 1 2 1 3 0" stroke="#58cc02" />
    </g>
    <g v-else-if="id === 2"> <!-- Nerd / Glasses -->
      <circle cx="9" cy="10" r="1.5" stroke="#1cb0f6" />
      <circle cx="15" cy="10" r="1.5" stroke="#1cb0f6" />
      <line x1="10.5" y1="10" x2="13.5" y2="10" stroke="#1cb0f6" />
      <path d="M11 14c0.5 1 1.5 1 2 0" stroke="#58cc02" />
    </g>
    <g v-else-if="id === 3"> <!-- Flower / Soft -->
      <path d="M12 2v2M12 12v2M16 7l2-2M8 7l-2-2M16 12l2 2M8 12l-2 2" stroke="#58cc02" />
      <path d="M10 13c1 1 2 1 3 0" stroke="#1cb0f6" />
      <circle cx="9" cy="10" r="0.5" fill="#58cc02" />
      <circle cx="15" cy="10" r="0.5" fill="#58cc02" />
    </g>
    <g v-else-if="id === 4"> <!-- Fox / Pointy Ears -->
      <path d="M7 5l-2-2 2 2M17 5l2-2-2 2" stroke="#1cb0f6" />
      <path d="M11 14c1 1 2 1 3 0" stroke="#58cc02" />
      <path d="M10 10h1M13 10h1" stroke="#58cc02" />
    </g>
    <g v-else-if="id === 5"> <!-- Cat / Cute -->
      <path d="M8 5l-1-2 2 1M16 5l1-2-2 1" stroke="#58cc02" />
      <path d="M10 14c1 1 2 1 3 0" stroke="#1cb0f6" />
      <circle cx="9" cy="10" r="0.5" fill="#58cc02" />
      <circle cx="15" cy="10" r="0.5" fill="#58cc02" />
    </g>
    <g v-else-if="id === 6"> <!-- Dog / Droopy Ears -->
      <path d="M7 7c-1 0-2 2-2 4M17 7c1 0 2 2 2 4" stroke="#1cb0f6" />
      <path d="M11 14c1 1 2 1 3 0" stroke="#58cc02" />
      <path d="M10 10h1M13 10h1" stroke="#58cc02" />
    </g>
    <g v-else-if="id === 7"> <!-- Bear / Round Ears -->
      <circle cx="6" cy="6" r="2" stroke="#58cc02" />
      <circle cx="18" cy="6" r="2" stroke="#58cc02" />
      <path d="M10 14c1 1 2 1 3 0" stroke="#1cb0f6" />
      <circle cx="9" cy="10" r="0.5" fill="#58cc02" />
      <circle cx="15" cy="10" r="0.5" fill="#58cc02" />
    </g>
    <g v-else-if="id === 8"> <!-- Owl / Wide Eyes -->
      <circle cx="9" cy="10" r="2" stroke="#1cb0f6" />
      <circle cx="15" cy="10" r="2" stroke="#1cb0f6" />
      <path d="M11 14l1 1l1-1" stroke="#58cc02" />
    </g>
    <g v-else-if="id === 9"> <!-- Star / Energetic -->
      <path d="M12 1l1.5 3.5h3.5l-2.5 2.5l1 3.5l-3.5-2l-3.5 2l1-3.5l-2.5-2.5h3.5z" stroke="#1cb0f6" />
      <path d="M10 14c1 1 2 1 3 0" stroke="#58cc02" />
    </g>
    <g v-else-if="id === 10"> <!-- Target / Focused -->
      <circle cx="12" cy="10" r="1.5" stroke="#58cc02" />
      <circle cx="12" cy="10" r="3" stroke="#1cb0f6" />
      <path d="M11 14c1 1 2 1 3 0" stroke="#58cc02" />
    </g>
    <g v-else-if="id === 11"> <!-- Artist / Beret -->
      <path d="M7 7c0-2 5-3 5-3s5 1 5 3" stroke="#1cb0f6" />
      <path d="M10 14c1 1 2 1 3 0" stroke="#58cc02" />
      <circle cx="9" cy="10" r="0.5" fill="#58cc02" />
      <circle cx="15" cy="10" r="0.5" fill="#58cc02" />
    </g>
    <g v-else> <!-- Default / Calm -->
      <path d="M10 14c1 1 2 1 3 0" stroke="#1cb0f6" />
      <circle cx="9" cy="10" r="0.5" fill="#58cc02" />
      <circle cx="15" cy="10" r="0.5" fill="#58cc02" />
    </g>
  </svg>
</template>

<script setup>
defineProps({
  id: { type: [Number, String], default: 0 },
  size: { type: [Number, String], default: 40 },
});
</script>

<style scoped>
svg {
  display: inline-block;
  vertical-align: middle;
}
</style>
