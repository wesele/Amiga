<template>
  <Transition name="popup">
    <section
      v-if="open && card"
      class="micro-review-sheet"
      :class="sheetClass"
      :aria-label="t(titleKey, { n: sessionCount })"
    >
      <div class="micro-review-header">
        <p class="micro-review-title">
          {{ t(titleKey, { n: sessionCount }) }}
        </p>
        <p class="micro-review-hint">{{ t(hintKey) }}</p>
      </div>
      <div
        class="micro-review-card"
        :class="{
          'is-flipped': flipped,
          'is-swipe-ready': swipeEnabled,
          'is-swiping': swipeDragging,
          [`is-ack-${ratingAck}`]: ratingAck,
        }"
        :style="swipeStyle"
        @click="$emit('card-click')"
        @pointerdown="$emit('swipe-down', $event)"
        @pointermove="$emit('swipe-move', $event)"
        @pointerup="$emit('swipe-up', $event)"
        @pointercancel="$emit('swipe-cancel')"
      >
        <div class="micro-review-card-inner">
          <div class="micro-review-face micro-review-front">
            <span class="micro-review-word">{{ card.word }}</span>
            <span class="micro-review-tap-hint">{{ t("vocab.reviewTapToReveal") }}</span>
          </div>
          <div class="micro-review-face micro-review-back">
            <span v-if="definition" class="micro-review-definition">{{ definition }}</span>
            <div v-if="contextLabel || contextText" class="micro-review-context">
              <p v-if="contextLabel" class="micro-review-context-label">{{ contextLabel }}</p>
              <p v-if="contextParts.length" class="micro-review-example">
                <template v-for="(part, idx) in contextParts" :key="idx">
                  <mark v-if="part.highlight" class="micro-review-mark">{{ part.text }}</mark>
                  <span v-else>{{ part.text }}</span>
                </template>
              </p>
              <p v-else-if="contextText" class="micro-review-example">{{ contextText }}</p>
            </div>
            <p class="micro-review-swipe-hint">{{ t("vocab.reviewSwipeHint") }}</p>
          </div>
        </div>
      </div>
      <p class="micro-review-progress">{{ index + 1 }}/{{ queueLength }}</p>
      <div class="micro-review-actions">
        <button type="button" class="micro-review-continue" @click="$emit('continue')">
          {{ t(continueKey) }}
        </button>
        <button type="button" class="micro-review-later" @click="$emit('later')">
          {{ t(laterKey) }}
        </button>
      </div>
    </section>
  </Transition>
</template>

<script setup>
import { useI18n } from "@/shared/i18n";

defineProps({
  open: { type: Boolean, default: false },
  card: { type: Object, default: null },
  sessionCount: { type: Number, default: 0 },
  index: { type: Number, default: 0 },
  queueLength: { type: Number, default: 0 },
  definition: { type: String, default: "" },
  contextLabel: { type: String, default: "" },
  contextText: { type: String, default: "" },
  contextParts: { type: Array, default: () => [] },
  flipped: { type: Boolean, default: false },
  swipeEnabled: { type: Boolean, default: false },
  swipeDragging: { type: Boolean, default: false },
  swipeStyle: { type: Object, default: undefined },
  ratingAck: { type: String, default: null },
  titleKey: { type: String, required: true },
  hintKey: { type: String, required: true },
  continueKey: { type: String, required: true },
  laterKey: { type: String, required: true },
  sheetClass: { type: String, default: "" },
});

defineEmits([
  "card-click",
  "swipe-down",
  "swipe-move",
  "swipe-up",
  "swipe-cancel",
  "continue",
  "later",
]);

const { t } = useI18n();
</script>

<style scoped>
.micro-review-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(88px + var(--safe-bottom, 0px));
  z-index: 24;
  margin: 0 auto;
  max-width: 480px;
  padding: 14px 16px 12px;
  border-top: 1px solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: var(--surface);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.08);
}

.micro-review-sheet.is-teaching {
  bottom: calc(72px + var(--safe-bottom, 0px));
}

.micro-review-header {
  margin-bottom: 10px;
}

.micro-review-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.micro-review-hint {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
}

.micro-review-card {
  position: relative;
  min-height: 148px;
  perspective: 900px;
  cursor: pointer;
  touch-action: pan-y;
}

.micro-review-card-inner {
  position: relative;
  width: 100%;
  min-height: 148px;
  transform-style: preserve-3d;
  transition: transform 0.35s ease;
}

.micro-review-card.is-flipped .micro-review-card-inner {
  transform: rotateY(180deg);
}

.micro-review-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--surface-variant);
  backface-visibility: hidden;
}

.micro-review-back {
  transform: rotateY(180deg);
}

.micro-review-word {
  font-size: 28px;
  font-weight: 800;
  color: var(--text);
}

.micro-review-tap-hint,
.micro-review-swipe-hint {
  font-size: 12px;
  color: var(--text-lighter);
}

.micro-review-definition {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  text-align: center;
}

.micro-review-context {
  width: 100%;
  text-align: center;
}

.micro-review-context-label {
  margin: 0 0 4px;
  font-size: 11px;
  color: var(--text-lighter);
}

.micro-review-example {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-light);
}

.micro-review-mark {
  background: rgba(28, 176, 246, 0.18);
  color: var(--text);
  border-radius: 3px;
  padding: 0 2px;
}

.micro-review-card.is-ack-positive .micro-review-face {
  box-shadow: inset 0 0 0 2px rgba(88, 204, 2, 0.45);
}

.micro-review-card.is-ack-learning .micro-review-face {
  box-shadow: inset 0 0 0 2px rgba(28, 176, 246, 0.35);
}

.micro-review-progress {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-lighter);
}

.micro-review-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.micro-review-continue,
.micro-review-later {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.micro-review-continue {
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.micro-review-later {
  border: none;
  background: var(--primary);
  color: #fff;
}
</style>