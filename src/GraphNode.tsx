import { memo, type CSSProperties, type MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FiEdit3, FiEye, FiEyeOff, FiPlus, FiTrash2 } from 'react-icons/fi';
import { choiceHandleId, getChoiceSkillCheck, getChoiceRouteTarget, getSkillColor, getTargetHandleId, type DialogueChoice, type DialogueNode, type DisplayBranch, type HandleSide, type RouteHandleDirectionMap } from './dialogue';
import { useProjectStore } from './store';

type GraphNodeData = {
  node: DialogueNode;
  accentColor?: string;
  routeHandleDirections: RouteHandleDirectionMap;
  groupedChoiceIds?: Set<string>;
  dimmed?: boolean;
  onRequestAddChoice: (nodeId: string) => void;
  onRequestDeleteNode: (node: DialogueNode) => void;
  onRequestDeleteChoice: (nodeId: string, choiceId: string) => void;
};

type RouteHandle = {
  id: string;
  branch: DisplayBranch;
  side: HandleSide;
  crossAxis: number;
  offset: number;
  hidden?: boolean;
};

function buildRouteHandles(node: DialogueNode, routeHandleDirections: RouteHandleDirectionMap, groupedChoiceIds?: Set<string>): RouteHandle[] {
  return node.choices.flatMap((choice, index) => {
    const branches: DisplayBranch[] = [];
    const skillCheck = getChoiceSkillCheck(choice);
    if (!skillCheck && !choice.close) {
      branches.push('next');
    }
    if (skillCheck) {
      branches.push('failure', 'success', 'critical');
    }
    if (choice.close) {
      branches.push('close');
    }

    if (branches.length === 0) {
      return [];
    }

    const crossAxis = ((index + 1) / (node.choices.length + 1)) * 100;
    const offsetsByCount: Record<number, number[]> = {
      1: [0],
      2: [-10, 10],
      3: [-14, 0, 14],
      4: [-20, -7, 7, 20]
    };
    const offsets = offsetsByCount[branches.length] ?? [0];

    const groupedSkillChoice = groupedChoiceIds?.has(choice.id) ?? false;
    const handles: RouteHandle[] = branches.map((branch, branchIndex) => {
      const connected =
        branch === 'next'
          ? Boolean(getChoiceRouteTarget(choice, 'next'))
          : branch === 'close'
            ? Boolean(choice.close)
            : branch === 'failure'
              ? Boolean(skillCheck?.failureNodeId)
              : branch === 'success'
                ? Boolean(skillCheck?.successNodeId)
                : Boolean(skillCheck?.criticalSuccessNodeId);
      const hiddenByGroup = groupedSkillChoice && (branch === 'failure' || branch === 'success' || branch === 'critical');

      return {
        id: choiceHandleId(choice.id, branch),
        branch,
        side: routeHandleDirections[choiceHandleId(choice.id, branch)] ?? 'bottom',
        crossAxis,
        offset: offsets[branchIndex] ?? 0,
        hidden: hiddenByGroup || (branch !== 'next' && !connected)
      };
    });

    if (skillCheck) {
      handles.push({
        id: choiceHandleId(choice.id, 'skill'),
        branch: 'skill',
        side: routeHandleDirections[choiceHandleId(choice.id, 'skill')] ?? 'bottom',
        crossAxis,
        offset: 0,
        hidden: true
      });
    }

    return handles;
  });
}

function getRouteHandleStyle(routeHandle: RouteHandle): CSSProperties {
  if (routeHandle.side === 'top') {
    return {
      left: `calc(${routeHandle.crossAxis}% + ${routeHandle.offset}px)`,
      top: -7,
      transform: 'translateX(-50%)'
    };
  }

  if (routeHandle.side === 'bottom') {
    return {
      left: `calc(${routeHandle.crossAxis}% + ${routeHandle.offset}px)`,
      top: 'auto',
      bottom: -7,
      transform: 'translateX(-50%)'
    };
  }

  if (routeHandle.side === 'left') {
    return {
      left: -7,
      top: `calc(${routeHandle.crossAxis}% + ${routeHandle.offset}px)`,
      transform: 'translateY(-50%)'
    };
  }

  return {
    left: 'auto',
    right: -7,
    top: `calc(${routeHandle.crossAxis}% + ${routeHandle.offset}px)`,
    transform: 'translateY(-50%)'
  };
}

const targetHandleSides: HandleSide[] = ['top', 'right', 'bottom', 'left'];
const visibleTargetHandleSides = new Set<HandleSide>(['bottom']);
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

function getChoiceCheckChips(choice: DialogueChoice): Array<{ id: string; label: string; detail: string; color: string; icon: string; kind: 'skill' | 'event' }> {
  const chips: Array<{ id: string; label: string; detail: string; color: string; icon: string; kind: 'skill' | 'event' }> = [];

  if (choice.visibilityCheck) {
    chips.push({
      id: `${choice.id}:visibility`,
      label: 'Passive',
      detail: choice.visibilityCheck.skill,
      color: getSkillColor(choice.visibilityCheck.skill),
      icon: 'P',
      kind: 'skill'
    });
  }

  if (choice.resolutionCheck) {
    chips.push({
      id: `${choice.id}:resolution`,
      label: 'Active',
      detail: choice.resolutionCheck.skill,
      color: getSkillColor(choice.resolutionCheck.skill),
      icon: 'A',
      kind: 'skill'
    });
  }

  if (choice.eventName) {
    chips.push({
      id: `${choice.id}:event`,
      label: 'Event',
      detail: choice.eventName,
      color: '#e85b5b',
      icon: 'E',
      kind: 'event'
    });
  }

  return chips;
}

function GraphNodeComponent({ data, selected, dragging }: NodeProps) {
  const nodeData = data as GraphNodeData;
  const setSelection = useProjectStore((state) => state.setSelection);
  const setFocusChoice = useProjectStore((state) => state.setFocusChoice);
  const setNodeHidden = useProjectStore((state) => state.setNodeHidden);
  const routeHandles = buildRouteHandles(nodeData.node, nodeData.routeHandleDirections, nodeData.groupedChoiceIds);

  function focusChoice(event: MouseEvent<HTMLButtonElement>, choiceId: string) {
    event.stopPropagation();
    if (nodeData.node.hidden) {
      setNodeHidden(nodeData.node.id, false);
    }
    setFocusChoice({ nodeId: nodeData.node.id, choiceId });
  }

  function openChoice(event: MouseEvent<HTMLButtonElement>, choiceId: string) {
    event.stopPropagation();
    if (nodeData.node.hidden) {
      setNodeHidden(nodeData.node.id, false);
    }
    setFocusChoice({ nodeId: nodeData.node.id, choiceId });
    setSelection({ kind: 'choice', nodeId: nodeData.node.id, choiceId });
  }

  function openNodeEditor(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (nodeData.node.hidden) {
      setNodeHidden(nodeData.node.id, false);
    }
    setFocusChoice(undefined);
    setSelection({ kind: 'node', nodeId: nodeData.node.id });
  }

  return (
    <article
      className={`dialogue-node dialogue-node--parent ${selected ? 'is-selected' : ''} ${dragging ? 'is-dragging' : ''} ${nodeData.node.hidden ? 'is-hidden' : ''} ${nodeData.dimmed ? 'is-dimmed' : ''}`}
      style={
        {
          '--node-accent': nodeData.accentColor ?? '#6b4fc0'
        } as CSSProperties
      }
      >
        {targetHandleSides.map((side) => (
        <Handle
          key={side}
          className={`route-target route-target--${side}${visibleTargetHandleSides.has(side) ? '' : ' route-target--hidden'}`}
          id={getTargetHandleId(side)}
          isConnectableStart={visibleTargetHandleSides.has(side)}
          position={getHandlePosition(side)}
          type="target"
        >
          {visibleTargetHandleSides.has(side) ? <FiPlus aria-hidden="true" className="route-target__icon" /> : null}
        </Handle>
      ))}

      <div className="dialogue-node__header">
        <strong className="dialogue-node__title">{nodeData.node.id}</strong>
        <div className="dialogue-node__actions">
          <button
            aria-label={`Edit node ${nodeData.node.id}`}
            className="node-action-button nodrag nopan"
            data-tooltip={`Edit card: open ${nodeData.node.id}`}
            onClick={openNodeEditor}
            title={`Edit card: open ${nodeData.node.id}`}
            type="button"
          >
            <FiEdit3 aria-hidden="true" />
          </button>
          <button
            aria-label={`${nodeData.node.hidden ? 'Show' : 'Hide'} node ${nodeData.node.id}`}
            className="node-action-button nodrag nopan"
            data-tooltip={nodeData.node.hidden ? `Show node: reveal ${nodeData.node.id}` : `Hide node: dim ${nodeData.node.id}`}
            onClick={(event) => {
              event.stopPropagation();
              setNodeHidden(nodeData.node.id, !nodeData.node.hidden);
            }}
            title={nodeData.node.hidden ? `Show node: reveal ${nodeData.node.id}` : `Hide node: dim ${nodeData.node.id}`}
            type="button"
          >
            {nodeData.node.hidden ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
          </button>
          <button
            aria-label={`Delete node ${nodeData.node.id}`}
            className="node-action-button node-action-button--danger nodrag nopan"
            data-tooltip={`Delete node: remove ${nodeData.node.id}`}
            onClick={(event) => {
              event.stopPropagation();
              nodeData.onRequestDeleteNode(nodeData.node);
            }}
            title={`Delete node: remove ${nodeData.node.id}`}
            type="button"
          >
            <FiTrash2 aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="choice-preview-list">
        {nodeData.node.choices.map((choice) => (
          <div
            key={choice.id}
            className={`choice-preview nodrag nopan ${choice.eventName ? 'choice-preview--eventful' : ''}`}
            style={
              {
                '--choice-accent': choice.color ?? '#9b6bff'
              } as CSSProperties
            }
          >
            <button className="choice-preview__main nodrag nopan" onClick={(event) => focusChoice(event, choice.id)} type="button">
              <span>{choice.text || 'Untitled choice'}</span>
            </button>
            <div className="choice-preview__checks">
              {getChoiceCheckChips(choice).map((chip) => (
                <button
                  key={chip.id}
                  className={`skill-check-chip nodrag nopan ${chip.kind === 'event' ? 'skill-check-chip--event' : ''}`}
                  onClick={(event) => openChoice(event, choice.id)}
                  style={{ '--skill-color': chip.color } as CSSProperties}
                  title={`${chip.label}: ${chip.detail}`}
                  type="button"
                >
                  <span className={`skill-check-chip__icon ${chip.kind === 'event' ? 'skill-check-chip__icon--event' : ''}`}>{chip.icon}</span>
                  <span className="skill-check-chip__skill">{chip.detail}</span>
                </button>
              ))}
            </div>
            <div className="choice-preview__actions">
              <button
                aria-label={`Edit choice ${choice.text || choice.id}`}
                className="choice-action-button nodrag nopan"
                data-tooltip={`Edit choice: open ${choice.text || choice.id}`}
                onClick={(event) => openChoice(event, choice.id)}
                title={`Edit choice: open ${choice.text || choice.id}`}
                type="button"
              >
                <FiEdit3 aria-hidden="true" />
              </button>
              <button
                aria-label={`Delete choice ${choice.text || choice.id}`}
                className="choice-action-button choice-action-button--danger nodrag nopan"
                data-tooltip={`Delete choice: remove ${choice.text || choice.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  nodeData.onRequestDeleteChoice(nodeData.node.id, choice.id);
                }}
                title={`Delete choice: remove ${choice.text || choice.id}`}
                type="button"
              >
                <FiTrash2 aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        {nodeData.node.choices.length === 0 && <div className="muted-copy">No choices yet.</div>}
      </div>

      <div className="choice-create-row">
        <button
          aria-label={`Add choice to ${nodeData.node.id}`}
          className="choice-create-button nodrag nopan"
          data-tooltip={`Add choice: create under ${nodeData.node.id}`}
          onClick={(event) => {
            event.stopPropagation();
            nodeData.onRequestAddChoice(nodeData.node.id);
          }}
          title={`Add choice: create under ${nodeData.node.id}`}
          type="button"
        >
          <FiPlus aria-hidden="true" />
        </button>
      </div>

      {routeHandles.map((routeHandle) => (
        <Handle
          key={routeHandle.id}
          className={`route-handle route-handle--${routeHandle.branch}${routeHandle.hidden ? ' route-handle--ghost' : ''}`}
          id={routeHandle.id}
          position={getHandlePosition(routeHandle.side)}
          style={getRouteHandleStyle(routeHandle)}
          type="source"
        />
      ))}
    </article>
  );
}

export const GraphNode = memo(GraphNodeComponent);
