// A board contains only the current node's short teaching notes, never a lecture.
export const BOARD_KINDS = ["source", "expression", "explanation", "example", "practice"];

export function emptyBoard(node, languageMode) {
  return { node_id: node.id, language_mode: languageMode, items: [] };
}

export function boardEntry(node, kind, text) {
  if (!BOARD_KINDS.includes(kind)) return null;
  // Source and highlighted expressions always come from the saved, verified plan.
  const value =
    kind === "source" ? node.source?.text : kind === "expression" ? node.focus_expression : text;
  if (typeof value !== "string" || !value.trim()) return null;
  return { kind, text: value.trim().slice(0, kind === "source" ? 1500 : 320) };
}

export function writeBoard(board, entry) {
  const items = board.items.filter((item) => item.kind !== entry.kind);
  items.push(entry);
  items.sort((a, b) => BOARD_KINDS.indexOf(a.kind) - BOARD_KINDS.indexOf(b.kind));
  return { ...board, items, active_kind: entry.kind };
}

export function restoreBoard(saved, node, languageMode, beatId) {
  let board = emptyBoard(node, languageMode);
  if (
    saved?.node_id !== node.id ||
    saved.language_mode !== languageMode ||
    !Array.isArray(saved.items)
  )
    return board;
  for (const item of saved.items.slice(0, BOARD_KINDS.length)) {
    const entry = boardEntry(node, item?.kind, item?.text);
    if (entry) board = writeBoard(board, entry);
  }
  if (board.items.some((item) => item.kind === saved.active_kind))
    board.active_kind = saved.active_kind;
  if (beatId && saved.diagram_beat_id === beatId) board.diagram_beat_id = beatId;
  return board;
}
