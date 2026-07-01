import { ref } from "vue";

export function isTranslatableSelectionText(text) {
  return !!text && text.length > 0 && text.split(/\s+/).length > 1;
}

export function computeTranslateButtonPlacement({
  selection,
  articleBody,
  viewportWidth,
  viewportHeight,
}) {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return { visible: false, x: 0, y: 0 };
  }

  const text = selection.toString().trim();
  if (!isTranslatableSelectionText(text)) {
    return { visible: false, x: 0, y: 0 };
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return { visible: false, x: 0, y: 0 };
  }
  if (articleBody && !articleBody.contains(range.commonAncestorContainer)) {
    return { visible: false, x: 0, y: 0 };
  }

  const buttonWidth = 88;
  const buttonHeight = 32;
  const margin = 8;
  let y = rect.bottom + margin;
  if (y + buttonHeight > viewportHeight - margin) {
    y = rect.top - buttonHeight - margin;
  }
  const x = Math.max(
    margin,
    Math.min(viewportWidth - buttonWidth - margin, rect.right - buttonWidth),
  );
  return { visible: true, x, y };
}

export function useSelectionTranslation({
  translateText,
  getTargetLang,
  getNativeLang,
  t,
  windowRef = typeof window === "undefined" ? null : window,
  documentRef = typeof document === "undefined" ? null : document,
} = {}) {
  const selectionText = ref("");
  const selectionResult = ref("");
  const selectionLoading = ref(false);
  const selectionError = ref("");
  const showTranslateButton = ref(false);
  const translateButtonX = ref(0);
  const translateButtonY = ref(0);
  let selectionTimer = null;
  let isSelecting = false;

  function translateSelection(text) {
    if (!isTranslatableSelectionText(text)) return false;

    selectionText.value = text;
    selectionLoading.value = true;
    selectionResult.value = "";
    selectionError.value = "";

    translateText(text, getTargetLang(), getNativeLang())
      .then((result) => {
        selectionResult.value = result;
        selectionLoading.value = false;
      })
      .catch((err) => {
        selectionError.value = typeof err === "string" ? err : t("news.translateFail");
        selectionLoading.value = false;
      });

    return true;
  }

  function positionTranslateButton(selection) {
    const placement = computeTranslateButtonPlacement({
      selection,
      articleBody: documentRef?.querySelector?.(".article-body"),
      viewportWidth: windowRef?.innerWidth || 0,
      viewportHeight: windowRef?.innerHeight || 0,
    });
    showTranslateButton.value = placement.visible;
    if (placement.visible) {
      translateButtonX.value = placement.x;
      translateButtonY.value = placement.y;
    }
  }

  function onSelectionChange() {
    const selection = windowRef?.getSelection?.();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      isSelecting = false;
      showTranslateButton.value = false;
      return;
    }
    const text = selection.toString().trim();
    if (isTranslatableSelectionText(text)) {
      isSelecting = true;
      positionTranslateButton(selection);
    } else {
      showTranslateButton.value = false;
    }
  }

  function onTranslateButtonClick() {
    const selection = windowRef?.getSelection?.();
    if (!selection) return;
    const text = selection.toString().trim();
    if (!text || !translateSelection(text)) return;
    selection.removeAllRanges();
    showTranslateButton.value = false;
    try {
      windowRef?.__amigaFinishSelectionMode?.();
    } catch (_) {
      // Native bridge is best-effort.
    }
  }

  function onPointerUp() {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      selectionTimer = null;
      if (!isSelecting) return;
      isSelecting = false;

      const selection = windowRef?.getSelection?.();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const text = selection.toString().trim();
      if (!translateSelection(text)) return;
      selection.removeAllRanges();
    }, 50);
  }

  function handleNativeTranslate(text) {
    isSelecting = false;
    if (!translateSelection(text)) return;
    windowRef?.getSelection?.()?.removeAllRanges?.();
  }

  function clearSelection() {
    if (selectionTimer) {
      clearTimeout(selectionTimer);
      selectionTimer = null;
    }
    selectionText.value = "";
    selectionResult.value = "";
    selectionError.value = "";
    selectionLoading.value = false;
  }

  function cleanup() {
    if (selectionTimer) {
      clearTimeout(selectionTimer);
      selectionTimer = null;
    }
  }

  return {
    selectionText,
    selectionResult,
    selectionLoading,
    selectionError,
    showTranslateButton,
    translateButtonX,
    translateButtonY,
    translateSelection,
    onSelectionChange,
    onPointerUp,
    handleNativeTranslate,
    onTranslateButtonClick,
    clearSelection,
    cleanup,
  };
}
