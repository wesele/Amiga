/**
 * Merge zh-es A2 seed data into unit-framework.json and questions.json.
 * Run: node content-studio/scripts/seed-zh-es-a2.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = resolve(ROOT, "data/zh-es-a2-seed.json");
const FRAMEWORK_PATH = resolve(ROOT, "data/unit-framework.json");
const QUESTIONS_PATH = resolve(ROOT, "data/questions.json");

const PAIR_ID = "zh-es";
const CEFR = "A2";

function buildFrameworkUnits(units) {
  return units.map((u) => ({
    id: u.id,
    titleNative: u.titleNative,
    titleTarget: u.titleTarget,
    goalNative: u.goalNative,
    goalTarget: u.goalTarget,
    vocabCount: u.vocabCount ?? 40,
    grammarPoints: u.grammarPoints ?? [u.goalNative],
    scenarios: u.scenarios ?? [u.goalTarget],
    sections: u.sections.map((s) => ({
      id: s.id,
      titleNative: s.titleNative,
      titleTarget: s.titleTarget,
      coveredWords: s.coveredWords ?? [],
      grammarPoint: s.grammarPoint ?? s.titleTarget,
      scenario: s.scenario ?? s.titleNative,
    })),
  }));
}

function collectQuestions(units) {
  const out = [];
  for (const unit of units) {
    for (const section of unit.sections) {
      const sectionId = `${PAIR_ID}/${unit.id}-${section.id}`;
      for (const q of section.questions ?? []) {
        out.push({
          ...q,
          sectionId: q.sectionId ?? sectionId,
          pairId: q.pairId ?? PAIR_ID,
          cefr: q.cefr ?? CEFR,
        });
      }
    }
  }
  return out;
}

function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const framework = JSON.parse(readFileSync(FRAMEWORK_PATH, "utf8"));
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8"));

  if (!framework[PAIR_ID]) framework[PAIR_ID] = {};
  framework[PAIR_ID][CEFR] = { units: buildFrameworkUnits(seed.units) };

  const newQuestions = seed.questions?.length
    ? seed.questions
    : collectQuestions(seed.units);
  const byId = new Map();
  for (const q of questions.filter((q) => !(q.pairId === PAIR_ID && q.cefr === CEFR))) {
    byId.set(q.id, q);
  }
  for (const q of newQuestions) byId.set(q.id, q);
  const finalQuestions = [...byId.values()];

  writeFileSync(FRAMEWORK_PATH, JSON.stringify(framework));
  writeFileSync(QUESTIONS_PATH, JSON.stringify(finalQuestions));

  console.log(
    `A2: ${seed.units.length} units, ${newQuestions.length} questions (total ${finalQuestions.length})`,
  );
}

main();