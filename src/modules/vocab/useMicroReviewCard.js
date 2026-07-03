import { computed, ref, unref } from "vue";
import {
  isVocabSwipeTap,
  shouldAbortVocabSwipe,
  vocabSwipeDragStyle,
  vocabSwipeRating,
} from "./vocabSwipeRating.js";
import {
  VOCAB_CARD_MODES,
  canRateCard,
  isRecallCardMode,
} from "./vocabRecallMode.js";

/** Flashcard flip + swipe interactions shared by micro-review sheets. */
export function useMicroReviewCard({ cardMode = () => VOCAB_CARD_MODES.CLASSIC } = {}) {
  const flipped = ref(false);
  const revealed = ref(false);
  const acting = ref(false);
  const ratingAck = ref(null);
  const swipeOffsetX = ref(0);
  const swipeDragging = ref(false);
  let swipeConsumed = false;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeActive = false;
  let swipeAborted = false;

  const activeCardMode = computed(() => unref(cardMode) ?? VOCAB_CARD_MODES.CLASSIC);

  const swipeEnabled = computed(() =>
    canRateCard({
      mode: activeCardMode.value,
      flipped: flipped.value,
      revealed: revealed.value,
      acting: acting.value,
      ratingAck: ratingAck.value,
    }),
  );

  const swipeStyle = computed(() => {
    if (!swipeDragging.value || swipeOffsetX.value === 0) return undefined;
    return vocabSwipeDragStyle(swipeOffsetX.value);
  });

  function resetSwipeState() {
    swipeOffsetX.value = 0;
    swipeDragging.value = false;
    swipeActive = false;
    swipeAborted = false;
  }

  function resetCard() {
    flipped.value = false;
    revealed.value = false;
    ratingAck.value = null;
    resetSwipeState();
    swipeConsumed = false;
  }

  function revealAnswer() {
    if (acting.value || revealed.value) return false;
    revealed.value = true;
    flipped.value = true;
    return true;
  }

  function onCardClick() {
    if (swipeConsumed) {
      swipeConsumed = false;
      return false;
    }
    if (acting.value) return false;
    if (isRecallCardMode(activeCardMode.value) && !revealed.value) {
      return false;
    }
    flipped.value = !flipped.value;
    if (activeCardMode.value === VOCAB_CARD_MODES.CLASSIC) {
      revealed.value = flipped.value;
    }
    return true;
  }

  function onSwipeDown(event) {
    if (!swipeEnabled.value) return;
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
    swipeActive = true;
    swipeAborted = false;
    swipeDragging.value = false;
    swipeOffsetX.value = 0;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onSwipeMove(event) {
    if (!swipeActive || swipeAborted) return null;
    const deltaX = event.clientX - swipeStartX;
    const deltaY = event.clientY - swipeStartY;
    if (!swipeDragging.value && shouldAbortVocabSwipe({ deltaX, deltaY })) {
      swipeAborted = true;
      resetSwipeState();
      return null;
    }
    if (
      !swipeDragging.value &&
      !isVocabSwipeTap(deltaX, deltaY) &&
      Math.abs(deltaX) > 6
    ) {
      swipeDragging.value = true;
    }
    if (swipeDragging.value) {
      swipeOffsetX.value = deltaX;
      event.preventDefault();
    }
    return null;
  }

  function onSwipeUp(event) {
    if (!swipeActive) return null;
    const deltaX = event.clientX - swipeStartX;
    const deltaY = event.clientY - swipeStartY;
    const rating = swipeDragging.value ? vocabSwipeRating(deltaX) : null;

    if (rating === "got_it") {
      swipeConsumed = true;
      resetSwipeState();
      return 2;
    }
    if (rating === "still_learning") {
      swipeConsumed = true;
      resetSwipeState();
      return 1;
    }

    resetSwipeState();
    if (!isVocabSwipeTap(deltaX, deltaY)) {
      swipeConsumed = true;
    }
    return null;
  }

  function onSwipeCancel() {
    resetSwipeState();
  }

  return {
    flipped,
    revealed,
    acting,
    ratingAck,
    swipeDragging,
    swipeEnabled,
    swipeStyle,
    resetCard,
    revealAnswer,
    onCardClick,
    onSwipeDown,
    onSwipeMove,
    onSwipeUp,
    onSwipeCancel,
  };
}