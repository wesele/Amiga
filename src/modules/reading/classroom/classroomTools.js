const tool = (name, description, properties, required = []) => ({
  name,
  description,
  behavior: "NON_BLOCKING",
  parameters: {
    type: "OBJECT",
    properties: { control_epoch: { type: "INTEGER" }, ...properties },
    required: ["control_epoch", ...required],
  },
});
const string = { type: "STRING" };
export const classroomTools = [
  tool(
    "write_classroom_board",
    "Write ONE short note as you explain it, in the chosen teaching language and CEFR level. Source/expression text is pinned to the saved plan. Do not reveal practice answers before the student tries. Never dump the whole plan.",
    {
      node_id: string,
      beat_id: string,
      kind: {
        type: "STRING",
        enum: ["source", "expression", "explanation", "example", "practice"],
      },
      text: string,
    },
    ["node_id", "beat_id", "kind"],
  ),
  tool(
    "complete_teaching_beat",
    "Report only when you have explained the CURRENT beat. Do not advance yourself.",
    { node_id: string, beat_id: string },
    ["node_id", "beat_id"],
  ),
  tool(
    "begin_interaction",
    "Register the requested optional speaking interaction. Ask one short question and end your turn to wait.",
    { interaction_id: string },
    ["interaction_id"],
  ),
  tool(
    "finish_interaction",
    "The student answered the current practice. Give brief feedback, then end the turn.",
    { interaction_id: string, feedback: string },
    ["interaction_id"],
  ),
  tool(
    "report_student_question",
    "The student is asking a question, not answering the practice. Answer briefly, then wait for explicit continue.",
    {},
  ),
  tool(
    "request_classroom_control",
    "Execute a clear student control request. Do not narrate pause or internal controls.",
    { action: { type: "STRING", enum: ["pause", "continue", "skip", "listen_only", "guided"] } },
    ["action"],
  ),
];
