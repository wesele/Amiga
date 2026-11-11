function point(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0) &&
    value[0] <= 100 &&
    value[1] <= 56
  );
}

function shortText(value, limit) {
  return typeof value === "string" && value.trim() && [...value].length <= limit;
}

function diagramShape(shape) {
  switch (shape?.kind) {
    case "line":
    case "arrow":
    case "polyline": {
      const { kind, points } = shape;
      const max = kind === "polyline" ? 24 : 2;
      if (Array.isArray(points) && points.length >= 2 && points.length <= max && points.every(point))
        return { kind, points };
      break;
    }
    case "dot":
      if (point(shape.at)) return { kind: "dot", at: shape.at };
      break;
    case "label":
      if (point(shape.at) && shortText(shape.text, 28))
        return { kind: "label", at: shape.at, text: shape.text };
      break;
  }
  return null;
}

export function normalizeBoardDiagram(diagram) {
  if (
    !shortText(diagram?.description, 160) ||
    !Array.isArray(diagram.shapes) ||
    !diagram.shapes.length ||
    diagram.shapes.length > 14
  )
    return null;
  const shapes = diagram.shapes.map(diagramShape);
  if (shapes.some((shape) => !shape)) return null;
  return { description: diagram.description, shapes };
}
