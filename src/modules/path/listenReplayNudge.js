import { hasQuestionAudio } from "./questionAudio.js";

export function shouldShowListenReplay({ showResult, lastCorrect, question }) {
  return showResult && !lastCorrect && hasQuestionAudio(question);
}