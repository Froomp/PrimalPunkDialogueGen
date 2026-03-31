import type { CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getTargetHandleId, type HandleSide } from './dialogue';

type TerminalNodeData = {
  label: string;
  subtitle?: string;
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

export function TerminalNode({ data }: NodeProps) {
  const terminalData = data as TerminalNodeData;

  return (
    <article
      className={`terminal-node ${terminalData.dimmed ? 'is-dimmed' : ''}`}
      style={
        {
          '--terminal-accent': '#8b5cf6'
        } as CSSProperties
      }
    >
      {targetHandleSides.map((side) => (
        <Handle
          key={side}
          className={`route-target route-target--terminal route-target--${side}`}
          id={getTargetHandleId(side)}
          isConnectableStart={false}
          position={getHandlePosition(side)}
          type="target"
        />
      ))}
      <div className="terminal-node__label">{terminalData.label}</div>
      {terminalData.subtitle ? <div className="terminal-node__subtitle">{terminalData.subtitle}</div> : null}
    </article>
  );
}
