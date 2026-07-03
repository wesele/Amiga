export const MIN_READING_SEC = 30;

/** Whether the session counts as meaningful reading (show completion summary). */
export function isValidReading({
  elapsedSec = 0,
  unknownCount = 0,
  knownCount = 0,
  lookedUpCount = 0,
} = {}) {
  if (elapsedSec >= MIN_READING_SEC) return true;
  if (unknownCount > 0) return true;
  if (knownCount > 0) return true;
  if (lookedUpCount > 0) return true;
  return false;
}

/** Format seconds as mm:ss for the reading summary. */
export function formatReadingTime(totalSec) {
  const sec = Math.max(0, Math.round(totalSec));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}