import { describe, it, expect } from "vitest";
import {
  optionLabels,
  normalizeQuestions,
  readingOptionClass,
} from "../readingTestQuestions.js";

describe("readingTestQuestions", () => {
  const baseQuestion = {
    question: "Which one?",
    options: ["a", "b", "c", "d"],
    correct_index: 1,
  };

  describe("normalizeQuestions", () => {
    it("returns an empty array for non-array input", () => {
      expect(normalizeQuestions(null)).toEqual([]);
      expect(normalizeQuestions(undefined)).toEqual([]);
      expect(normalizeQuestions("nope")).toEqual([]);
    });

    it("normalizes a valid zero-based question and coerces option values to strings", () => {
      const [q] = normalizeQuestions([
        { question: "Pick", options: [1, 2, 3, 4], correct: 2 },
      ]);
      expect(q.options).toEqual(["1", "2", "3", "4"]);
      expect(q.correct_index).toBe(2);
      expect(q.question_type).toBe("reading");
      expect(q.audio_text).toBe("");
    });

    it("resolves a letter answer to its option index", () => {
      const [q] = normalizeQuestions([
        { question: "Pick", options: ["a", "b", "c", "d"], correct_index: "C" },
      ]);
      expect(q.correct_index).toBe(2);
    });

    it("converts one-based numeric answers to zero-based when any answer equals the option count", () => {
      const result = normalizeQuestions([
        { question: "Q1", options: ["a", "b", "c", "d"], correct_index: 4 },
        { question: "Q2", options: ["a", "b", "c", "d"], correct_index: 1 },
      ]);
      expect(result[0].correct_index).toBe(3);
      expect(result[1].correct_index).toBe(0);
    });

    it("keeps numeric answers zero-based when no answer equals the option count", () => {
      const [q] = normalizeQuestions([
        { question: "Q", options: ["a", "b", "c", "d"], correct_index: 2 },
      ]);
      expect(q.correct_index).toBe(2);
    });

    it("does not shift letter answers even when one-based indexing is detected", () => {
      const result = normalizeQuestions([
        { question: "Q1", options: ["a", "b", "c", "d"], correct_index: 4 },
        { question: "Q2", options: ["a", "b", "c", "d"], correct_index: "A" },
      ]);
      expect(result[1].correct_index).toBe(0);
    });

    it("drops questions that do not have exactly four options", () => {
      const result = normalizeQuestions([
        { question: "Too few", options: ["a", "b", "c"], correct_index: 1 },
        baseQuestion,
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].question).toBe("Which one?");
    });

    it("drops questions with an out-of-range correct index", () => {
      const result = normalizeQuestions([
        { question: "Bad", options: ["a", "b", "c", "d"], correct_index: 9 },
      ]);
      expect(result).toEqual([]);
    });

    it("drops reading questions without prompt text", () => {
      const result = normalizeQuestions([
        { question: "", options: ["a", "b", "c", "d"], correct_index: 1 },
      ]);
      expect(result).toEqual([]);
    });

    it("validates listening questions by audio_text instead of prompt", () => {
      const result = normalizeQuestions([
        {
          question: "",
          question_type: "listening",
          audio_text: "listen carefully",
          options: ["a", "b", "c", "d"],
          correct_index: 0,
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].question_type).toBe("listening");
      expect(result[0].audio_text).toBe("listen carefully");
    });

    it("drops listening questions that lack audio_text", () => {
      const result = normalizeQuestions([
        {
          question: "prompt",
          question_type: "listening",
          options: ["a", "b", "c", "d"],
          correct_index: 0,
        },
      ]);
      expect(result).toEqual([]);
    });

    it("supports the type and audioText aliases", () => {
      const [q] = normalizeQuestions([
        {
          type: "listening",
          audioText: "hola",
          options: ["a", "b", "c", "d"],
          correct_index: 1,
        },
      ]);
      expect(q.question_type).toBe("listening");
      expect(q.audio_text).toBe("hola");
    });
  });

  describe("readingOptionClass", () => {
    const question = { correct_index: 2 };

    it("returns an empty string before an answer is selected", () => {
      expect(readingOptionClass(question, undefined, 0)).toBe("");
    });

    it("marks the correct option regardless of the selected answer", () => {
      expect(readingOptionClass(question, 0, 2)).toBe("correct");
    });

    it("marks the selected wrong option", () => {
      expect(readingOptionClass(question, 0, 0)).toBe("wrong");
    });

    it("dims other options once an answer is selected", () => {
      expect(readingOptionClass(question, 0, 1)).toBe("dimmed");
    });
  });

  it("exposes the canonical option labels", () => {
    expect(optionLabels).toEqual(["A", "B", "C", "D"]);
  });
});
