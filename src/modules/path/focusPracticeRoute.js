import { TRACKED_QUESTION_TYPES } from "@/modules/learn/questionTypeStats.js";

export function isValidFocusType(typeId) {
  return TRACKED_QUESTION_TYPES.includes(typeId);
}

export function focusPracticeRoute(typeId) {
  return { name: "path-focus-practice", params: { typeId } };
}