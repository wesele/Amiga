import { describe, expect, it } from "vitest";
import {
  buildSessionReviewQueue,
  buildTeachingMicroReviewQueue,
} from "../microReviewQueue.js";

describe("microReviewQueue", () => {
  it("buildSessionReviewQueue preserves session order and caps at limit", () => {
    const sessionWords = [
      { word: "hola", context: "Hola mundo" },
      { word: "casa", context: "Mi casa" },
      { word: "perro" },
      { word: "gato" },
      { word: "sol" },
      { word: "luna" },
    ];
    const dueWords = [{ word: "extra", mastery: 1, id: 9 }];
    const queue = buildSessionReviewQueue(sessionWords, dueWords, 5);
    expect(queue.map((e) => e.word)).toEqual(["hola", "casa", "perro", "gato", "sol"]);
    expect(queue[0].example).toBe("Hola mundo");
  });

  it("buildTeachingMicroReviewQueue uses session order and teaching metadata", () => {
    const teachingWords = [
      { word: "hola", id: 1, mastery: null, definition_zh: "你好" },
      { word: "adiós", id: 2, mastery: 1, definition_zh: "再见" },
      { word: "gracias", id: 3, mastery: 2, definition_zh: "谢谢" },
    ];
    const queue = buildTeachingMicroReviewQueue(
      ["gracias", "hola", "adiós", "extra"],
      teachingWords,
      3,
    );
    expect(queue).toEqual([
      { word: "gracias", id: 3, mastery: 2, definition_zh: "谢谢", source: "path_vocab" },
      { word: "hola", id: 1, mastery: 1, definition_zh: "你好", source: "path_vocab" },
      { word: "adiós", id: 2, mastery: 1, definition_zh: "再见", source: "path_vocab" },
    ]);
  });
});