import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Background, Controls, MarkerType, ReactFlow, ReactFlowProvider, useNodesState, type Connection, type Edge, type Node, useReactFlow, type OnConnectEnd, type XYPosition } from '@xyflow/react';
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
  getChoiceRouteTarget,
  getNodeAccentColor,
  getTerminalNodePosition,
  getRouteHandleDirections,
  NODE_HEIGHT,
  NODE_WIDTH,
  parseNodeHandle,
  parseSourceHandle,
  shouldProceedWithRouteConnection,
  skillIds,
  slugify,
  terminalCanvasId,
  type SkillGroupLayout,
  type DialogueChoice,
  type DialogueNode,
  type DialogueProject,
  type RouteBranch
} from './dialogue';
import { buildRuntimeZip, downloadBlob } from './exporter';
import { AUTOSAVE_KEY, downloadProjectFile, fileToAsset, loadProjectFromStorage, readProjectFile } from './projectFiles';
import { setChoiceClose, setChoiceColor, setChoiceNextField, setChoiceResolutionEnabled, setChoiceResolutionField, setChoiceText, setChoiceVisibilityEnabled, setChoiceVisibilityField, useProjectStore } from './store';
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

function EditorCanvas() {
  const reactFlow = useReactFlow();
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
  const addAsset = useProjectStore((state) => state.addAsset);
  const renameAsset = useProjectStore((state) => state.renameAsset);
  const removeAsset = useProjectStore((state) => state.removeAsset);

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
            dimmed: Boolean(focusScope) && !focusScope?.nodeIds.has(node.id)
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
    [closeRouteSummary, focusScope, groupedChoicesByNodeId, project, routeHandleDirections, selection, skillGroupByNodeId, skillGroupLayouts, terminalPosition]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(canvasNodes);
  const nodesRef = useRef<Node[]>(canvasNodes);

  useEffect(() => {
    setNodes(canvasNodes);
  }, [canvasNodes, setNodes]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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

  function connectChoiceRoute(sourceNodeId: string, choiceId: string, branch: RouteBranch, targetNodeId: string) {
    const sourceChoice = project.nodes[sourceNodeId]?.choices.find((choice) => choice.id === choiceId);
    if (!sourceChoice) {
      return;
    }

    const existingTargetNodeId = getChoiceRouteTarget(sourceChoice, branch);
    if (
      !shouldProceedWithRouteConnection(sourceChoice, branch, targetNodeId, (message) => window.confirm(message))
    ) {
      if (existingTargetNodeId === targetNodeId) {
        setSelection({ kind: 'edge', nodeId: sourceNodeId, choiceId, branch });
      }
      return;
    }

    connectRoute(sourceNodeId, choiceId, branch, targetNodeId);
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
    connectChoiceRoute(sourceNodeId, parsed.choiceId, parsed.branch, connection.target.replace(/^dialogue:/, ''));
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

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="panel">
          <div className="panel-header">
            <strong>Project</strong>
          </div>
          <label>
            Scene id
            <input value={project.sceneId} onChange={(event) => setSceneField('sceneId', event.target.value)} />
          </label>
          <label>
            Title
            <input value={project.title ?? ''} onChange={(event) => setSceneField('title', event.target.value)} />
          </label>
          <div className="button-row">
            <button className="primary-button" onClick={() => addNode()} type="button">
              Add node
            </button>
            <button className="ghost-button" onClick={() => reactFlow.fitView({ padding: 0.2 })} type="button">
              Fit view
            </button>
          </div>
          <div className="button-row">
            <button className="ghost-button" onClick={() => downloadProjectFile(project)} type="button">
              Save project
            </button>
            <button className="ghost-button" onClick={() => importProjectRef.current?.click()} type="button">
              Load project
            </button>
          </div>
          <div className="button-row">
            <button className="ghost-button" onClick={() => setPreviewOpen(true)} type="button">
              Preview
            </button>
            <button className="primary-button" disabled={errors.length > 0} onClick={handleExport} type="button">
              Export zip
            </button>
          </div>
          <div className="status-line">{status}</div>
          <input accept=".json" hidden onChange={handleProjectImport} ref={importProjectRef} type="file" />
        </div>

        <div className="panel">
          <div className="panel-header">
            <strong>Assets</strong>
            <button className="ghost-button" onClick={() => fileInputRef.current?.click()} type="button">
              Upload
            </button>
          </div>
          <input accept="image/*" hidden multiple onChange={handleAssetUpload} ref={fileInputRef} type="file" />
          <div className="asset-list">
            {Object.values(project.assets).map((asset) => (
              <div className="asset-item" key={asset.id}>
                <input aria-label={`asset-${asset.id}`} value={asset.id} onChange={(event) => renameAsset(asset.id, event.target.value)} />
                <span>{asset.fileName}</span>
                <button className="ghost-button danger" onClick={() => removeAsset(asset.id)} type="button">
                  Remove
                </button>
              </div>
            ))}
            {Object.keys(project.assets).length === 0 && <p className="muted-copy">No portraits uploaded yet.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <strong>Reset</strong>
          </div>
          <button
            className="ghost-button danger"
            onClick={() => {
              if (window.confirm('Clear the current scene and keep only a fresh start node?')) {
                clearScene();
              }
            }}
            type="button"
          >
            Clear scene
          </button>
          <button className="ghost-button danger" onClick={resetProject} type="button">
            Reset sample scene
          </button>
        </div>
      </aside>

      <main className="canvas-shell">
        <div className="toolbar">
          <div>
            <strong>Primal Punk Dialogue Editor</strong>
            <div className="muted-copy">Canvas-first authoring for branching dialogue and skill checks.</div>
          </div>
          <div className="toolbar-actions">
            <span>{Object.keys(project.nodes).length} nodes</span>
            <span>{project.sceneId}.json</span>
          </div>
        </div>

        <div className="canvas-frame">
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
          {errors.length > 0 && (
            <div className="canvas-alert canvas-alert--error">
              <div className="panel-header">
                <strong>Validation Errors</strong>
                <span>{errors.length}</span>
              </div>
              <div className="issue-list">
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
          )}
        </div>
      </main>

      <aside className="right-rail">
        <div className="panel inspector">
          <div className="panel-header">
            <strong>Inspector</strong>
          </div>

          {selection.kind === 'scene' && (
            <div className="inspector-section">
              <p className="muted-copy">Select a node to edit dialogue-level details. Click a choice inside a node card to edit that choice in a modal.</p>
            </div>
          )}

          {selection.kind === 'node' && selectedNode && (
            <div className="inspector-section">
              <label>
                Node id
                <input value={selectedNode.id} onChange={(event) => updateNodeId(selectedNode.id, event.target.value)} />
              </label>
              <label>
                Dialogue text
                <textarea rows={7} value={selectedNode.text} onChange={(event) => updateNodeText(selectedNode.id, event.target.value)} />
              </label>
              <label>
                Left portrait
                <input list="asset-list" placeholder="Inherit previous" value={selectedNode.portraits.left ?? ''} onChange={(event) => updateNodePortrait(selectedNode.id, 'left', event.target.value)} />
              </label>
              <label>
                Right portrait
                <input list="asset-list" placeholder="Inherit previous" value={selectedNode.portraits.right ?? ''} onChange={(event) => updateNodePortrait(selectedNode.id, 'right', event.target.value)} />
              </label>
              <div className="button-row">
                <button className="primary-button subtle" onClick={() => addChoice(selectedNode.id)} type="button">
                  Add choice
                </button>
                <button className="ghost-button" onClick={() => addLeaveChoice(selectedNode.id)} type="button">
                  Add leave choice
                </button>
              </div>
            </div>
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
      {selection.kind === 'choice' && selectedNode && selectedChoice && (
        <ChoiceEditorDialog choice={selectedChoice} node={selectedNode} onClose={() => setSelection({ kind: 'node', nodeId: selectedNode.id })} onRemove={() => removeChoice(selectedNode.id, selectedChoice.id)} />
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
  const [hasPassiveCheck, setHasPassiveCheck] = useState(false);
  const [passiveSkill, setPassiveSkill] = useState<typeof skillIds[number]>('perception');
  const [passiveDifficulty, setPassiveDifficulty] = useState(1);
  const [hasActiveCheck, setHasActiveCheck] = useState(false);
  const [hasCriticalSuccess, setHasCriticalSuccess] = useState(false);
  const [activeSkill, setActiveSkill] = useState<typeof skillIds[number]>('strength');
  const [activeDifficulty, setActiveDifficulty] = useState(1);
  const createsNewNode = !targetNode;
  const suggestedNodeId = slugify(choiceText) || 'node';
  const effectiveNodeId = nodeIdTouched ? nodeId : suggestedNodeId;
  const createsOutcomeCards = createsNewNode && hasActiveCheck;
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
          text: 'Failure outcome.',
          position: { x: targetAnchor.x - 280 - centerOffset, y: topY }
        },
        success: {
          preferredId: `${suggestedNodeId}_success`,
          text: 'Success outcome.',
          position: { x: targetAnchor.x - centerOffset, y: topY }
        },
        critical: {
          preferredId: `${suggestedNodeId}_critical`,
          text: 'Critical success outcome.',
          position: { x: targetAnchor.x + 280 - centerOffset, y: topY }
        }
      } as const;
    }

    return {
      failure: {
        preferredId: `${suggestedNodeId}_fail`,
        text: 'Failure outcome.',
        position: { x: targetAnchor.x - 160 - centerOffset, y: topY }
      },
      success: {
        preferredId: `${suggestedNodeId}_success`,
        text: 'Success outcome.',
        position: { x: targetAnchor.x + 160 - centerOffset, y: topY }
      }
    } as const;
  }

  useEffect(() => {
    if (!targetNode) {
      return;
    }

    setHasActiveCheck(false);
    setHasCriticalSuccess(false);
  }, [targetNode]);

  function handleCreate() {
    createChoiceWithNode(parentNode.id, {
      choiceText,
      targetNodeId: targetNode?.id,
      eventName,
      visibilityCheck: hasPassiveCheck
        ? {
            skill: passiveSkill,
            difficulty: Math.max(1, passiveDifficulty)
          }
        : undefined,
      resolutionCheck: hasActiveCheck
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
          <strong>{createsNewNode ? 'Create Choice And Card' : 'Create Choice'}</strong>
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
              <input placeholder="Optional event trigger" value={eventName} onChange={(event) => setEventName(event.target.value)} />
            </label>
            <div className="choice-editor__toggles">
              <label className="choice-toggle">
                <input checked={hasPassiveCheck} onChange={(event) => setHasPassiveCheck(event.target.checked)} type="checkbox" />
                Passive check
              </label>
              <label className="choice-toggle">
                <input checked={hasActiveCheck} disabled={Boolean(targetNode)} onChange={(event) => setHasActiveCheck(event.target.checked)} type="checkbox" />
                Active check
              </label>
            </div>
            {targetNode ? <p className="muted-copy">Active checks require creating new outcome cards, so they are only available when dropping into empty space.</p> : null}
            {hasActiveCheck && (
              <label className="choice-toggle">
                <input checked={hasCriticalSuccess} onChange={(event) => setHasCriticalSuccess(event.target.checked)} type="checkbox" />
                Critical success branch
              </label>
            )}
            {hasPassiveCheck && (
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
            {hasActiveCheck && (
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
            <p className="muted-copy">Create the linked dialogue card and place it at the drop point.</p>
            <label>
              Card id
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
                Create card
              </button>
            </div>
          </div>
        )}

        {createsOutcomeCards && step === 2 && (
          <div className="choice-editor__grid">
            <p className="muted-copy">Create the active-check outcome cards at the drop point and wrap them in a skill container.</p>
            <div className="issue">
              <strong>Cards to create</strong>
              <span>Failure: <code>{`${suggestedNodeId}_fail`}</code></span>
              <span>Success: <code>{`${suggestedNodeId}_success`}</code>{hasCriticalSuccess ? '' : ' (also handles critical success)'}</span>
              {hasCriticalSuccess ? <span>Critical: <code>{`${suggestedNodeId}_critical`}</code></span> : null}
            </div>
            <div className="button-row">
              <button className="ghost-button" onClick={() => setStep(1)} type="button">
                Back
              </button>
              <button className="primary-button" onClick={handleCreate} type="button">
                Create cards
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceEditorDialog({ choice, node, onClose, onRemove }: { choice: DialogueChoice; node: DialogueNode; onClose: () => void; onRemove: () => void }) {
  const project = useProjectStore((state) => state.project);
  const updateChoice = useProjectStore((state) => state.updateChoice);

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true">
      <div className="choice-editor">
        <div className="preview-toolbar">
          <strong>Edit Choice</strong>
          <div className="toolbar-actions">
            <button className="ghost-button danger" onClick={onRemove} type="button">
              Remove choice
            </button>
            <button className="ghost-button" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        <div className="choice-editor__grid">
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

          <label>
            Next node
            <select value={choice.nextNodeId ?? ''} onChange={(event) => updateChoice(node.id, choice.id, setChoiceNextField('nextNodeId', event.target.value))}>
              <option value="">None</option>
              {Object.keys(project.nodes)
                .filter((nodeId) => nodeId !== node.id)
                .map((nodeId) => (
                  <option key={nodeId} value={nodeId}>
                    {nodeId}
                  </option>
                ))}
            </select>
          </label>

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

              <label>
                Failure node
                <select value={choice.resolutionCheck.failureNodeId ?? ''} onChange={(event) => updateChoice(node.id, choice.id, setChoiceResolutionField('failureNodeId', event.target.value))}>
                  <option value="">None</option>
                  {Object.keys(project.nodes)
                    .filter((nodeId) => nodeId !== node.id)
                    .map((nodeId) => (
                      <option key={nodeId} value={nodeId}>
                        {nodeId}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Success node
                <select value={choice.resolutionCheck.successNodeId ?? ''} onChange={(event) => updateChoice(node.id, choice.id, setChoiceResolutionField('successNodeId', event.target.value))}>
                  <option value="">None</option>
                  {Object.keys(project.nodes)
                    .filter((nodeId) => nodeId !== node.id)
                    .map((nodeId) => (
                      <option key={nodeId} value={nodeId}>
                        {nodeId}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Critical node
                <select value={choice.resolutionCheck.criticalSuccessNodeId ?? ''} onChange={(event) => updateChoice(node.id, choice.id, setChoiceResolutionField('criticalSuccessNodeId', event.target.value))}>
                  <option value="">Fallback to success</option>
                  {Object.keys(project.nodes)
                    .filter((nodeId) => nodeId !== node.id)
                    .map((nodeId) => (
                      <option key={nodeId} value={nodeId}>
                        {nodeId}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}

        </div>
      </div>
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
