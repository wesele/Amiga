import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";
import {
  LESSON_PHASE_MAIN,
  LESSON_PHASE_REINFORCEMENT,
  buildReinforcementQueue,
} from "./lessonReinforcement.js";

export const LESSON_IN_FLIGHT_STORAGE_KEY = "lesson_in_flight_v1";
export const LESSON_IN_FLIGHT_TTL_MS = 24 * 60 * 60 * 1000;

/** Scope key for a native/target/CEFR learning pair. */
export function buildPairKey(nativeLang, targetLang, cefr) {
  return `${nativeLang}:${targetLang}:${cefr}`;
}

function readStore() {
  const data = readLocalJson(LESSON_IN_FLIGHT_STORAGE_KEY, { entries: {} });
  return data?.entries && typeof data.entries === "object" ? data.entries : {};
}

function writeStore(entries) {
  writeLocalJson(LESSON_IN_FLIGHT_STORAGE_KEY, { entries });
}

export function isSnapshotFresh(snapshot, now = Date.now()) {
  if (!snapshot?.savedAt) return false;
  return now - snapshot.savedAt < LESSON_IN_FLIGHT_TTL_MS;
}

function questionIdsMatch(snapshotIds, questionIds) {
  if (!Array.isArray(snapshotIds) || !Array.isArray(questionIds)) return false;
  if (snapshotIds.length !== questionIds.length) return false;
  return snapshotIds.every((id, idx) => id === questionIds[idx]);
}

/** Whether a stored snapshot can resume the current question set. */
export function validateLessonInFlight(snapshot, questionIds, now = Date.now()) {
  if (!snapshot) return false;
  if (!isSnapshotFresh(snapshot, now)) return false;
  return questionIdsMatch(snapshot.questionIds, questionIds);
}

export function peekLessonInFlight(pairKey, sectionId) {
  if (!pairKey || !sectionId) return null;
  const entries = readStore();
  return entries[pairKey]?.[sectionId] ?? null;
}

export function saveLessonInFlight(snapshot) {
  if (!snapshot?.pairKey || !snapshot?.sectionId) return;
  const entries = readStore();
  const scoped = { ...(entries[snapshot.pairKey] ?? {}) };
  scoped[snapshot.sectionId] = {
    ...snapshot,
    savedAt: snapshot.savedAt ?? Date.now(),
  };
  writeLocalJson(LESSON_IN_FLIGHT_STORAGE_KEY, {
    entries: {
      ...entries,
      [snapshot.pairKey]: scoped,
    },
  });
}

export function clearLessonInFlight(pairKey, sectionId) {
  if (!pairKey || !sectionId) return;
  const entries = readStore();
  const scoped = entries[pairKey];
  if (!scoped?.[sectionId]) return;
  const nextScoped = { ...scoped };
  delete nextScoped[sectionId];
  const nextEntries = { ...entries };
  if (Object.keys(nextScoped).length === 0) {
    delete nextEntries[pairKey];
  } else {
    nextEntries[pairKey] = nextScoped;
  }
  writeStore(nextEntries);
}

/** Rebuild the reinforcement queue from persisted mistake ids. */
export function rebuildReinforcementQueue(questions, mistakeQuestionIds) {
  if (!Array.isArray(questions) || !Array.isArray(mistakeQuestionIds)) return [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  return mistakeQuestionIds.map((id) => byId.get(id)).filter(Boolean);
}

export function rebuildMistakesFromSnapshot(questions, snapshot) {
  const ids = snapshot?.mistakeQuestionIds ?? [];
  const reinforcedCutoff =
    snapshot?.phase === LESSON_PHASE_REINFORCEMENT
      ? snapshot.reinforcementIndex ?? 0
      : 0;
  return ids
    .map((id, idx) => {
      const question = questions.find((q) => q.id === id);
      if (!question) return null;
      return {
        question,
        answer: null,
        feedback: null,
        reinforced:
          snapshot?.phase === LESSON_PHASE_REINFORCEMENT && idx < reinforcedCutoff,
      };
    })
    .filter(Boolean);
}

export function formatInFlightProgress(snapshot, totalQuestions) {
  const total = totalQuestions || snapshot?.questionIds?.length || 0;
  if (!snapshot || !total) return null;
  const current =
    snapshot.phase === LESSON_PHASE_REINFORCEMENT
      ? total
      : Math.min((snapshot.index ?? 0) + 1, total);
  return {
    current,
    total,
    comboCount: snapshot.comboCount ?? 0,
    phase: snapshot.phase ?? LESSON_PHASE_MAIN,
  };
}

/** UI helper: read a TTL-valid in-flight summary for map/hub surfaces. */
export function practiceInFlightSummary(
  pairKey,
  sectionId,
  totalQuestions,
  now = Date.now(),
) {
  const snapshot = peekLessonInFlight(pairKey, sectionId);
  if (!isSnapshotFresh(snapshot, now)) return null;
  return formatInFlightProgress(snapshot, totalQuestions);
}

export function shouldPersistLessonInFlight({
  finished = false,
  index = 0,
  correctCount = 0,
  phase = LESSON_PHASE_MAIN,
} = {}) {
  if (finished) return false;
  return (
    index > 0 ||
    correctCount > 0 ||
    phase === LESSON_PHASE_REINFORCEMENT
  );
}

export function buildLessonInFlightSnapshot({
  pairKey,
  sectionId,
  questions = [],
  index = 0,
  correctCount = 0,
  comboCount = 0,
  phase = LESSON_PHASE_MAIN,
  reinforcementIndex = 0,
  mistakes = [],
  savedAt = Date.now(),
} = {}) {
  return {
    pairKey,
    sectionId,
    savedAt,
    questionIds: questions.map((q) => q.id).filter(Boolean),
    index,
    correctCount,
    comboCount,
    phase,
    reinforcementIndex,
    mistakeQuestionIds: mistakes
      .map((item) => item?.question?.id)
      .filter(Boolean),
  };
}