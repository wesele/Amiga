import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../VocabPage.vue"), "utf8");

describe("VocabPage TV focus rings", () => {
  it("uses inset focus rings on level cards so top edge is not clipped by overflow", () => {
    expect(source).toMatch(/\.level-card:focus-visible/);
    expect(source).toMatch(/outline-offset:\s*-4px\s*!important/);
    expect(source).toMatch(/transform:\s*none/);
    // Scroll container still clips outer outlines; inset is required.
    expect(source).toMatch(/\.level-cards[\s\S]*?overflow-y:\s*auto/);
  });
});
