import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Background, Controls, MarkerType, ReactFlow, ReactFlowProvider, useNodesState, type Connection, type Edge, type Node, useReactFlow, type OnConnectEnd, type XYPosition } from '@xyflow/react';
import { FiDownload, FiFolder, FiImage, FiLogOut, FiMaximize, FiPlay, FiPlus, FiRefreshCw, FiTrash2, FiUpload } from 'react-icons/fi';
import packageJson from '../package.json';
import { DialogueEdge } from './DialogueEdge';
import { GraphNode } from './GraphNode';
import { PreviewDialog } from './PreviewDialog';
import { SkillGroupNode } from './SkillGroupNode';
import { TerminalNode } from './TerminalNode';
import {
  createDefaultProject,
  deriveSkillGroupLayouts,
  deriveEdges,
  dialogueCanvasId,
  getCloseRouteSummary,
  getChoiceFocusScope,
  getChoiceSkillCheck,
  getChoiceRouteTarget,
  isDefaultLeaveChoice,
  getNodeAccentColor,
  resolveNodePortraits,
  getTerminalNodePosition,
  getRouteHandleDirections,
  NODE_HEIGHT,
  NODE_WIDTH,
  parseNodeHandle,
  parseSourceHandle,
  skillIds,
  slugify,
  terminalCanvasId,
  type SkillId,
  type SkillGroupLayout,
  type DialogueChoice,
  type DialogueNode,
  type DialogueProject,
  type RouteBranch
} from './dialogue';
import { buildRuntimeZip, downloadBlob } from './exporter';
import { AUTOSAVE_KEY, fileToAsset, loadProjectFromStorage, readProjectFile } from './projectFiles';
import {
  normalizeEventName,
  setChoiceClose,
  setChoiceColor,
  setChoiceConditionsField,
  setChoiceNextField,
  setChoiceResolutionEnabled,
  setChoiceResolutionField,
  setChoiceSetFlagsField,
  setChoiceText,
  setChoiceVisibilityEnabled,
  setChoiceVisibilityField,
  useProjectStore
} from './store';
import { validateProject } from './validation';

const nodeTypes = {
  dialogueNode: GraphNode,
  skillGroupNode: SkillGroupNode,
  terminalNode: TerminalNode
};

const edgeTypes = {
  dialogue: DialogueEdge
};

const defaultEdgeOptions = {
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 12,
    height: 12,
    color: '#d8cfee'
  }
} as const;

const appVersion = packageJson.version;

function getAbsoluteCanvasPosition(node: Node, nodeById: Map<string, Node>): XYPosition {
  if (!node.parentId) {
    return node.position;
  }

  const parentNode = nodeById.get(node.parentId);
  if (!parentNode) {
    return node.position;
  }

  const parentPosition = getAbsoluteCanvasPosition(parentNode, nodeById);
  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y
  };
}

function getSkillGroupNodeMembership(skillGroupLayouts: SkillGroupLayout[]) {
  const membership = new Map<string, SkillGroupLayout>();

  skillGroupLayouts.forEach((group) => {
    group.nodeIds.forEach((nodeId) => membership.set(nodeId, group));
  });

  return membership;
}

function getGroupedChoiceMembership(skillGroupLayouts: SkillGroupLayout[]) {
  const membership = new Map<string, Set<string>>();

  skillGroupLayouts.forEach((group) => {
    const groupedChoices = membership.get(group.sourceNodeId) ?? new Set<string>();
    groupedChoices.add(group.choiceId);
    membership.set(group.sourceNodeId, groupedChoices);
  });

  return membership;
}

type ConfirmationState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
};

type OutcomeDraft = {
  preferredId: string;
  text: string;
};

type SkillCheckMode = 'none' | 'passive' | 'active';

type PortraitDropFieldProps = {
  asset?: DialogueProject['assets'][string];
  label: string;
  nodeId: string;
  side: 'left' | 'right';
  value: string;
  onChange: (value: string | null) => void;
  onDropAsset: (side: 'left' | 'right', file: File | undefined, assetId?: string) => Promise<void>;
};

function ConfirmationDialog({
  confirmation,
  onCancel,
  onConfirm
}: {
  confirmation: ConfirmationState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="preview-overlay" role="dialog" aria-modal="true">
      <div className="choice-editor confirm-dialog">
        <div className="preview-toolbar">
          <strong>{confirmation.title}</strong>
        </div>
        <div className="choice-editor__grid">
          <p>{confirmation.message}</p>
          <div className="button-row button-row--end">
            <button className="ghost-button" onClick={onCancel} type="button">
              Cancel
            </button>
            <button className={confirmation.tone === 'danger' ? 'ghost-button danger' : 'primary-button'} onClick={onConfirm} type="button">
              {confirmation.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddChoiceTypeDialog({
  canAddExitPoint,
  onAddChoice,
  onAddExitPoint,
  onClose
}: {
  canAddExitPoint: boolean;
  onAddChoice: () => void;
  onAddExitPoint: () => void;
  onClose: () => void;
}) {
  return (
    <div className="preview-overlay preview-overlay--nested add-choice-overlay" role="dialog" aria-modal="true">
      <div className="choice-editor add-choice-dialog">
        <div className="preview-toolbar">
          <strong>Add Choice</strong>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="add-choice-dialog__options">
          <button className="add-choice-option" onClick={onAddChoice} type="button">
            <FiPlus aria-hidden="true" />
            <span>New Choice</span>
          </button>
          <button className="add-choice-option" disabled={!canAddExitPoint} onClick={onAddExitPoint} type="button">
            <FiLogOut aria-hidden="true" />
            <span>Exit point</span>
          </button>
        </div>
        {!canAddExitPoint ? <p className="muted-copy">This node already has the default Leave exit point.</p> : null}
      </div>
    </div>
  );
}

function PortraitDropField({ asset, label, nodeId, onChange, onDropAsset, side, value }: PortraitDropFieldProps) {
  const [dragActive, setDragActive] = useState(false);

  return (
    <label>
      {label}
      <div
        className={`portrait-drop-field${dragActive ? ' is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setDragActive(false);
          const droppedAssetId = event.dataTransfer.getData('text/plain') || undefined;
          const droppedFile = event.dataTransfer.files[0];
          await onDropAsset(side, droppedFile, droppedAssetId);
        }}
      >
        <div className="portrait-drop-field__preview">
          {asset ? <img alt={asset.id} src={asset.dataUrl} /> : <FiImage aria-hidden="true" />}
        </div>
        <div className="portrait-drop-field__body">
          <input
            aria-label={`${nodeId}-${side}-portrait`}
            list="asset-list"
            placeholder="Inherit previous"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <span className="muted-copy">{asset ? asset.fileName : 'Drop an image or asset here'}</span>
          <div className="button-row">
            <button className="ghost-button" onClick={() => onChange('')} type="button">
              Inherit
            </button>
            <button className="ghost-button" onClick={() => onChange(null)} type="button">
              Clear
            </button>
          </div>
        </div>
      </div>
    </label>
  );
}

function RouteTargetField({
  availableNodeIds,
  branch,
  choiceId,
  currentValue,
  label,
  nodeId,
  onCreate,
  onSelect
}: {
  availableNodeIds: string[];
  branch: RouteBranch;
  choiceId: string;
  currentValue?: string;
  label: string;
  nodeId: string;
  onCreate: (preferredId: string) => string;
  onSelect: (targetNodeId?: string) => void;
}) {
  const [draft, setDraft] = useState(currentValue ?? '');
  const normalizedDraft = draft.trim();
  const exactMatch = normalizedDraft ? availableNodeIds.find((candidate) => candidate === normalizedDraft) : undefined;
  const canCreate = Boolean(normalizedDraft) && !exactMatch;
  const datalistId = `route-node-options-${nodeId}-${choiceId}-${branch}`;

  useEffect(() => {
    setDraft(currentValue ?? '');
  }, [currentValue]);

  return (
    <label>
      {label}
      <div className="route-target-input">
        <input
          aria-label={label}
          list={datalistId}
          placeholder="Search or create a node"
          value={draft}
          onChange={(event) => {
            const nextDraft = event.target.value;
            const trimmed = nextDraft.trim();
            const matchedNodeId = trimmed ? availableNodeIds.find((candidate) => candidate === trimmed) : undefined;
            setDraft(nextDraft);
            onSelect(matchedNodeId);
          }}
        />
        {canCreate ? (
          <button
            aria-label={`Create ${label.toLowerCase()} ${normalizedDraft}`}
            className="choice-action-button nodrag nopan"
            data-tooltip={`Create ${label.toLowerCase()}: add and link ${normalizedDraft}`}
            onClick={() => {
              const createdNodeId = onCreate(normalizedDraft);
              if (createdNodeId) {
                setDraft(createdNodeId);
              }
            }}
            title={`Create ${label.toLowerCase()}: add and link ${normalizedDraft}`}
            type="button"
          >
            <FiPlus aria-hidden="true" />
          </button>
        ) : null}
        <datalist id={datalistId}>
          {availableNodeIds.map((candidate) => (
            <option key={candidate} value={candidate} />
          ))}
        </datalist>
      </div>
    </label>
  );
}

function ChoiceEditorFields({
  choice,
  node,
  onClose,
  onRemove,
  project
}: {
  choice: DialogueChoice;
  node: DialogueNode;
  onClose: () => void;
  onRemove: () => void;
  project: DialogueProject;
}) {
  const updateChoice = useProjectStore((state) => state.updateChoice);
  const createConnectedNodeInline = useProjectStore((state) => state.createConnectedNodeInline);
  const availableNodeIds = Object.keys(project.nodes)
    .filter((nodeId) => nodeId !== node.id)
    .sort((left, right) => left.localeCompare(right));

  return (
    <div className="choice-editor__grid">
      <div className="choice-editor__header-row">
        <button aria-label={`Delete ${choice.text || choice.id}`} className="choice-preview__delete choice-editor__delete-corner" onClick={onRemove} type="button">
          X
        </button>
      </div>
      <label>
        Choice text
        <textarea rows={4} value={choice.text} onChange={(event) => updateChoice(node.id, choice.id, setChoiceText(event.target.value))} />
      </label>

      <label>
        Accent color
        <div className="color-field">
          <input aria-label="Choice color picker" className="color-picker" type="color" value={choice.color ?? '#9b6bff'} onChange={(event) => updateChoice(node.id, choice.id, setChoiceColor(event.target.value))} />
          <div aria-label="Choice color" className="color-value">
            {choice.color ?? '#9b6bff'}
          </div>
        </div>
      </label>

      <label>
        Event name
        <input value={choice.eventName ?? ''} onChange={(event) => updateChoice(node.id, choice.id, setChoiceNextField('eventName', event.target.value))} />
      </label>

      {!choice.resolutionCheck ? (
        <RouteTargetField
          availableNodeIds={availableNodeIds}
          branch="next"
          choiceId={choice.id}
          currentValue={choice.nextNodeId}
          label="Next node"
          nodeId={node.id}
          onCreate={(preferredId) => createConnectedNodeInline(node.id, choice.id, 'next', preferredId)}
          onSelect={(targetNodeId) => updateChoice(node.id, choice.id, setChoiceNextField('nextNodeId', targetNodeId ?? ''))}
        />
      ) : null}

      <div className="choice-editor__toggles">
        <label className="choice-toggle">
          <input checked={Boolean(choice.close)} onChange={(event) => updateChoice(node.id, choice.id, setChoiceClose(event.target.checked))} type="checkbox" />
          Close after choice
        </label>
        <label className="choice-toggle">
          <input checked={Boolean(choice.visibilityCheck)} onChange={(event) => updateChoice(node.id, choice.id, setChoiceVisibilityEnabled(event.target.checked))} type="checkbox" />
          Passive check
        </label>
        <label className="choice-toggle">
          <input checked={Boolean(choice.resolutionCheck)} onChange={(event) => updateChoice(node.id, choice.id, setChoiceResolutionEnabled(event.target.checked))} type="checkbox" />
          Active check
        </label>
      </div>

      {choice.visibilityCheck && (
        <>
          <div className="inline-grid">
            <label>
              Passive skill
              <select value={choice.visibilityCheck.skill} onChange={(event) => updateChoice(node.id, choice.id, setChoiceVisibilityField('skill', event.target.value))}>
                {skillIds.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <input
                min={1}
                type="number"
                value={choice.visibilityCheck.difficulty}
                onChange={(event) => updateChoice(node.id, choice.id, setChoiceVisibilityField('difficulty', Number(event.target.value)))}
                />
              </label>
            </div>
          <p className="muted-copy">Passive checks only control whether this choice is visible.</p>
        </>
      )}

      {choice.resolutionCheck && (
        <>
          <div className="inline-grid">
            <label>
              Active skill
              <select value={choice.resolutionCheck.skill} onChange={(event) => updateChoice(node.id, choice.id, setChoiceResolutionField('skill', event.target.value))}>
                {skillIds.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <input
                min={1}
                type="number"
                value={choice.resolutionCheck.difficulty}
                onChange={(event) => updateChoice(node.id, choice.id, setChoiceResolutionField('difficulty', Number(event.target.value)))}
              />
            </label>
          </div>

          <RouteTargetField
            availableNodeIds={availableNodeIds}
            branch="failure"
            choiceId={choice.id}
            currentValue={choice.resolutionCheck.failureNodeId}
            label="Failure node"
            nodeId={node.id}
            onCreate={(preferredId) => createConnectedNodeInline(node.id, choice.id, 'failure', preferredId)}
            onSelect={(targetNodeId) => updateChoice(node.id, choice.id, setChoiceResolutionField('failureNodeId', targetNodeId ?? ''))}
          />
          <RouteTargetField
            availableNodeIds={availableNodeIds}
            branch="success"
            choiceId={choice.id}
            currentValue={choice.resolutionCheck.successNodeId}
            label="Success node"
            nodeId={node.id}
            onCreate={(preferredId) => createConnectedNodeInline(node.id, choice.id, 'success', preferredId)}
            onSelect={(targetNodeId) => updateChoice(node.id, choice.id, setChoiceResolutionField('successNodeId', targetNodeId ?? ''))}
          />
          <RouteTargetField
            availableNodeIds={availableNodeIds}
            branch="critical"
            choiceId={choice.id}
            currentValue={choice.resolutionCheck.criticalSuccessNodeId}
            label="Critical node"
            nodeId={node.id}
            onCreate={(preferredId) => createConnectedNodeInline(node.id, choice.id, 'critical', preferredId)}
            onSelect={(targetNodeId) => updateChoice(node.id, choice.id, setChoiceResolutionField('criticalSuccessNodeId', targetNodeId ?? ''))}
          />
        </>
      )}

      <div className="flag-grid">
        <label>
          Required flags
          <input
            placeholder="panel_open, power_on"
            value={choice.conditions?.flagsAll?.join(', ') ?? ''}
            onChange={(event) => updateChoice(node.id, choice.id, setChoiceConditionsField('flagsAll', event.target.value))}
          />
        </label>
        <label>
          Blocked flags
          <input
            placeholder="alarm_triggered"
            value={choice.conditions?.flagsNot?.join(', ') ?? ''}
            onChange={(event) => updateChoice(node.id, choice.id, setChoiceConditionsField('flagsNot', event.target.value))}
          />
        </label>
        <label>
          Set flag
          <input
            placeholder="panel_open"
            value={choice.setFlags?.join(', ') ?? ''}
            onChange={(event) => updateChoice(node.id, choice.id, setChoiceSetFlagsField(event.target.value))}
          />
        </label>
      </div>
      <p className="muted-copy">Flags export as `flags_all`, `flags_not`, and `set_flags`.</p>

      <div className="button-row">
        <button className="ghost-button" onClick={onClose} type="button">
          Dialogue panel
        </button>
      </div>
    </div>
  );
}

function CardEditorModal({
  node,
  project,
  selectedChoice,
  selectedLeftPortrait,
  selectedRightPortrait,
  onClose,
  onDropPortrait,
  onOpenAddChoice,
  onOpenChoice,
  onCloseChoice,
  onRemoveChoice,
  onHoverChoice
}: {
  node: DialogueNode;
  project: DialogueProject;
  selectedChoice?: DialogueChoice;
  selectedLeftPortrait?: DialogueProject['assets'][string];
  selectedRightPortrait?: DialogueProject['assets'][string];
  onClose: () => void;
  onDropPortrait: (side: 'left' | 'right', file: File | undefined, assetId?: string) => Promise<void>;
  onOpenAddChoice: () => void;
  onOpenChoice: (choiceId: string) => void;
  onCloseChoice: () => void;
  onRemoveChoice: (choiceId: string) => void;
  onHoverChoice: (choiceId?: string) => void;
}) {
  const updateNodeId = useProjectStore((state) => state.updateNodeId);
  const updateNodeText = useProjectStore((state) => state.updateNodeText);
  const updateNodePortrait = useProjectStore((state) => state.updateNodePortrait);
  const reorderChoice = useProjectStore((state) => state.reorderChoice);
  const renameAsset = useProjectStore((state) => state.renameAsset);
  const effectivePortraits = resolveNodePortraits(project, node.id);
  const effectiveLeftPortrait = effectivePortraits.left ? project.assets[effectivePortraits.left] : undefined;
  const effectiveRightPortrait = effectivePortraits.right ? project.assets[effectivePortraits.right] : undefined;
  const flipped = Boolean(selectedChoice);
  const [draggedChoiceId, setDraggedChoiceId] = useState<string | undefined>(undefined);
  const [dropChoiceId, setDropChoiceId] = useState<string | undefined>(undefined);

  function handlePortraitFieldChange(side: 'left' | 'right', value: string | null) {
    if (value === null) {
      updateNodePortrait(node.id, side, null);
      return;
    }

    const currentPortraitId = node.portraits[side];
    if (value && typeof currentPortraitId === 'string' && project.assets[currentPortraitId]) {
      renameAsset(currentPortraitId, value);
      return;
    }

    updateNodePortrait(node.id, side, value);
  }

  return (
    <div className="preview-overlay card-editor-overlay" role="dialog" aria-modal="true">
      <div className="card-editor-modal">
        <div className="preview-toolbar">
          <div className="card-editor-toolbar">
            <strong>{flipped ? `Edit Choice: ${selectedChoice?.text || selectedChoice?.id}` : `Edit Node: ${node.id}`}</strong>
            <label className="card-editor-id-field">
              Node id
              <input value={node.id} onChange={(event) => updateNodeId(node.id, event.target.value)} />
            </label>
          </div>
          <div className="toolbar-actions">
            <button className="ghost-button" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        <div className={`card-editor-flipbook${flipped ? ' is-flipped' : ''}`}>
          <div className="card-editor-face card-editor-face--front">
            <div className="card-editor-layout">
              <div className="card-editor-portrait-column">
                <PortraitDropField
                  asset={effectiveLeftPortrait ?? selectedLeftPortrait}
                  label="Left portrait"
                  nodeId={node.id}
                  onChange={(value) => handlePortraitFieldChange('left', value)}
                  onDropAsset={async (side, file, assetId) => onDropPortrait(side, file, assetId)}
                  side="left"
                  value={node.portraits.left ?? ''}
                />
              </div>

              <div className="card-editor-scene">
                <label>
                  Dialogue text
                  <textarea className="card-editor-textarea" rows={12} value={node.text} onChange={(event) => updateNodeText(node.id, event.target.value)} />
                </label>

                <div className="card-editor-choice-list">
                  {node.choices.map((choice) => (
                    <div
                      className={`card-editor-choice-row${draggedChoiceId === choice.id ? ' is-dragging' : ''}${dropChoiceId === choice.id ? ' is-drop-target' : ''}`}
                      data-testid={`card-choice-${choice.id}`}
                      draggable
                      key={choice.id}
                      onDragEnd={() => {
                        setDraggedChoiceId(undefined);
                        setDropChoiceId(undefined);
                      }}
                      onDragOver={(event: DragEvent<HTMLDivElement>) => {
                        const sourceChoiceId = draggedChoiceId || event.dataTransfer.getData('text/plain');
                        if (!sourceChoiceId || sourceChoiceId === choice.id) {
                          return;
                        }
                        event.preventDefault();
                        setDropChoiceId(choice.id);
                      }}
                      onDragStart={(event: DragEvent<HTMLDivElement>) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', choice.id);
                        setDraggedChoiceId(choice.id);
                        setDropChoiceId(undefined);
                      }}
                      onDrop={(event: DragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        const sourceChoiceId = draggedChoiceId || event.dataTransfer.getData('text/plain');
                        if (!sourceChoiceId || sourceChoiceId === choice.id) {
                          setDropChoiceId(undefined);
                          return;
                        }
                        reorderChoice(node.id, sourceChoiceId, choice.id);
                        setDraggedChoiceId(undefined);
                        setDropChoiceId(undefined);
                      }}
                    >
                      <button
                        className={`preview-choice ${choice.eventName ? 'preview-choice--eventful' : ''}`}
                        onBlur={() => onHoverChoice(undefined)}
                        onFocus={() => onHoverChoice(choice.id)}
                        onMouseEnter={() => onHoverChoice(choice.id)}
                        onMouseLeave={() => onHoverChoice(undefined)}
                        style={{ borderColor: choice.color, boxShadow: `inset 3px 0 0 ${choice.color}` }}
                        type="button"
                      >
                        <span>{choice.text}</span>
                        {choice.eventName ? <span className="preview-choice__event">Event: {choice.eventName}</span> : null}
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => onOpenChoice(choice.id)}
                        onFocus={() => onHoverChoice(choice.id)}
                        onMouseEnter={() => onHoverChoice(choice.id)}
                        onMouseLeave={() => onHoverChoice(undefined)}
                        type="button"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                  {node.choices.length === 0 ? <div className="muted-copy">This node has no choices yet.</div> : null}
                </div>

                <div className="choice-create-row">
                  <button className="choice-create-button choice-create-button--wide" onClick={onOpenAddChoice} type="button">
                    <FiPlus aria-hidden="true" />
                    <span>New Choice</span>
                  </button>
                </div>
              </div>

              <div className="card-editor-portrait-column">
                <PortraitDropField
                  asset={effectiveRightPortrait ?? selectedRightPortrait}
                  label="Right portrait"
                  nodeId={node.id}
                  onChange={(value) => handlePortraitFieldChange('right', value)}
                  onDropAsset={async (side, file, assetId) => onDropPortrait(side, file, assetId)}
                  side="right"
                  value={node.portraits.right ?? ''}
                />
              </div>
            </div>
          </div>

          <div className="card-editor-face card-editor-face--back">
            {selectedChoice ? <ChoiceEditorFields choice={selectedChoice} node={node} onClose={onCloseChoice} onRemove={() => onRemoveChoice(selectedChoice.id)} project={project} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function NodeConnectionsPanel({
  node,
  project,
  selectedChoiceId,
  highlightedChoiceId,
  onSelectNode
}: {
  node: DialogueNode;
  project: DialogueProject;
  selectedChoiceId?: string;
  highlightedChoiceId?: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const connectionGroups = node.choices.map((choice) => {
    const skillCheck = getChoiceSkillCheck(choice);
    type ChoiceRoute = { id: string; label: string; targetNodeId: string } | { id: string; label: string; terminal: true };
    const routes = [
      choice.nextNodeId
        ? {
            id: `${choice.id}:next`,
            label: 'Next',
            targetNodeId: choice.nextNodeId
          }
        : undefined,
      choice.close
        ? {
            id: `${choice.id}:close`,
            label: 'Exit',
            terminal: true
          }
        : undefined,
      skillCheck?.failureNodeId
        ? {
            id: `${choice.id}:failure`,
            label: 'Failure',
            targetNodeId: skillCheck.failureNodeId
          }
        : undefined,
      skillCheck?.successNodeId
        ? {
            id: `${choice.id}:success`,
            label: 'Success',
            targetNodeId: skillCheck.successNodeId
          }
        : undefined,
      skillCheck?.criticalSuccessNodeId
        ? {
            id: `${choice.id}:critical`,
            label: 'Critical',
            targetNodeId: skillCheck.criticalSuccessNodeId
          }
        : undefined
    ].filter((route): route is ChoiceRoute => Boolean(route));

    return {
      choice,
      routes
    };
  });

  return (
    <div className="inspector-section">
      <div className="panel-header">
        <strong>Connections</strong>
        <span>{connectionGroups.reduce((count, group) => count + group.routes.length, 0)}</span>
      </div>
      <div className="connection-groups">
        {connectionGroups.map(({ choice, routes }) => (
          <div
            className={`connection-group${selectedChoiceId === choice.id ? ' is-active' : ''}${highlightedChoiceId === choice.id ? ' is-hovered' : ''}`}
            key={choice.id}
          >
            <strong>{choice.text || choice.id}</strong>
            <div className="preview-card-rail__list">
              {routes.length > 0 ? (
                routes.map((route) =>
                  'terminal' in route ? (
                    <div className={`preview-card-chip preview-card-chip--terminal${highlightedChoiceId === choice.id ? ' is-hovered' : ''}`} key={route.id}>
                      <strong>{route.label}</strong>
                      <span>End dialogue</span>
                    </div>
                  ) : (
                    <button className={`preview-card-chip${highlightedChoiceId === choice.id ? ' is-hovered' : ''}`} key={route.id} onClick={() => onSelectNode(route.targetNodeId)} type="button">
                      <strong>{route.label}</strong>
                      <span>{project.nodes[route.targetNodeId]?.text || 'Missing target'}</span>
                      <small>{route.targetNodeId}</small>
                    </button>
                  )
                )
              ) : (
                <div className="muted-copy">No linked nodes yet.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorCanvas() {
  const reactFlow = useReactFlow();
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importProjectRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string>('Autosave active');
  const [pendingNodeLink, setPendingNodeLink] = useState<
    | {
        parentNodeId: string;
        targetNodeId?: string;
        flowPosition?: XYPosition;
      }
    | undefined
  >(undefined);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationState | undefined>(undefined);
  const [pendingAddChoiceNodeId, setPendingAddChoiceNodeId] = useState<string | undefined>(undefined);
  const [hoveredConnectionChoiceId, setHoveredConnectionChoiceId] = useState<string | undefined>(undefined);
  const confirmationResolverRef = useRef<((answer: boolean) => void) | null>(null);

  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const focusChoice = useProjectStore((state) => state.focusChoice);
  const previewOpen = useProjectStore((state) => state.previewOpen);
  const replaceProject = useProjectStore((state) => state.replaceProject);
  const setSelection = useProjectStore((state) => state.setSelection);
  const setFocusChoice = useProjectStore((state) => state.setFocusChoice);
  const setPreviewOpen = useProjectStore((state) => state.setPreviewOpen);
  const resetProject = useProjectStore((state) => state.resetProject);
  const clearScene = useProjectStore((state) => state.clearScene);
  const setSceneField = useProjectStore((state) => state.setSceneField);
  const addNode = useProjectStore((state) => state.addNode);
  const updateNodeText = useProjectStore((state) => state.updateNodeText);
  const updateNodePortrait = useProjectStore((state) => state.updateNodePortrait);
  const updateNodeId = useProjectStore((state) => state.updateNodeId);
  const setNodeHidden = useProjectStore((state) => state.setNodeHidden);
  const setNodePosition = useProjectStore((state) => state.setNodePosition);
  const moveNodes = useProjectStore((state) => state.moveNodes);
  const setTerminalPosition = useProjectStore((state) => state.setTerminalPosition);
  const addChoice = useProjectStore((state) => state.addChoice);
  const addLeaveChoice = useProjectStore((state) => state.addLeaveChoice);
  const removeChoice = useProjectStore((state) => state.removeChoice);
  const updateChoice = useProjectStore((state) => state.updateChoice);
  const connectRoute = useProjectStore((state) => state.connectRoute);
  const clearEdge = useProjectStore((state) => state.clearEdge);
  const deleteNode = useProjectStore((state) => state.deleteNode);
  const addAsset = useProjectStore((state) => state.addAsset);
  const renameAsset = useProjectStore((state) => state.renameAsset);
  const removeAsset = useProjectStore((state) => state.removeAsset);

  const fitCanvasToViewport = useCallback(
    (duration?: number) => {
      const compactViewport = window.innerWidth <= 860;
      reactFlow.fitView({
        duration,
        padding: compactViewport ? 0.08 : 0.16
      });
    },
    [reactFlow]
  );

  useEffect(() => {
    try {
      const stored = loadProjectFromStorage();
      if (stored) {
        replaceProject(stored);
      }
    } catch {
      localStorage.removeItem(AUTOSAVE_KEY);
      replaceProject(createDefaultProject());
    }
  }, [replaceProject]);

  useEffect(() => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
  }, [project]);

  const requestConfirmation = useCallback((confirmation: ConfirmationState) => {
    return new Promise<boolean>((resolve) => {
      confirmationResolverRef.current = resolve;
      setPendingConfirmation(confirmation);
    });
  }, []);

  const resolveConfirmation = useCallback((answer: boolean) => {
    confirmationResolverRef.current?.(answer);
    confirmationResolverRef.current = null;
    setPendingConfirmation(undefined);
  }, []);

  const issues = useMemo(() => validateProject(project), [project]);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const terminalPosition = useMemo(() => getTerminalNodePosition(project), [project]);
  const closeRouteSummary = useMemo(() => getCloseRouteSummary(project), [project]);
  const routeHandleDirections = useMemo(() => getRouteHandleDirections(project, terminalPosition), [project, terminalPosition]);
  const skillGroupLayouts = useMemo(() => deriveSkillGroupLayouts(project), [project]);
  const skillGroupById = useMemo(() => new Map(skillGroupLayouts.map((group) => [group.id, group])), [skillGroupLayouts]);
  const skillGroupByNodeId = useMemo(() => getSkillGroupNodeMembership(skillGroupLayouts), [skillGroupLayouts]);
  const groupedChoicesByNodeId = useMemo(() => getGroupedChoiceMembership(skillGroupLayouts), [skillGroupLayouts]);
  const focusScope = useMemo(() => {
    if (!focusChoice) {
      return undefined;
    }
    return getChoiceFocusScope(project, focusChoice.nodeId, focusChoice.choiceId);
  }, [focusChoice, project]);

  const handlePortraitDrop = useCallback(async (side: 'left' | 'right', file: File | undefined, assetId: string | undefined, nodeId: string) => {
    if (file && file.type.startsWith('image/')) {
      const nextAssetId = addAsset(await fileToAsset(file));
      updateNodePortrait(nodeId, side, nextAssetId);
      return;
    }

    if (assetId && project.assets[assetId]) {
      updateNodePortrait(nodeId, side, assetId);
    }
  }, [addAsset, project.assets, updateNodePortrait]);

  const requestDeleteChoice = useCallback(async (nodeId: string, choiceId: string) => {
    const choice = project.nodes[nodeId]?.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) {
      return;
    }

    const confirmed = await requestConfirmation({
      title: 'Remove choice',
      message: `Remove "${choice.text.trim() || choice.id}" from "${nodeId}"?`,
      confirmLabel: 'Remove',
      tone: 'danger'
    });

    if (!confirmed) {
      return;
    }

    removeChoice(nodeId, choiceId);
  }, [project.nodes, removeChoice, requestConfirmation]);

  const requestDeleteNode = useCallback(async (node: DialogueNode) => {
    const confirmed = await requestConfirmation({
      title: 'Delete node',
      message: `Delete "${node.id}"?`,
      confirmLabel: 'Delete',
      tone: 'danger'
    });

    if (!confirmed) {
      return;
    }

    const hasDescendants = node.choices.some((choice) => choice.nextNodeId || getChoiceSkillCheck(choice)?.failureNodeId || getChoiceSkillCheck(choice)?.successNodeId || getChoiceSkillCheck(choice)?.criticalSuccessNodeId);
    const cascade =
      hasDescendants &&
      (await requestConfirmation({
        title: 'Cascade delete',
        message: 'Also delete descendant nodes that are only connected through this node?',
        confirmLabel: 'Delete descendants',
        tone: 'danger'
      }));

    deleteNode(node.id, cascade);
  }, [deleteNode, requestConfirmation]);

  const connectChoiceRoute = useCallback(async (sourceNodeId: string, choiceId: string, branch: RouteBranch, targetNodeId: string) => {
    const sourceChoice = project.nodes[sourceNodeId]?.choices.find((choice) => choice.id === choiceId);
    if (!sourceChoice) {
      return;
    }

    const existingTargetNodeId = getChoiceRouteTarget(sourceChoice, branch);
    if (existingTargetNodeId === targetNodeId) {
      setSelection({ kind: 'edge', nodeId: sourceNodeId, choiceId, branch });
      return;
    }

    if (existingTargetNodeId) {
      const choiceLabel = sourceChoice.text.trim() || sourceChoice.id;
      const branchLabel = branch === 'next' ? 'next connection' : `${branch} connection`;
      const confirmed = await requestConfirmation({
        title: 'Replace route',
        message: `"${choiceLabel}" already has a ${branchLabel} to "${existingTargetNodeId}". Replace it with "${targetNodeId}"?`,
        confirmLabel: 'Replace'
      });

      if (!confirmed) {
        return;
      }
    }

    connectRoute(sourceNodeId, choiceId, branch, targetNodeId);
  }, [connectRoute, project.nodes, requestConfirmation, setSelection]);

  const canvasNodes = useMemo<Node[]>(
    () => {
      const skillGroupNodes: Node[] = skillGroupLayouts.map((group) => ({
        id: group.id,
        type: 'skillGroupNode',
        position: group.position,
        draggable: true,
        selectable: false,
        data: {
          label: group.label,
          subtitle: group.subtitle,
          count: group.nodeIds.length,
          accentColor: group.accentColor,
          dimmed: Boolean(focusScope) && !group.nodeIds.some((nodeId) => focusScope?.nodeIds.has(nodeId))
        },
        style: {
          width: group.width,
          height: group.height
        }
      }));

      const dialogueNodes: Node[] = Object.values(project.nodes).map((node) => {
        const group = skillGroupByNodeId.get(node.id);

        return {
          id: dialogueCanvasId(node.id),
          type: 'dialogueNode',
          position: group
            ? {
                x: node.canvas.x - group.position.x,
                y: node.canvas.y - group.position.y
              }
            : node.canvas,
          parentId: group?.id,
          data: {
            node,
            accentColor: getNodeAccentColor(project, node.id),
            routeHandleDirections: routeHandleDirections[node.id] ?? {},
            groupedChoiceIds: groupedChoicesByNodeId.get(node.id),
            dimmed: Boolean(focusScope) && !focusScope?.nodeIds.has(node.id),
            onRequestAddChoice: (nodeId: string) => setPendingAddChoiceNodeId(nodeId),
            onRequestDeleteNode: requestDeleteNode,
            onRequestDeleteChoice: requestDeleteChoice
          },
          selected: selection.kind !== 'scene' && selection.nodeId === node.id
        };
      });

      const terminalNodes: Node[] =
        terminalPosition && closeRouteSummary.count > 0
          ? [
              {
                id: terminalCanvasId(),
                type: 'terminalNode',
                position: terminalPosition,
                draggable: true,
                selectable: true,
                data: {
                  label: 'End Dialogue',
                  dimmed: Boolean(focusScope) && !focusScope?.includeTerminal,
                  subtitle:
                    closeRouteSummary.eventNames.length === 1
                      ? `Event: ${closeRouteSummary.eventNames[0]}`
                      : closeRouteSummary.eventNames.length > 1
                        ? `${closeRouteSummary.eventNames.length} event variants`
                        : 'Conversation closes here'
                }
              }
            ]
          : [];

      return [...skillGroupNodes, ...dialogueNodes, ...terminalNodes];
    },
    [closeRouteSummary, focusScope, groupedChoicesByNodeId, project, requestDeleteChoice, requestDeleteNode, routeHandleDirections, selection, skillGroupByNodeId, skillGroupLayouts, terminalPosition]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(canvasNodes);
  const nodesRef = useRef<Node[]>(canvasNodes);

  useEffect(() => {
    setNodes(canvasNodes);
  }, [canvasNodes, setNodes]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    const frame = canvasFrameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') {
      return;
    }

    let animationFrame = 0;
    const scheduleFit = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => fitCanvasToViewport());
    };

    scheduleFit();
    const observer = new ResizeObserver(() => {
      scheduleFit();
    });
    observer.observe(frame);

    return () => {
      observer.disconnect();
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [fitCanvasToViewport, selection.kind]);

  const edges = useMemo<Edge[]>(
    () =>
      deriveEdges(project).map((edge) => {
        const sourceNodeId = edge.source.replace(/^dialogue:/, '');
        const targetIsTerminal = edge.target === terminalCanvasId();
        const targetGroup = skillGroupById.get(edge.target);
        const inFocus =
          !focusScope ||
          (focusScope.nodeIds.has(sourceNodeId) &&
            (targetIsTerminal
              ? focusScope.includeTerminal
              : targetGroup
                ? targetGroup.nodeIds.some((nodeId) => focusScope.nodeIds.has(nodeId))
                : focusScope.nodeIds.has(edge.target.replace(/^dialogue:/, ''))));

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: inFocus ? edge.style?.opacity ?? 1 : 0.14
          }
        };
      }),
    [focusScope, project, skillGroupById]
  );

  async function handleExport() {
    if (errors.length > 0) {
      setStatus('Export blocked by validation errors');
      return;
    }

    const blob = await buildRuntimeZip(project);
    downloadBlob(`${project.sceneId}.zip`, blob);
    setStatus('Runtime package exported');
  }

  async function handleAssetUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    for (const file of files) {
      const asset = await fileToAsset(file);
      addAsset(asset);
    }
    event.target.value = '';
  }

  async function handleProjectImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const nextProject = await readProjectFile(file);
    replaceProject(nextProject);
    event.target.value = '';
    setStatus('Project loaded');
  }

  function handleConnect(connection: Connection) {
    setPendingNodeLink(undefined);
    const nodeHandle = parseNodeHandle(connection.sourceHandle);
    if (nodeHandle && connection.source?.startsWith('dialogue:')) {
      if (!connection.target?.startsWith('dialogue:')) {
        return;
      }

      setPendingNodeLink({
        parentNodeId: connection.source.replace(/^dialogue:/, ''),
        targetNodeId: connection.target.replace(/^dialogue:/, '')
      });
      return;
    }

    const parsed = parseSourceHandle(connection.sourceHandle);
    if (!connection.source || !connection.target || !parsed || !connection.target.startsWith('dialogue:')) {
      return;
    }
    const sourceNodeId = connection.source.replace(/^dialogue:/, '');
    void connectChoiceRoute(sourceNodeId, parsed.choiceId, parsed.branch, connection.target.replace(/^dialogue:/, ''));
  }

  const handleConnectEnd: OnConnectEnd = (event, connectionState) => {
    if (!connectionState.fromHandle || connectionState.toNode || connectionState.toHandle || !connectionState.fromNode) {
      return;
    }

    const nodeHandle = parseNodeHandle(connectionState.fromHandle.id);
    if (!nodeHandle || !connectionState.fromNode.id.startsWith('dialogue:')) {
      return;
    }

    const clientX = 'changedTouches' in event ? event.changedTouches[0]?.clientX ?? 0 : event.clientX;
    const clientY = 'changedTouches' in event ? event.changedTouches[0]?.clientY ?? 0 : event.clientY;
    const flowPosition =
      connectionState.pointer ??
      reactFlow.screenToFlowPosition({
        x: clientX,
        y: clientY
      });
    const fromNodeId = connectionState.fromNode.id.replace(/^dialogue:/, '');

    window.setTimeout(() => {
      setPendingNodeLink({
        parentNodeId: fromNodeId,
        flowPosition
      });
    }, 0);
  };

  const selectedNode = selection.kind === 'node' || selection.kind === 'choice' || selection.kind === 'edge' ? project.nodes[selection.nodeId] : undefined;
  const selectedChoice =
    selection.kind === 'choice' || selection.kind === 'edge'
      ? selectedNode?.choices.find((choice) => choice.id === selection.choiceId)
      : undefined;
  const inspectorExpanded = Boolean(selectedNode);
  const selectedLeftPortrait = selectedNode?.portraits.left ? project.assets[selectedNode.portraits.left] : undefined;
  const selectedRightPortrait = selectedNode?.portraits.right ? project.assets[selectedNode.portraits.right] : undefined;
  const addChoiceTargetNode = pendingAddChoiceNodeId ? project.nodes[pendingAddChoiceNodeId] : undefined;
  const displaySceneId = project.sceneId || slugify(project.title?.trim() || 'dialogue') || 'dialogue';

  return (
    <div className={`app-shell ${inspectorExpanded ? 'app-shell--inspector-open' : 'app-shell--inspector-closed'}`}>
      <aside className="left-rail">
        <div className="panel left-rail-panel">
          <div className="left-rail-header">
            <label className="left-rail-title-field">
              Title
              <input value={project.title ?? ''} onChange={(event) => setSceneField('title', event.target.value)} />
            </label>
            <div aria-label="Scene id" className="scene-id-display">
              {displaySceneId}
            </div>
          </div>
          <div className="left-rail-action-strip left-rail-action-strip--features">
              <button
                aria-label="Preview"
                className="icon-button"
                data-tooltip="Preview"
                onClick={() => setPreviewOpen(true)}
                title="Preview"
                type="button"
              >
                <FiPlay aria-hidden="true" />
              </button>
              <button
                aria-label="Load project"
                className="icon-button"
                data-tooltip="Load project"
                onClick={() => importProjectRef.current?.click()}
                title="Load project"
                type="button"
              >
                <FiFolder aria-hidden="true" />
              </button>
              <button
                aria-label="Export project"
                className="icon-button icon-button--primary"
                data-tooltip="Export project"
                disabled={errors.length > 0}
                onClick={handleExport}
                title="Export project"
                type="button"
              >
                <FiDownload aria-hidden="true" />
              </button>
            <button aria-label="Add node" className="icon-button" data-tooltip="Add node" onClick={() => addNode()} title="Add node" type="button">
              <FiPlus aria-hidden="true" />
            </button>
            <button aria-label="Fit view" className="icon-button" data-tooltip="Fit view" onClick={() => fitCanvasToViewport(180)} title="Fit view" type="button">
              <FiMaximize aria-hidden="true" />
            </button>
            <button
              aria-label="Upload portraits"
              className="icon-button"
              data-tooltip="Upload portraits"
              onClick={() => fileInputRef.current?.click()}
              title="Upload portraits"
              type="button"
            >
              <FiUpload aria-hidden="true" />
            </button>
          </div>
          <input accept=".json" hidden onChange={handleProjectImport} ref={importProjectRef} type="file" />
          <div className="left-rail-section">
            <input accept="image/*" hidden multiple onChange={handleAssetUpload} ref={fileInputRef} type="file" />
            <div className="asset-list">
              {Object.values(project.assets).map((asset) => (
                <div
                  className="asset-item"
                  draggable
                  key={asset.id}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', asset.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <input aria-label={`asset-${asset.id}`} value={asset.id} onChange={(event) => renameAsset(asset.id, event.target.value)} />
                  <span>{asset.fileName}</span>
                  <button className="ghost-button danger" onClick={() => removeAsset(asset.id)} type="button">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="button-row left-rail-footer">
            <button
              aria-label="Clear scene"
              className="icon-button danger"
              data-tooltip="Clear scene"
              onClick={async () => {
                const confirmed = await requestConfirmation({
                  title: 'Clear scene',
                  message: 'Clear the current scene and keep only a fresh start node?',
                  confirmLabel: 'Clear scene',
                  tone: 'danger'
                });

                if (confirmed) {
                  clearScene();
                }
              }}
              title="Clear scene"
              type="button"
            >
              <FiTrash2 aria-hidden="true" />
            </button>
            <button
              aria-label="Reload sample scene"
              className="icon-button danger"
              data-tooltip="Reload sample"
              onClick={() => {
                resetProject();
                setStatus('Bundled sample scene reloaded');
              }}
              title="Reload sample scene"
              type="button"
            >
              <FiRefreshCw aria-hidden="true" />
            </button>
          </div>
          <div className="left-rail-errors">
            {errors.length > 0 ? (
              <div className="left-rail-section left-rail-errors-panel">
                <div className="left-rail-errors-meta">{Object.keys(project.nodes).length} nodes</div>
                <div className="left-rail-section-header">
                  <strong>Validation errors</strong>
                  <span>{errors.length}</span>
                </div>
                <div className="issue-list left-rail-errors-list">
                  {errors.map((issue) => (
                    <button
                      className={`issue issue--${issue.severity}`}
                      key={`${issue.code}-${issue.message}`}
                      onClick={() => {
                        setFocusChoice(undefined);
                        if (issue.nodeId && issue.choiceId) {
                          setSelection({ kind: 'choice', nodeId: issue.nodeId, choiceId: issue.choiceId });
                          return;
                        }
                        if (issue.nodeId) {
                          setSelection({ kind: 'node', nodeId: issue.nodeId });
                        }
                      }}
                      type="button"
                    >
                      <strong>{issue.severity}</strong>
                      <span>{issue.message}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="canvas-shell">
        <div className="app-name">PPD Editor</div>
        <div className="canvas-frame" ref={canvasFrameRef}>
          <ReactFlow
            edgeTypes={edgeTypes}
            edges={edges}
            fitView
            minZoom={0.1}
            nodes={nodes}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            onlyRenderVisibleElements
            onNodesChange={onNodesChange}
            onConnect={handleConnect}
            onConnectEnd={handleConnectEnd}
            onEdgeClick={(_, edge) => {
              const branch = edge.data?.branch as RouteBranch | undefined;
              const nodeId = edge.data?.nodeId as string | undefined;
              const choiceId = edge.data?.choiceId as string | undefined;
              if (branch && nodeId && choiceId) {
                setSelection({ kind: 'edge', nodeId, choiceId, branch });
              }
            }}
            onNodeClick={(_, node) => {
              if (node.id === terminalCanvasId()) {
                return;
              }
              if (node.id.startsWith('skill-group:')) {
                return;
              }
              if (!node.id.startsWith('dialogue:')) {
                return;
              }
              const nodeId = node.id.replace(/^dialogue:/, '');
              if (project.nodes[nodeId]?.hidden) {
                setNodeHidden(nodeId, false);
              }
              setFocusChoice(undefined);
              setSelection({ kind: 'node', nodeId });
            }}
            onNodeDragStop={(_, node) => {
              const nodeById = new Map(nodesRef.current.map((currentNode) => [currentNode.id, currentNode]));

              if (node.id === terminalCanvasId()) {
                setTerminalPosition(node.position);
                return;
              }
              if (node.id.startsWith('skill-group:')) {
                const group = skillGroupById.get(node.id);
                if (!group) {
                  return;
                }
                moveNodes(group.nodeIds, {
                  x: node.position.x - group.position.x,
                  y: node.position.y - group.position.y
                });
                return;
              }
              if (!node.id.startsWith('dialogue:')) {
                return;
              }
              setNodePosition(node.id.replace(/^dialogue:/, ''), getAbsoluteCanvasPosition(node, nodeById));
            }}
            onPaneClick={() => {
              setPendingNodeLink(undefined);
              setFocusChoice(undefined);
              setSelection({ kind: 'scene' });
            }}
          >
            <Controls />
            <Background color="#40325c" gap={18} size={1} />
          </ReactFlow>
        </div>
      </main>

      <aside className={`right-rail${inspectorExpanded ? ' right-rail--expanded' : ' right-rail--collapsed'}`}>
        <div className="panel inspector">
          <div className="panel-header">
            <strong>Inspector</strong>
          </div>

          {selection.kind === 'scene' && (
            <div className="inspector-section inspector-section--empty">
              <p className="muted-copy">Select a node to edit text, portraits, choices, and skill-check routes.</p>
            </div>
          )}

          {(selection.kind === 'node' || selection.kind === 'choice') && selectedNode && (
              <NodeConnectionsPanel
              highlightedChoiceId={hoveredConnectionChoiceId}
              node={selectedNode}
              onSelectNode={(nodeId) => {
                setFocusChoice(undefined);
                setSelection({ kind: 'node', nodeId });
              }}
              project={project}
              selectedChoiceId={selection.kind === 'choice' ? selection.choiceId : undefined}
            />
          )}

          {selection.kind === 'edge' && selectedNode && selectedChoice && (
            <div className="inspector-section">
              <p>
                <strong>Route</strong>
              </p>
              <p className="muted-copy">
                {selection.branch} branch from <code>{selectedChoice.id}</code>
              </p>
              <button className="ghost-button danger" onClick={() => clearEdge(selectedNode.id, selectedChoice.id, selection.branch)} type="button">
                Clear target
              </button>
            </div>
          )}
        </div>
      </aside>

      <datalist id="asset-list">
        {Object.keys(project.assets).map((assetId) => (
          <option key={assetId} value={assetId} />
        ))}
      </datalist>

      <PreviewDialog onClose={() => setPreviewOpen(false)} open={previewOpen} project={project} />
      {pendingAddChoiceNodeId && addChoiceTargetNode && (
        <AddChoiceTypeDialog
          canAddExitPoint={!addChoiceTargetNode.choices.some((choice) => isDefaultLeaveChoice(choice))}
          onAddChoice={() => {
            addChoice(addChoiceTargetNode.id);
            setPendingAddChoiceNodeId(undefined);
          }}
          onAddExitPoint={() => {
            addLeaveChoice(addChoiceTargetNode.id);
            setPendingAddChoiceNodeId(undefined);
          }}
          onClose={() => setPendingAddChoiceNodeId(undefined)}
        />
      )}
      {(selection.kind === 'node' || selection.kind === 'choice') && selectedNode && (
        <CardEditorModal
          node={selectedNode}
          onClose={() => {
            setFocusChoice(undefined);
            setSelection({ kind: 'scene' });
          }}
          onCloseChoice={() => setSelection({ kind: 'node', nodeId: selectedNode.id })}
          onDropPortrait={(side, file, assetId) => handlePortraitDrop(side, file, assetId, selectedNode.id)}
          onHoverChoice={setHoveredConnectionChoiceId}
          onOpenAddChoice={() => setPendingAddChoiceNodeId(selectedNode.id)}
          onOpenChoice={(choiceId) => {
            setFocusChoice({ nodeId: selectedNode.id, choiceId });
            setSelection({ kind: 'choice', nodeId: selectedNode.id, choiceId });
          }}
          onRemoveChoice={(choiceId) => void requestDeleteChoice(selectedNode.id, choiceId)}
          project={project}
          selectedChoice={selection.kind === 'choice' ? selectedChoice : undefined}
          selectedLeftPortrait={selectedLeftPortrait}
          selectedRightPortrait={selectedRightPortrait}
        />
      )}
      {pendingNodeLink && project.nodes[pendingNodeLink.parentNodeId] && (
        <NodeLinkCreationDialog
          initialPosition={pendingNodeLink.flowPosition}
          onClose={() => setPendingNodeLink(undefined)}
          parentNode={project.nodes[pendingNodeLink.parentNodeId]}
          project={project}
          targetNode={pendingNodeLink.targetNodeId ? project.nodes[pendingNodeLink.targetNodeId] : undefined}
        />
      )}
      {pendingConfirmation && (
        <ConfirmationDialog confirmation={pendingConfirmation} onCancel={() => resolveConfirmation(false)} onConfirm={() => resolveConfirmation(true)} />
      )}
      <div className="app-version">v{appVersion}</div>
    </div>
  );
}

function NodeLinkCreationDialog({
  project,
  parentNode,
  targetNode,
  initialPosition,
  onClose
}: {
  project: DialogueProject;
  parentNode: DialogueNode;
  targetNode?: DialogueNode;
  initialPosition?: XYPosition;
  onClose: () => void;
}) {
  const createChoiceWithNode = useProjectStore((state) => state.createChoiceWithNode);
  const [step, setStep] = useState<1 | 2>(1);
  const [choiceText, setChoiceText] = useState('New option');
  const [nodeId, setNodeId] = useState('');
  const [nodeIdTouched, setNodeIdTouched] = useState(false);
  const [nodeText, setNodeText] = useState('New dialogue node.');
  const [eventName, setEventName] = useState('');
  const [skillCheckMode, setSkillCheckMode] = useState<SkillCheckMode>('none');
  const [passiveSkill, setPassiveSkill] = useState<typeof skillIds[number]>('perception');
  const [passiveDifficulty, setPassiveDifficulty] = useState(1);
  const [failureText, setFailureText] = useState('Failure outcome.');
  const [successText, setSuccessText] = useState('Success outcome.');
  const [criticalText, setCriticalText] = useState('Critical success outcome.');
  const [hasCriticalSuccess, setHasCriticalSuccess] = useState(false);
  const [confirmCriticalSuccess, setConfirmCriticalSuccess] = useState(false);
  const [activeSkill, setActiveSkill] = useState<typeof skillIds[number]>('strength');
  const [activeDifficulty, setActiveDifficulty] = useState(1);
  const createsNewNode = !targetNode;
  const suggestedNodeId = slugify(choiceText) || 'node';
  const effectiveNodeId = nodeIdTouched ? nodeId : suggestedNodeId;
  const createsOutcomeCards = createsNewNode && skillCheckMode === 'active';
  const targetAnchor =
    initialPosition ??
    ({
      x: parentNode.canvas.x + NODE_WIDTH + 180,
      y: parentNode.canvas.y + 80
    } satisfies XYPosition);

  function getOutcomeCardDrafts() {
    const topY = targetAnchor.y + 92;
    const centerOffset = NODE_WIDTH / 2;

    if (hasCriticalSuccess) {
      return {
        failure: {
          preferredId: `${suggestedNodeId}_fail`,
          text: failureText,
          position: { x: targetAnchor.x - 280 - centerOffset, y: topY }
        },
        success: {
          preferredId: `${suggestedNodeId}_success`,
          text: successText,
          position: { x: targetAnchor.x - centerOffset, y: topY }
        },
        critical: {
          preferredId: `${suggestedNodeId}_critical`,
          text: criticalText,
          position: { x: targetAnchor.x + 280 - centerOffset, y: topY }
        }
      } as const;
    }

    return {
      failure: {
        preferredId: `${suggestedNodeId}_fail`,
        text: failureText,
        position: { x: targetAnchor.x - 160 - centerOffset, y: topY }
      },
      success: {
        preferredId: `${suggestedNodeId}_success`,
        text: successText,
        position: { x: targetAnchor.x + 160 - centerOffset, y: topY }
      }
    } as const;
  }

  useEffect(() => {
    if (!targetNode) {
      return;
    }

    setSkillCheckMode('none');
    setHasCriticalSuccess(false);
  }, [targetNode]);

  function handleCreate() {
    createChoiceWithNode(parentNode.id, {
      choiceText,
      targetNodeId: targetNode?.id,
      eventName,
      visibilityCheck: skillCheckMode === 'passive'
        ? {
            skill: passiveSkill,
            difficulty: Math.max(1, passiveDifficulty)
          }
        : undefined,
      resolutionCheck: skillCheckMode === 'active'
        ? {
            skill: activeSkill,
            difficulty: Math.max(1, activeDifficulty)
          }
        : undefined,
      newNode: createsNewNode
        ? createsOutcomeCards
          ? undefined
          : {
              preferredId: effectiveNodeId,
              text: nodeText,
              position: initialPosition
                ? {
                    x: initialPosition.x - NODE_WIDTH / 2,
                    y: initialPosition.y - NODE_HEIGHT / 2
                  }
                : {
                    x: parentNode.canvas.x + NODE_WIDTH + 120,
                    y: parentNode.canvas.y + 80
                  }
            }
        : undefined,
      routeNodes: createsOutcomeCards
        ? getOutcomeCardDrafts()
        : undefined
    });
    onClose();
  }

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true">
      <div className="choice-editor creation-dialog">
        <div className="preview-toolbar">
          <strong>{createsNewNode ? 'Create Choice And Node' : 'Create Choice'}</strong>
          <div className="toolbar-actions">
            <button className="ghost-button" onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        </div>

        {step === 1 && (
          <div className="choice-editor__grid">
            <p className="muted-copy">
              Add a new choice to <code>{parentNode.id}</code>
              {targetNode ? (
                <>
                  {' '}
                  and connect it to <code>{targetNode.id}</code>.
                </>
              ) : (
                '.'
              )}
            </p>
            <label>
              Choice text
              <input autoFocus value={choiceText} onChange={(event) => setChoiceText(event.target.value)} />
            </label>
            <label>
              Event name
              <input placeholder="Optional event trigger" value={eventName} onChange={(event) => setEventName(normalizeEventName(event.target.value))} />
            </label>
            <div className="choice-editor__toggles choice-editor__toggles--checks">
              <label className="choice-toggle">
                <input
                  checked={skillCheckMode === 'passive'}
                  onChange={(event) => setSkillCheckMode(event.target.checked ? 'passive' : 'none')}
                  type="checkbox"
                />
                Passive check
              </label>
              <label className="choice-toggle">
                <input
                  checked={skillCheckMode === 'active'}
                  disabled={Boolean(targetNode)}
                  onChange={(event) => setSkillCheckMode(event.target.checked ? 'active' : 'none')}
                  type="checkbox"
                />
                Active check
              </label>
            </div>
            {targetNode ? <p className="muted-copy">Active checks create dedicated fail and success nodes, so they are only available when dropping into empty space.</p> : null}
            {skillCheckMode === 'passive' && (
              <div className="inline-grid">
                <label>
                  Passive skill
                  <select value={passiveSkill} onChange={(event) => setPassiveSkill(event.target.value as (typeof skillIds)[number])}>
                    {skillIds.map((skill) => (
                      <option key={skill} value={skill}>
                        {skill}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Difficulty
                  <input min={1} type="number" value={passiveDifficulty} onChange={(event) => setPassiveDifficulty(Number(event.target.value) || 1)} />
                </label>
              </div>
            )}
            {skillCheckMode === 'active' && (
              <div className="inline-grid">
                <label>
                  Active skill
                  <select value={activeSkill} onChange={(event) => setActiveSkill(event.target.value as (typeof skillIds)[number])}>
                    {skillIds.map((skill) => (
                      <option key={skill} value={skill}>
                        {skill}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Difficulty
                  <input min={1} type="number" value={activeDifficulty} onChange={(event) => setActiveDifficulty(Number(event.target.value) || 1)} />
                </label>
              </div>
            )}
            <div className="button-row">
              {createsNewNode ? (
                <button className="primary-button" onClick={() => setStep(2)} type="button">
                  Next
                </button>
              ) : (
                <button className="primary-button" onClick={handleCreate} type="button">
                  Create choice
                </button>
              )}
            </div>
          </div>
        )}

        {createsNewNode && step === 2 && !createsOutcomeCards && (
          <div className="choice-editor__grid">
            <p className="muted-copy">Create the linked dialogue node and place it at the drop point.</p>
            <label>
              Node id
              <input
                autoFocus
                placeholder="Auto-generate if blank"
                value={effectiveNodeId}
                onChange={(event) => {
                  setNodeIdTouched(true);
                  setNodeId(event.target.value);
                }}
              />
            </label>
            <label>
              Dialogue text
              <textarea rows={6} value={nodeText} onChange={(event) => setNodeText(event.target.value)} />
            </label>
            <div className="button-row">
              <button className="ghost-button" onClick={() => setStep(1)} type="button">
                Back
              </button>
              <button className="primary-button" onClick={handleCreate} type="button">
                Create node
              </button>
            </div>
          </div>
        )}

        {createsOutcomeCards && step === 2 && (
          <div className="choice-editor__grid">
            <p className="muted-copy">Create the outcome nodes for this {skillCheckMode} skill check.</p>
            <div className={`skill-outcome-grid${hasCriticalSuccess ? ' skill-outcome-grid--critical' : ''}`}>
              <div className="issue skill-outcome-card">
                <strong>Failure</strong>
                <span>
                  Node id: <code>{`${suggestedNodeId}_fail`}</code>
                </span>
                <label>
                  Dialogue text
                  <textarea rows={6} value={failureText} onChange={(event) => setFailureText(event.target.value)} />
                </label>
              </div>
              <div className="issue skill-outcome-card">
                <strong>Success</strong>
                <span>
                  Node id: <code>{`${suggestedNodeId}_success`}</code>
                </span>
                <label>
                  Dialogue text
                  <textarea rows={6} value={successText} onChange={(event) => setSuccessText(event.target.value)} />
                </label>
              </div>
              {hasCriticalSuccess ? (
                <div className="issue skill-outcome-card">
                  <strong>Critical success</strong>
                  <span>
                    Node id: <code>{`${suggestedNodeId}_critical`}</code>
                  </span>
                  <label>
                    Dialogue text
                    <textarea rows={6} value={criticalText} onChange={(event) => setCriticalText(event.target.value)} />
                  </label>
                </div>
              ) : (
                <button className="issue skill-outcome-card skill-outcome-card--dimmed" onClick={() => setConfirmCriticalSuccess(true)} type="button">
                  <strong>Critical success</strong>
                  <span>Optional extra branch</span>
                  <span className="muted-copy">Click to add a dedicated critical success node.</span>
                </button>
              )}
            </div>
            <div className="button-row">
              <button className="ghost-button" onClick={() => setStep(1)} type="button">
                Back
              </button>
              <button className="primary-button" onClick={handleCreate} type="button">
                Create nodes
              </button>
            </div>
          </div>
        )}
      </div>
      {confirmCriticalSuccess && (
        <ConfirmationDialog
          confirmation={{
            title: 'Add critical success',
            message: 'Add a dedicated critical success outcome node for this skill check?',
            confirmLabel: 'Add critical branch'
          }}
          onCancel={() => setConfirmCriticalSuccess(false)}
          onConfirm={() => {
            setHasCriticalSuccess(true);
            setConfirmCriticalSuccess(false);
          }}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <EditorCanvas />
    </ReactFlowProvider>
  );
}
