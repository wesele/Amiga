const KEY = "assessment.quick_session";

export function loadAssessmentDraft(storage = window?.localStorage) {
  const raw = storage?.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAssessmentDraft(draft, storage = window?.localStorage) {
  storage?.setItem(KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
}

export function clearAssessmentDraft(storage = window?.localStorage) {
  storage?.removeItem(KEY);
}
