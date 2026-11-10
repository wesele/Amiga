import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeWebCommand, webStateStore } from "../webBackend.js";
import { freshSession, normalizePlan } from "@/modules/reading/classroom/teachingPlan.js";
import {
  mintClassroomToken,
  classroomTokenAllowed,
} from "../../../../deploy/web/classroom-token.js";

const plan = normalizePlan(
  {
    goals: ["打招呼"],
    nodes: [
      {
        title: "hi",
        objective: "greeting",
        focus_expression: "hola",
        source_quote: "hola",
        key_points: ["hola 表示你好"],
        examples: [{ text: "Hola, Ana.", meaning: "你好，安娜。" }],
        para_idx: 0,
        beats: [{ objective: "explain", board_text: "hola = 你好" }],
        practice: {
          kind: "repeat",
          objective: "跟读问候",
          scaffold: "Hola, … + 名字",
          answer_example: "Hola, Ana.",
        },
      },
    ],
  },
  { title: "Hi", paragraphs: [{ para_idx: 0, text: "hola", start: 0, end: 2 }] },
  "version-1",
);
beforeEach(async () => {
  await webStateStore.reset();
  await webStateStore.update((s) => {
    s.imported_articles = [
      { id: 901, user_id: "demo-user", target_language: "es", subtitles_json: "[]" },
    ];
    s.imported_article_chapters = [
      { id: 902, article_id: 901, chapter_index: 0, slides: [{ term: "hola" }], viewed_pages: 1 },
    ];
    s.chapter_classrooms = { 902: { plan, session: null } };
    return null;
  });
});
describe("Web classroom contract", () => {
  it("persists classroom progress independently of archived card progress, rejecting stale saves", async () => {
    const session = freshSession(plan);
    const saved = await invokeWebCommand("save_chapter_classroom_cmd", { chapterId: 902, session });
    expect(saved.revision).toBe(1);
    await expect(
      invokeWebCommand("save_chapter_classroom_cmd", { chapterId: 902, session }),
    ).rejects.toThrow(/已更新/);
    const result = await invokeWebCommand("get_chapter_classroom_cmd", { chapterId: 902 });
    expect(result.session).toEqual(saved);
    expect(result.chapter.viewed_pages).toBe(1);
    expect(result.chapter.slides).toEqual([{ term: "hola" }]);
    await invokeWebCommand("delete_imported_article_cmd", { id: 901 });
    expect((await webStateStore.get()).chapter_classrooms[902]).toBeUndefined();
  });
  it("does not leak upstream errors or accept arbitrary token destinations", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ name: "auth_tokens/short" }),
    }));
    expect(await mintClassroomToken({ apiKey: "server-secret", fetchImpl })).toEqual({
      token: "auth_tokens/short",
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.uses).toBe(1);
    expect(body.bidiGenerateContentSetup.model).toBe("models/gemini-3.8-live");
    expect(
      classroomTokenAllowed({
        method: "POST",
        headers: { "x-amiga-classroom": "1", host: "app.test", origin: "https://evil.test" },
      }),
    ).toBe(false);
    await expect(
      mintClassroomToken({ apiKey: "secret", fetchImpl: async () => ({ ok: false, status: 401 }) }),
    ).rejects.toThrow("401");
  });
});
