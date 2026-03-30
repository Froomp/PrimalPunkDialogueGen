import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Connection, type Edge, type Node, useReactFlow } from '@xyflow/react';
import { DialogueEdge } from './DialogueEdge';
import { GraphNode } from './GraphNode';
import { PreviewDialog } from './PreviewDialog';
import { TerminalNode } from './TerminalNode';
import {
  compileRuntime,
  createDefaultProject,
  deriveEdges,
  dialogueCanvasId,
  getCloseRouteSummary,
  getChoiceFocusScope,
  getNodeAccentColor,
  getTerminalNodePosition,
  getRouteHandleDirections,
  parseSourceHandle,
  skillIds,
  terminalCanvasId,
  type DialogueChoice,
  type DialogueNode,
  type RouteBranch
} from './dialogue';
import { buildRuntimeZip, downloadBlob } from './exporter';
import { AUTOSAVE_KEY, downloadProjectFile, fileToAsset, loadProjectFromStorage, readProjectFile } from './projectFiles';
import { setChoiceClose, setChoiceColor, setChoiceNextField, setChoiceResolutionEnabled, setChoiceResolutionField, setChoiceText, setChoiceVisibilityEnabled, setChoiceVisibilityField, useProjectStore } from './store';
import { validateProject } from './validation';

const nodeTypes = {
  dialogueNode: GraphNode,
  terminalNode: TerminalNode
};

const edgeTypes = {
  dialogue: DialogueEdge
};

function EditorCanvas() {
  const reactFlow = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importProjectRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string>('Autosave active');

  const project = useProjectStore((state) => state.project);
  const selection = useProjectStore((state) => state.selection);
  const focusChoice = useProjectStore((state) => state.focusChoice);
  const previewOpen = useProjectStore((state) => state.previewOpen);
  const replaceProject = useProjectStore((state) => state.replaceProject);
  const setSelection = useProjectStore((state) => state.setSelection);
  const setFocusChoice = useProjectStore((state) => state.setFocusChoice);
  const setPreviewOpen = useProjectStore((state) => state.setPreviewOpen);
  const resetProject = useProjectStore((state) => state.resetProject);
  const setSceneField = useProjectStore((state) => state.setSceneField);
  const addNode = useProjectStore((state) => state.addNode);
  const updateNodeText = useProjectStore((state) => state.updateNodeText);
  const updateNodePortrait = useProjectStore((state) => state.updateNodePortrait);
  const updateNodeId = useProjectStore((state) => state.updateNodeId);
  const setNodeHidden = useProjectStore((state) => state.setNodeHidden);
  const setNodePosition = useProjectStore((state) => state.setNodePosition);
  const setTerminalPosition = useProjectStore((state) => state.setTerminalPosition);
  const addChoice = useProjectStore((state) => state.addChoice);
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
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const terminalPosition = useMemo(() => getTerminalNodePosition(project), [project]);
  const closeRouteSummary = useMemo(() => getCloseRouteSummary(project), [project]);
  const routeHandleDirections = useMemo(() => getRouteHandleDirections(project, terminalPosition), [project, terminalPosition]);
  const focusScope = useMemo(() => {
    if (!focusChoice) {
      return undefined;
    }
    return getChoiceFocusScope(project, focusChoice.nodeId, focusChoice.choiceId);
  }, [focusChoice, project]);

  const nodes = useMemo<Node[]>(
    () => {
      const dialogueNodes: Node[] = Object.values(project.nodes).map((node) => ({
        id: dialogueCanvasId(node.id),
        type: 'dialogueNode',
        position: node.canvas,
        data: {
          node,
          accentColor: getNodeAccentColor(project, node.id),
          routeHandleDirections: routeHandleDirections[node.id] ?? {},
          dimmed: Boolean(focusScope) && !focusScope?.nodeIds.has(node.id)
        },
        selected: selection.kind !== 'scene' && selection.nodeId === node.id
      }));

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

      return [...dialogueNodes, ...terminalNodes];
    },
    [closeRouteSummary, focusScope, project, routeHandleDirections, selection, terminalPosition]
  );

  const edges = useMemo<Edge[]>(
    () =>
      deriveEdges(project).map((edge) => {
        const sourceNodeId = edge.source.replace(/^dialogue:/, '');
        const targetIsTerminal = edge.target === terminalCanvasId();
        const inFocus =
          !focusScope ||
          (focusScope.nodeIds.has(sourceNodeId) && (targetIsTerminal ? focusScope.includeTerminal : focusScope.nodeIds.has(edge.target.replace(/^dialogue:/, ''))));

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: inFocus ? edge.style?.opacity ?? 1 : 0.14
          }
        };
      }),
    [focusScope, project]
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
    const parsed = parseSourceHandle(connection.sourceHandle);
    if (!connection.source || !connection.target || !parsed || !connection.target.startsWith('dialogue:')) {
      return;
    }
    connectRoute(connection.source.replace(/^dialogue:/, ''), parsed.choiceId, parsed.branch, connection.target.replace(/^dialogue:/, ''));
  }

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
          <label>
            Start node
            <select value={project.startNodeId} onChange={(event) => setSceneField('startNodeId', event.target.value)}>
              {Object.keys(project.nodes).map((nodeId) => (
                <option key={nodeId} value={nodeId}>
                  {nodeId}
                </option>
              ))}
            </select>
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
            <strong>Validation</strong>
            <span>
              {errors.length} errors / {warnings.length} warnings
            </span>
          </div>
          <div className="issue-list">
            {issues.map((issue) => (
              <button
                className={`issue issue--${issue.severity}`}
                key={`${issue.code}-${issue.message}`}
                onClick={() => {
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
            {issues.length === 0 && <p className="muted-copy">Graph is valid and ready to export.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <strong>Reset</strong>
          </div>
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
            <span>{compileRuntime(project).scene_id}.json</span>
          </div>
        </div>

        <div className="canvas-frame">
          <ReactFlow
            edgeTypes={edgeTypes}
            edges={edges}
            fitView
            nodes={nodes}
            nodeTypes={nodeTypes}
            onConnect={handleConnect}
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
            onNodeDrag={(_, node) => {
              if (node.id === terminalCanvasId()) {
                setTerminalPosition(node.position);
                return;
              }
              if (!node.id.startsWith('dialogue:')) {
                return;
              }
              setNodePosition(node.id.replace(/^dialogue:/, ''), node.position);
            }}
            onNodeDragStop={(_, node) => {
              if (node.id === terminalCanvasId()) {
                setTerminalPosition(node.position);
                return;
              }
              if (!node.id.startsWith('dialogue:')) {
                return;
              }
              setNodePosition(node.id.replace(/^dialogue:/, ''), node.position);
            }}
            onPaneClick={() => {
              setFocusChoice(undefined);
              setSelection({ kind: 'scene' });
            }}
          >
            <MiniMap pannable zoomable />
            <Controls />
            <Background color="#40325c" gap={18} size={1} />
          </ReactFlow>
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
              <button className="primary-button subtle" onClick={() => addChoice(selectedNode.id)} type="button">
                Add choice
              </button>
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
    </div>
  );
}

function ChoiceEditorDialog({ choice, node, onClose, onRemove }: { choice: DialogueChoice; node: DialogueNode; onClose: () => void; onRemove: () => void }) {
  const project = useProjectStore((state) => state.project);
  const updateChoice = useProjectStore((state) => state.updateChoice);
  const createConnectedNode = useProjectStore((state) => state.createConnectedNode);

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

          <div className="button-row">
            <button className="mini-button" onClick={() => createConnectedNode(node.id, choice.id, 'next')} type="button">
              Create next dialogue
            </button>
            {choice.resolutionCheck && (
              <>
                <button className="mini-button" onClick={() => createConnectedNode(node.id, choice.id, 'failure')} type="button">
                  Create fail dialogue
                </button>
                <button className="mini-button" onClick={() => createConnectedNode(node.id, choice.id, 'success')} type="button">
                  Create success dialogue
                </button>
                <button className="mini-button" onClick={() => createConnectedNode(node.id, choice.id, 'critical')} type="button">
                  Create crit dialogue
                </button>
              </>
            )}
          </div>
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
