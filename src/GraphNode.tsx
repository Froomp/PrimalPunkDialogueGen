import { memo, useEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FiPlus } from 'react-icons/fi';
import { choiceHandleId, getSkillColor, getTargetHandleId, type DialogueChoice, type DialogueNode, type DisplayBranch, type HandleSide, type RouteHandleDirectionMap } from './dialogue';
import { useProjectStore } from './store';

type GraphNodeData = {
  node: DialogueNode;
  accentColor?: string;
  routeHandleDirections: RouteHandleDirectionMap;
  groupedChoiceIds?: Set<string>;
  dimmed?: boolean;
};

type RouteHandle = {
  id: string;
  branch: DisplayBranch;
  side: HandleSide;
  crossAxis: number;
  offset: number;
  hidden?: boolean;
};

const CHOICE_CONNECT_LONG_PRESS_MS = 280;
const CHOICE_CONNECT_MOVE_TOLERANCE = 8;

function buildRouteHandles(node: DialogueNode, routeHandleDirections: RouteHandleDirectionMap, groupedChoiceIds?: Set<string>): RouteHandle[] {
  return node.choices.flatMap((choice, index) => {
    const branches: DisplayBranch[] = [];
    if (choice.resolutionCheck) {
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
          ? Boolean(choice.nextNodeId)
          : branch === 'close'
            ? Boolean(choice.close)
            : branch === 'failure'
              ? Boolean(choice.resolutionCheck?.failureNodeId)
              : branch === 'success'
                ? Boolean(choice.resolutionCheck?.successNodeId)
                : Boolean(choice.resolutionCheck?.criticalSuccessNodeId);
      const hiddenByGroup = groupedSkillChoice && (branch === 'failure' || branch === 'success' || branch === 'critical');

      return {
        id: choiceHandleId(choice.id, branch),
        branch,
        side: routeHandleDirections[choiceHandleId(choice.id, branch)] ?? 'bottom',
        crossAxis,
        offset: offsets[branchIndex] ?? 0,
        hidden: hiddenByGroup || !connected
      };
    });

    if (choice.resolutionCheck) {
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
  const addChoice = useProjectStore((state) => state.addChoice);
  const addLeaveChoice = useProjectStore((state) => state.addLeaveChoice);
  const setNodeHidden = useProjectStore((state) => state.setNodeHidden);
  const deleteNode = useProjectStore((state) => state.deleteNode);
  const routeHandles = buildRouteHandles(nodeData.node, nodeData.routeHandleDirections, nodeData.groupedChoiceIds);
  const connectHandleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const suppressChoiceClickRef = useRef<string | null>(null);
  const pendingConnectRef = useRef<
    | {
        choiceId: string;
        startX: number;
        startY: number;
        pointerType: string;
        mouseEventInit: MouseEventInit;
        timerId: number;
        activated: boolean;
        removeListeners: () => void;
      }
    | undefined
  >(undefined);

  useEffect(() => () => {
    const pending = pendingConnectRef.current;
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timerId);
    pending.removeListeners();
    pendingConnectRef.current = undefined;
  }, []);

  function clearPendingChoiceConnect() {
    const pending = pendingConnectRef.current;
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timerId);
    pending.removeListeners();
    pendingConnectRef.current = undefined;
  }

  function consumeSuppressedChoiceClick(choiceId: string) {
    if (suppressChoiceClickRef.current !== choiceId) {
      return false;
    }

    suppressChoiceClickRef.current = null;
    return true;
  }

  function isChoiceConnectGestureTarget(target: EventTarget | null) {
    return target instanceof Element && !target.closest('.choice-preview__checks, .choice-preview__actions');
  }

  function beginChoiceConnect(event: ReactPointerEvent<HTMLDivElement>, choice: DialogueChoice) {
    if (choice.resolutionCheck || choice.close || !isChoiceConnectGestureTarget(event.target)) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    clearPendingChoiceConnect();

    const choiceId = choice.id;
    const startX = event.clientX;
    const startY = event.clientY;
    const mouseEventInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: startX,
      clientY: startY,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    };

    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      const pending = pendingConnectRef.current;
      if (!pending || pending.choiceId !== choiceId || pending.activated) {
        return;
      }

      if (Math.hypot(moveEvent.clientX - pending.startX, moveEvent.clientY - pending.startY) > CHOICE_CONNECT_MOVE_TOLERANCE) {
        clearPendingChoiceConnect();
      }
    };
    const handleWindowPointerEnd = () => {
      clearPendingChoiceConnect();
    };

    const removeListeners = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, true);
      window.removeEventListener('pointerup', handleWindowPointerEnd, true);
      window.removeEventListener('pointercancel', handleWindowPointerEnd, true);
    };

    const timerId = window.setTimeout(() => {
      const pending = pendingConnectRef.current;
      if (!pending || pending.choiceId !== choiceId) {
        return;
      }

      const handleElement = connectHandleRefs.current[choiceId];
      if (!handleElement || pending.pointerType === 'touch') {
        clearPendingChoiceConnect();
        return;
      }

      pending.activated = true;
      suppressChoiceClickRef.current = choiceId;
      handleElement.dispatchEvent(new MouseEvent('mousedown', pending.mouseEventInit));
    }, CHOICE_CONNECT_LONG_PRESS_MS);

    pendingConnectRef.current = {
      choiceId,
      startX,
      startY,
      pointerType: event.pointerType,
      mouseEventInit,
      timerId,
      activated: false,
      removeListeners
    };

    window.addEventListener('pointermove', handleWindowPointerMove, true);
    window.addEventListener('pointerup', handleWindowPointerEnd, true);
    window.addEventListener('pointercancel', handleWindowPointerEnd, true);
  }

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

  function handleDelete() {
    if (!window.confirm(`Delete "${nodeData.node.id}"?`)) {
      return;
    }

    const hasDescendants = nodeData.node.choices.some((choice) => choice.nextNodeId || choice.resolutionCheck?.failureNodeId || choice.resolutionCheck?.successNodeId || choice.resolutionCheck?.criticalSuccessNodeId);
    const cascade = hasDescendants ? window.confirm('Also delete descendant cards that are only connected through this card?') : false;

    deleteNode(nodeData.node.id, cascade);
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
        <button
          className="link-button nodrag nopan"
          onClick={() => {
            setFocusChoice(undefined);
            setSelection({ kind: 'node', nodeId: nodeData.node.id });
          }}
          type="button"
        >
          {nodeData.node.id}
        </button>
        <div className="dialogue-node__actions">
          <button className="ghost-button nodrag nopan" onClick={() => setNodeHidden(nodeData.node.id, !nodeData.node.hidden)} type="button">
            {nodeData.node.hidden ? 'Focus' : 'Hide'}
          </button>
          <button className="ghost-button danger nodrag nopan" onClick={handleDelete} type="button">
            Delete
          </button>
        </div>
      </div>

      <div className="choice-preview-list">
        {nodeData.node.choices.map((choice) => (
          <div
            key={choice.id}
            className={`choice-preview nodrag nopan ${choice.eventName ? 'choice-preview--eventful' : ''}`}
            onPointerCancel={clearPendingChoiceConnect}
            onPointerDown={(event) => beginChoiceConnect(event, choice)}
            onPointerUp={clearPendingChoiceConnect}
            style={
              {
                '--choice-accent': choice.color ?? '#9b6bff'
              } as CSSProperties
            }
            title={!choice.resolutionCheck && !choice.close ? 'Click to focus. Press and hold to drag a connection to another card.' : undefined}
          >
            <button
              className="choice-preview__main nodrag nopan"
              onClick={(event) => {
                if (consumeSuppressedChoiceClick(choice.id)) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                focusChoice(event, choice.id);
              }}
              type="button"
            >
              <span>{choice.text || 'Untitled choice'}</span>
            </button>
            {!choice.resolutionCheck && !choice.close && (
              <Handle
                aria-label={`Connect ${choice.text || choice.id}`}
                className="choice-preview__handle"
                id={choiceHandleId(choice.id, 'next')}
                position={Position.Right}
                ref={(element) => {
                  connectHandleRefs.current[choice.id] = element;
                }}
                title={choice.nextNodeId ? `Reconnect from ${choice.nextNodeId}` : 'Drag to another card to connect'}
                type="source"
              />
            )}
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
              <button className="choice-preview__edit nodrag nopan" onClick={(event) => openChoice(event, choice.id)} type="button">
                Edit
              </button>
            </div>
          </div>
        ))}
        {nodeData.node.choices.length === 0 && <div className="muted-copy">No choices yet.</div>}
      </div>

      <div className="button-row">
        <button className="primary-button subtle nodrag nopan" onClick={() => addChoice(nodeData.node.id)} type="button">
          Add choice
        </button>
        <button className="ghost-button nodrag nopan" onClick={() => addLeaveChoice(nodeData.node.id)} type="button">
          Add leave
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
