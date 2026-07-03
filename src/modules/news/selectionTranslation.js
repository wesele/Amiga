import { ref } from "vue";
import { getContextForSelection } from "./phraseVocabMark.js";

export function isTranslatableSelectionText(text) {
  return !!text && text.length > 0 && text.split(/\s+/).length > 1;
}

export function isSingleWordSelectionText(text) {
  return !!text && text.length > 0 && text.split(/\s+/).length === 1;
}

/** Route a trimmed selection to phrase translation or single-word lookup. */
export function resolveSelectionAction(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  if (isSingleWordSelectionText(trimmed)) return "word";
  if (isTranslatableSelectionText(trimmed)) return "translate";
  return null;
}

function defaultSelectionAllowed(selection, { articleBody, isSelectionAllowed, getSelectionRoot }) {
  if (typeof isSelectionAllowed === "function") {
    return isSelectionAllowed(selection);
  }
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  const root = getSelectionRoot?.() ?? articleBody;
  if (!root) return true;
  return root.contains(range.commonAncestorContainer);
}

export function computeTranslateButtonPlacement({
  selection,
  articleBody,
  getSelectionRoot,
  isSelectionAllowed,
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
  if (
    !defaultSelectionAllowed(selection, { articleBody, isSelectionAllowed, getSelectionRoot })
  ) {
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
  getArticleText,
  t,
  articleBody,
  getSelectionRoot,
  isSelectionAllowed,
  onSingleWordSelected,
  windowRef = typeof window === "undefined" ? null : window,
  documentRef = typeof document === "undefined" ? null : document,
} = {}) {
  const selectionText = ref("");
  const selectionContext = ref("");
  const selectionResult = ref("");
  const selectionLoading = ref(false);
  const selectionError = ref("");
  const showTranslateButton = ref(false);
  const translateButtonX = ref(0);
  const translateButtonY = ref(0);
  let selectionTimer = null;
  let isSelecting = false;

  function resolveSelectionContext(text) {
    const articleText = getArticleText?.() ?? articleBody?.textContent ?? "";
    return getContextForSelection(articleText, text);
  }

  function translateSelection(text) {
    if (!isTranslatableSelectionText(text)) return false;

    selectionText.value = text;
    selectionContext.value = resolveSelectionContext(text);
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
      articleBody: articleBody ?? documentRef?.querySelector?.(".article-body"),
      getSelectionRoot,
      isSelectionAllowed,
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

  function finishSingleWordSelection(text, selection) {
    onSingleWordSelected?.(text);
    selection?.removeAllRanges?.();
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
      const wasSelecting = isSelecting;
      isSelecting = false;

      const selection = windowRef?.getSelection?.();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      if (
        !defaultSelectionAllowed(selection, { articleBody, isSelectionAllowed, getSelectionRoot })
      ) {
        return;
      }
      const text = selection.toString().trim();
      const action = resolveSelectionAction(text);
      if (action === "word") {
        finishSingleWordSelection(text, selection);
        return;
      }
      if (!wasSelecting) return;
      if (!translateSelection(text)) return;
      selection.removeAllRanges();
    }, 50);
  }

  function handleNativeTranslate(text) {
    isSelecting = false;
    const trimmed = String(text ?? "").trim();
    const action = resolveSelectionAction(trimmed);
    if (action === "word") {
      finishSingleWordSelection(trimmed, windowRef?.getSelection?.());
      return;
    }
    if (!translateSelection(trimmed)) return;
    windowRef?.getSelection?.()?.removeAllRanges?.();
  }

  function clearSelection() {
    if (selectionTimer) {
      clearTimeout(selectionTimer);
      selectionTimer = null;
    }
    selectionText.value = "";
    selectionContext.value = "";
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
    selectionContext,
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
