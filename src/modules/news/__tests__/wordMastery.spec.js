import { describe, it, expect } from "vitest";
import {
  buildMasteryMap,
  wordMasteryClass,
  tokenMastery,
  resolveWordClass,
  wordKey,
} from "../wordMastery.js";

describe("wordMastery", () => {
  it("buildMasteryMap lowercases keys", () => {
    const map = buildMasteryMap([
      { word: "Hola", mastery: 2 },
      { word: "gato", mastery: 1 },
    ]);
    expect(map.get("hola")).toBe(2);
    expect(map.get("gato")).toBe(1);
  });

  it("maps mastery levels to CSS classes", () => {
    expect(wordMasteryClass(2)).toBe("word-mastered");
    expect(wordMasteryClass(1)).toBe("word-seen");
    expect(wordMasteryClass(0)).toBe("word-new");
    expect(wordMasteryClass(null)).toBe("word-new");
    expect(wordMasteryClass(1, true)).toBe("word-session-marked");
  });

  it("tokenMastery defaults missing words to unseen", () => {
    const map = buildMasteryMap([{ word: "hola", mastery: 2 }]);
    expect(tokenMastery({ isWord: true, text: "Hola" }, map)).toBe(2);
    expect(tokenMastery({ isWord: true, text: "perro" }, map)).toBe(0);
    expect(tokenMastery({ isWord: false, text: "," }, map)).toBeNull();
  });

  it("resolveWordClass honors session marked set", () => {
    const map = buildMasteryMap([{ word: "gato", mastery: 1 }]);
    const marked = new Set([wordKey("Gato")]);
    expect(resolveWordClass({ isWord: true, text: "Gato" }, map, marked)).toBe(
      "word-session-marked",
    );
  });
});