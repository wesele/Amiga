import {
  buildGrammarPracticeContext,
  buildGrammarPracticeStarter,
} from "@/modules/path/grammarAiPractice.js";

/**
 * Build a starter that quizzes words the learner just reviewed.
 * @param {string[]} words
 */
export function buildReviewedWordsStarter(words) {
  const list = Array.isArray(words) ? words.map((word) => String(word).trim()).filter(Boolean) : [];
  if (!list.length) return null;
  return {
    id: "reviewed-words",
    labelKey: "chat.starterReviewedWords",
    labelParams: { preview: list.slice(0, 3).join(", ") },
    messageKey: "chat.starterReviewedWordsMsg",
    messageParams: { words: list.join(", ") },
  };
}

/**
 * Pick contextual quick-start chips for an empty Amiga chat session.
 *
 * @param {object} ctx
 * @param {{ unit: object, section: object } | null} ctx.currentSection
 * @param {object} [ctx.teachingPreview]
 * @param {{ typeId: string } | null} [ctx.focusArea]
 * @param {string} [ctx.targetLabel]
 * @returns {Array<{ id: string, labelKey: string, messageKey: string, messageParams?: object, labelParams?: object }>}
 */
export function pickChatStarters(ctx) {
  const {
    currentSection = null,
    teachingPreview = null,
    focusArea = null,
    targetLabel = "",
    pendingWords = null,
  } = ctx ?? {};

  const starters = [];
  const pendingStarter = buildReviewedWordsStarter(pendingWords);
  if (pendingStarter) {
    starters.push(pendingStarter);
  }

  if (currentSection) {
    const { unit, section } = currentSection;
    if (section.kind === "grammar" && teachingPreview?.grammar_points?.length) {
      const grammarStarter = buildGrammarPracticeStarter(
        buildGrammarPracticeContext({
          sectionId: section.id ?? "",
          unitTitleNative: unit.title_native ?? "",
          grammarPoints: teachingPreview.grammar_points,
          scenarios: teachingPreview.scenarios ?? [],
          targetLang: targetLabel,
        }),
      );
      if (grammarStarter) starters.push(grammarStarter);
    } else if (section.kind === "vocab" && teachingPreview?.words?.length) {
      starters.push({
        id: "practice-vocab",
        labelKey: "chat.starterPracticeVocab",
        messageKey: "chat.starterPracticeVocabMsg",
      });
    } else if (section.kind === "practice") {
      starters.push({
        id: "practice-unit",
        labelKey: "chat.starterPracticeUnit",
        messageKey: "chat.starterPracticeUnitMsg",
        messageParams: { unit: unit.title_native ?? "" },
      });
    }
  }

  if (starters.length < 3 && focusArea?.typeId) {
    starters.push({
      id: "weak-type",
      labelKey: "chat.starterWeakType",
      labelParams: { typeKey: `learn.focusType${focusArea.typeId}` },
      messageKey: "chat.starterWeakTypeMsg",
      messageParams: { typeKey: `learn.focusType${focusArea.typeId}` },
    });
  }

  if (starters.length === 0) {
    starters.push({
      id: "free-chat",
      labelKey: "chat.starterFreeChat",
      labelParams: { target: targetLabel },
      messageKey: "chat.starterFreeChatMsg",
      messageParams: { target: targetLabel },
    });
  }

  return starters.slice(0, 3);
}