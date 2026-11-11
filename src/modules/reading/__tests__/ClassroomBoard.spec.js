import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ClassroomBoard from "../classroom/ClassroomBoard.vue";
import { emptyBoard, boardEntry, writeBoard, restoreBoard } from "../classroom/classroomBoard.js";

const node = {
  id: "node-1",
  source: { text: "Me viene bien mañana." },
  focus_expression: "viene bien",
};
describe("Live classroom whiteboard", () => {
  it("renders a diagram beside a board note with escaped text labels", () => {
    const board = writeBoard(emptyBoard(node, "native"), boardEntry(node, "explanation", "时间轴"));
    const wrapper = mount(ClassroomBoard, {
      props: {
        board,
        diagram: {
          description: "时间轴示意图",
          shapes: [
            { kind: "arrow", points: [[10, 30], [90, 30]] },
            { kind: "dot", at: [35, 30] },
            { kind: "label", at: [35, 22], text: "<script>" },
          ],
        },
      },
    });
    expect(wrapper.get("svg").attributes("aria-label")).toBe("时间轴示意图");
    expect(wrapper.get("svg polyline").attributes("marker-end")).toMatch(/^url\(#.+\)$/);
    expect(wrapper.get("svg text").text()).toBe("<script>");
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.get(".board-focus").text()).toContain("时间轴");
    wrapper.unmount();
  });
  it("spotlights the latest note while retaining previous notes for later teaching", async () => {
    let board = emptyBoard(node, "native");
    for (const [kind, text] of [
      ["source", ""],
      ["expression", ""],
      ["explanation", "旧解释"],
      ["example", "Me viene bien el lunes."],
    ])
      board = writeBoard(board, boardEntry(node, kind, text));
    const wrapper = mount(ClassroomBoard, {
      props: { board, targetLanguage: "es", teachingLanguage: "zh" },
    });
    expect(wrapper.find(".board-focus").text()).toContain("Me viene bien el lunes.");
    expect(wrapper.text()).not.toContain("旧解释");
    expect(board.items).toHaveLength(4);
    board = writeBoard(board, boardEntry(node, "explanation", "新的说明"));
    await wrapper.setProps({ board });
    expect(wrapper.find(".board-focus").text()).toContain("新的说明");
    expect(wrapper.text()).not.toContain("Me viene bien el lunes.");
    expect(restoreBoard(board, node, "native").active_kind).toBe("explanation");
    wrapper.unmount();
  });
  it("leaves the teaching space blank until notes arrive and renders notes as text", async () => {
    const wrapper = mount(ClassroomBoard, {
      props: { board: emptyBoard(node, "target"), targetLanguage: "es", teachingLanguage: "es" },
    });
    expect(wrapper.findAll(".board-note")).toHaveLength(0);
    let board = writeBoard(emptyBoard(node, "target"), boardEntry(node, "source", "Fake source"));
    board = writeBoard(board, boardEntry(node, "explanation", "<img src=x onerror=alert(1)>"));
    await wrapper.setProps({ board });
    expect(wrapper.findAll(".board-note")).toHaveLength(2);
    expect(wrapper.find(".board-source p").text()).toBe(node.source.text);
    expect(wrapper.find(".board-explanation p").attributes("lang")).toBe("es");
    expect(wrapper.find("img").exists()).toBe(false);
    wrapper.unmount();
  });
  it("bounds notes, replaces a single board slot, and refuses stale node/language snapshots", () => {
    let board = emptyBoard(node, "native");
    board = writeBoard(board, boardEntry(node, "explanation", "first"));
    board = writeBoard(board, boardEntry(node, "explanation", "second"));
    expect(board.items).toEqual([{ kind: "explanation", text: "second" }]);
    expect(boardEntry(node, "example", "a".repeat(1000)).text.length).toBe(320);
    expect(boardEntry(node, "script", "bad")).toBeNull();
    expect(restoreBoard(board, { ...node, id: "node-2" }, "native").items).toEqual([]);
    expect(restoreBoard(board, node, "target").items).toEqual([]);
    expect(restoreBoard(board, node, "native").items).toEqual(board.items);
  });
});
