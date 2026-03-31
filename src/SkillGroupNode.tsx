import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getTargetHandleId, type HandleSide } from './dialogue';

type SkillGroupNodeData = {
  label: string;
  subtitle: string;
  count: number;
  accentColor?: string;
  dimmed?: boolean;
};

const targetHandleSides: HandleSide[] = ['top', 'right', 'bottom', 'left'];

function getHandlePosition(side: HandleSide): Position {
  if (side === 'top') {
    return Position.Top;
  }
  if (side === 'right') {
    return Position.Right;
  }
  if (side === 'left') {
    return Position.Left;
  }
  return Position.Bottom;
}

function SkillGroupNodeComponent({ data, dragging }: NodeProps) {
  const groupData = data as SkillGroupNodeData;

  return (
    <article
      className={`skill-group-node ${dragging ? 'is-dragging' : ''} ${groupData.dimmed ? 'is-dimmed' : ''}`}
      style={
        {
          '--skill-group-accent': groupData.accentColor ?? '#3c7d70'
        } as CSSProperties
      }
    >
      {targetHandleSides.map((side) => (
        <Handle
          key={side}
          className={`route-target route-target--group route-target--hidden route-target--${side}`}
          id={getTargetHandleId(side)}
          isConnectableStart={false}
          position={getHandlePosition(side)}
          type="target"
        />
      ))}
      <div className="skill-group-node__header">
        <strong>{groupData.label}</strong>
        <span>{groupData.count} outcomes</span>
      </div>
      <div className="skill-group-node__subtitle">{groupData.subtitle}</div>
    </article>
  );
}

export const SkillGroupNode = memo(SkillGroupNodeComponent);
