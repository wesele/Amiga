import { describe, it, expect } from "vitest";
import {
  titleContentTokens,
  titlesAreSimilarTopic,
  filterSimilarNewsTopics,
} from "../newsTopicFilter.js";

describe("newsTopicFilter", () => {
  it("extracts content tokens and drops short stopwords", () => {
    const tokens = titleContentTokens("Los cinco indicios de Zapatero tras la entrevista");
    expect(tokens.has("zapatero")).toBe(true);
    expect(tokens.has("indicios")).toBe(true);
    expect(tokens.has("los")).toBe(false);
    expect(tokens.has("de")).toBe(false);
  });

  it("detects similar Zapatero headlines as the same topic", () => {
    const a = "Anticorrupción pide ampliar el análisis de las joyas de Zapatero";
    const b = "Los cinco indicios sin respuesta tras las declaraciones de Zapatero en s";
    const c = "La inocencia del inocente Zapatero";
    const d = '"Decepción" en el PSOE con Zapatero tras su entrevista';
    expect(titlesAreSimilarTopic(a, b)).toBe(true);
    expect(titlesAreSimilarTopic(a, c)).toBe(true);
    expect(titlesAreSimilarTopic(b, d)).toBe(true);
  });

  it("keeps unrelated headlines", () => {
    const a = "Anticorrupción pide ampliar el análisis de las joyas de Zapatero";
    const other = "Real Madrid gana la final de la Champions en Londres";
    expect(titlesAreSimilarTopic(a, other)).toBe(false);
  });

  it("filters a list to one article per topic cluster", () => {
    const articles = [
      { original_title: "Anticorrupción pide ampliar el análisis de las joyas de Zapatero" },
      { original_title: "Los cinco indicios sin respuesta tras las declaraciones de Zapatero" },
      { original_title: "La filtración a Plus Ultra del 26-F: tres protagonistas la confirman" },
      { original_title: "La inocencia del inocente Zapatero" },
      { original_title: "Real Madrid gana la final de la Champions en Londres" },
    ];
    const filtered = filterSimilarNewsTopics(articles);
    const titles = filtered.map((a) => a.original_title);
    expect(titles).toHaveLength(3);
    expect(titles[0]).toContain("Anticorrupción");
    expect(titles.some((t) => t.includes("Plus Ultra"))).toBe(true);
    expect(titles.some((t) => t.includes("Real Madrid"))).toBe(true);
    // Later Zapatero duplicates dropped
    expect(titles.filter((t) => /zapatero/i.test(t))).toHaveLength(1);
  });
});
