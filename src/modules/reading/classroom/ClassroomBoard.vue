<template>
  <section class="teaching-board" :aria-label="t('classroom.board')">
    <div
      v-if="source && focus && focus.kind !== 'source' && source.text !== focus.text"
      class="board-note board-source board-context"
    >
      <p :lang="targetLanguage">{{ source.text }}</p>
    </div>
    <Transition name="board-write" mode="out-in">
      <div
        v-if="focus"
        ref="focusElement"
        :key="`${board.node_id}:${focus.kind}:${focus.text}`"
        class="board-note board-focus"
        :class="`board-${focus.kind}`"
        aria-live="polite"
        aria-atomic="true"
      >
        <span class="board-label">{{ t(`classroom.board_${focus.kind}`) }}</span>
        <p
          v-if="focus.kind === 'explanation' && expression"
          class="board-expression-heading"
          :lang="targetLanguage"
        >
          {{ expression.text }}
        </p>
        <p
          :lang="
            ['source', 'expression', 'example'].includes(focus.kind)
              ? targetLanguage
              : teachingLanguage
          "
        >
          {{ focus.text }}
        </p>
      </div>
    </Transition>
  </section>
</template>
<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useI18n } from "@/shared/i18n";
const props = defineProps({
  board: { type: Object, required: true },
  targetLanguage: String,
  teachingLanguage: String,
});
const { t } = useI18n();
const focusElement = ref(null);
const source = computed(() => props.board.items.find((item) => item.kind === "source"));
const expression = computed(() => props.board.items.find((item) => item.kind === "expression"));
const focus = computed(
  () =>
    props.board.items.find((item) => item.kind === props.board.active_kind) ||
    props.board.items.at(-1),
);
watch(
  () => focus.value?.text,
  async () => {
    await nextTick();
    if (focusElement.value) focusElement.value.scrollTop = 0;
  },
);
</script>
<style scoped>
.teaching-board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px 5px 40px;
  width: 100%;
  max-width: 680px;
  align-self: center;
}
.board-note {
  min-width: 0;
}
.board-context {
  flex-shrink: 0;
  padding-bottom: 26px;
  max-height: 118px;
  overflow: hidden;
}
.board-context p {
  color: #afc2b3;
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.board-focus {
  min-height: 0;
  padding-bottom: 6px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: #d7e0c52a transparent;
}
.board-label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
  color: #a6bda5;
  font-size: 10px;
  letter-spacing: 0.14em;
}
.board-label::before {
  content: "";
  width: 18px;
  height: 1px;
  background: #b4c8ab65;
}
.board-focus > p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #edeed7;
  font-family: "Segoe Print", "KaiTi", "Microsoft YaHei", serif;
  font-size: clamp(27px, 6.8vw, 42px);
  font-weight: 400;
  line-height: 1.6;
  text-shadow: 0 0.5px 1px #f6f7e21a;
}
.board-expression > p {
  text-decoration: underline;
  text-decoration-color: #d3d09c90;
  text-underline-offset: 9px;
  text-decoration-thickness: 2px;
  padding-bottom: 10px;
}
.board-explanation > p:not(.board-expression-heading) {
  font-family: inherit;
  font-size: 19px;
  color: #c7d6bf;
  line-height: 1.8;
}
.board-focus > .board-expression-heading {
  font-size: 28px;
  color: #e8e7c4;
  margin-bottom: 20px;
}
.board-example > p,
.board-practice > p {
  color: #e9dba4;
}
.board-write-enter-active,
.board-write-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.3s ease;
}
.board-write-enter-from {
  opacity: 0;
  transform: translateY(7px);
}
.board-write-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
@media (prefers-reduced-motion: reduce) {
  .board-write-enter-active,
  .board-write-leave-active {
    transition: none;
  }
}
@media (max-height: 650px) {
  .teaching-board {
    padding: 10px 3px 20px;
  }
  .board-context {
    padding-bottom: 15px;
  }
  .board-label {
    margin-bottom: 12px;
  }
}
</style>
