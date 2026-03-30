import { BaseEdge, EdgeLabelRenderer, Position, type EdgeProps } from '@xyflow/react';

type Point = {
  x: number;
  y: number;
};

function offsetPoint(point: Point, side: Position, distance: number): Point {
  if (side === Position.Top) {
    return { x: point.x, y: point.y - distance };
  }
  if (side === Position.Right) {
    return { x: point.x + distance, y: point.y };
  }
  if (side === Position.Left) {
    return { x: point.x - distance, y: point.y };
  }
  return { x: point.x, y: point.y + distance };
}

function shiftPerpendicular(point: Point, side: Position, offset: number): Point {
  if (side === Position.Top || side === Position.Bottom) {
    return { x: point.x + offset, y: point.y };
  }

  return { x: point.x, y: point.y + offset };
}

function getBezierMidpoint(start: Point, controlA: Point, controlB: Point, end: Point): Point {
  const t = 0.5;
  const inverse = 1 - t;

  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
  };
}

function buildDialoguePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  laneOffset = 0
): { path: string; labelX: number; labelY: number } {
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const distance = Math.max(34, Math.min(86, (Math.abs(targetX - sourceX) + Math.abs(targetY - sourceY)) * 0.14));
  const sourceControl = shiftPerpendicular(offsetPoint(source, sourcePosition, distance * 1.35), sourcePosition, laneOffset);
  const targetControl = shiftPerpendicular(offsetPoint(target, targetPosition, distance * 1.35), targetPosition, laneOffset);
  const midpoint = getBezierMidpoint(source, sourceControl, targetControl, target);
  const path = `M ${source.x} ${source.y} C ${sourceControl.x} ${sourceControl.y}, ${targetControl.x} ${targetControl.y}, ${target.x} ${target.y}`;

  return {
    path,
    labelX: midpoint.x,
    labelY: midpoint.y - 10
  };
}

export function DialogueEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style, markerEnd, data }: EdgeProps) {
  const laneOffset = Number((data as { laneOffset?: number } | undefined)?.laneOffset ?? 0);
  const { path, labelX, labelY } = buildDialoguePath(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, laneOffset);

  return (
    <>
      <BaseEdge id={id} markerEnd={markerEnd} path={path} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="dialogue-edge__label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
            }}
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
