import { useEffect, useMemo, useState } from 'react';
import { resolveNodePortraits, type DialogueChoice, type DialogueNode, type DialogueProject } from './dialogue';
import { setChoiceText, useProjectStore } from './store';

type PreviewDialogProps = {
  open: boolean;
  project: DialogueProject;
  onClose: () => void;
};

type ActiveResult = 'failure' | 'success' | 'critical';

export function PreviewDialog({ open, project, onClose }: PreviewDialogProps) {
  const [currentNodeId, setCurrentNodeId] = useState(project.startNodeId);
  const [hidePassiveChoices, setHidePassiveChoices] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [activeFlags, setActiveFlags] = useState<string[]>([]);
  const [editingNodeId, setEditingNodeId] = useState<string | undefined>(undefined);
  const [hoveredChoiceId, setHoveredChoiceId] = useState<string | undefined>(undefined);
  const [pendingActiveChoice, setPendingActiveChoice] = useState<DialogueChoice | undefined>(undefined);

  const node = project.nodes[currentNodeId];
  const previewNodes = useMemo(
    () =>
      Object.values(project.nodes).sort((left, right) => {
        if (left.id === project.startNodeId) {
          return -1;
        }
        if (right.id === project.startNodeId) {
          return 1;
        }
        return left.id.localeCompare(right.id);
      }),
    [project.nodes, project.startNodeId]
  );

  const hoveredTargetNodeIds = useMemo(() => {
    if (!node || !hoveredChoiceId) {
      return new Set<string>();
    }

    const hoveredChoice = node.choices.find((choice) => choice.id === hoveredChoiceId);
    if (!hoveredChoice) {
      return new Set<string>();
    }

    return new Set(
      [
        hoveredChoice.nextNodeId,
        hoveredChoice.resolutionCheck?.failureNodeId,
        hoveredChoice.resolutionCheck?.successNodeId,
        hoveredChoice.resolutionCheck?.criticalSuccessNodeId
      ].filter((targetId): targetId is string => Boolean(targetId && project.nodes[targetId]))
    );
  }, [hoveredChoiceId, node, project.nodes]);

  useEffect(() => {
    if (!project.nodes[currentNodeId]) {
      setCurrentNodeId(project.startNodeId);
    }
  }, [currentNodeId, project.nodes, project.startNodeId]);

  useEffect(() => {
    if (editingNodeId && !project.nodes[editingNodeId]) {
      setEditingNodeId(undefined);
    }
  }, [editingNodeId, project.nodes]);

  if (!open) {
    return null;
  }

  function resetPreview() {
    setCurrentNodeId(project.startNodeId);
    setEventLog([]);
    setActiveFlags([]);
    setHoveredChoiceId(undefined);
    setPendingActiveChoice(undefined);
  }

  function applyChoice(choice: DialogueChoice, activeResult?: ActiveResult) {
    if (choice.eventName) {
      setEventLog((log) => [...log, `Event: ${choice.eventName}`]);
    }
    if (choice.setFlags?.length) {
      const nextFlags = choice.setFlags;
      setActiveFlags((currentFlags) => {
        const mergedFlags = [...new Set([...currentFlags, ...nextFlags])];
        return mergedFlags;
      });
      setEventLog((log) => [...log, `Set flags: ${nextFlags.join(', ')}`]);
    }

    const skillCheck = choice.resolutionCheck;

    if (skillCheck && activeResult) {
      const routes: Record<ActiveResult, string | undefined> = {
        failure: skillCheck.failureNodeId,
        success: skillCheck.successNodeId,
        critical: skillCheck.criticalSuccessNodeId ?? skillCheck.successNodeId
      };

      const nextNodeId = routes[activeResult];
      if (nextNodeId && project.nodes[nextNodeId]) {
        setCurrentNodeId(nextNodeId);
        return;
      }
    }

    if (choice.nextNodeId && project.nodes[choice.nextNodeId]) {
      setCurrentNodeId(choice.nextNodeId);
      return;
    }

    if (choice.close) {
      onClose();
    }
  }

  function passesConditions(choice: DialogueChoice) {
    const requiredFlags = choice.conditions?.flagsAll ?? [];
    const blockedFlags = choice.conditions?.flagsNot ?? [];

    return requiredFlags.every((flag) => activeFlags.includes(flag)) && blockedFlags.every((flag) => !activeFlags.includes(flag));
  }

  function executeChoice(choice: DialogueChoice) {
    if (choice.visibilityCheck && hidePassiveChoices) {
      return;
    }

    if (choice.resolutionCheck) {
      setPendingActiveChoice(choice);
      return;
    }

    applyChoice(choice);
  }

  const currentNode: DialogueNode | undefined = node;
  const visibleChoices = (currentNode?.choices ?? []).filter((choice) => !(hidePassiveChoices && choice.visibilityCheck) && passesConditions(choice));
  const effectivePortraits = currentNode ? resolveNodePortraits(project, currentNode.id) : {};
  const leftAsset = effectivePortraits.left ? project.assets[effectivePortraits.left] : undefined;
  const rightAsset = effectivePortraits.right ? project.assets[effectivePortraits.right] : undefined;

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true">
      <div className="preview-shell">
          <div className="preview-toolbar">
            <strong>Preview</strong>
            <div className="toolbar-actions">
              <label>
                <input checked={hidePassiveChoices} onChange={(event) => setHidePassiveChoices(event.target.checked)} type="checkbox" />
                Hide passive-gated choices
              </label>
              <button className="ghost-button" onClick={resetPreview} type="button">
                Restart
            </button>
            <button className="ghost-button" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        <div className="preview-stage">
          <div className="preview-side-column">
            <div className="preview-portrait">
              {leftAsset ? <img alt={effectivePortraits.left} src={leftAsset.dataUrl} /> : <span>Left portrait empty</span>}
            </div>
            <div className="preview-log preview-log--panel">
              <strong>Event log</strong>
              {eventLog.length > 0 ? (
                eventLog.map((line) => <div key={line}>{line}</div>)
              ) : (
                <div className="muted-copy">Triggered events will appear here.</div>
              )}
            </div>
          </div>
          <div className="preview-dialogue">
            <div className="preview-text">{currentNode?.text || 'Missing start node.'}</div>
            <div className="preview-choices">
              {visibleChoices.map((choice) => (
                <button
                  className={`preview-choice ${choice.eventName ? 'preview-choice--eventful' : ''}`}
                  key={choice.id}
                  onClick={() => executeChoice(choice)}
                  onMouseEnter={() => setHoveredChoiceId(choice.id)}
                  onMouseLeave={() => setHoveredChoiceId((current) => (current === choice.id ? undefined : current))}
                  style={{ borderColor: choice.color, boxShadow: `inset 3px 0 0 ${choice.color}` }}
                  type="button"
                >
                  <span>{choice.text}</span>
                  {choice.eventName ? <span className="preview-choice__event">Event: {choice.eventName}</span> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="preview-portrait">
            {rightAsset ? <img alt={effectivePortraits.right} src={rightAsset.dataUrl} /> : <span>Right portrait empty</span>}
          </div>
          <div className="preview-card-rail">
            <div className="preview-card-rail__title">Nodes</div>
            <div className="preview-card-rail__list">
              {previewNodes.map((previewNode) => (
                <button
                  aria-label={`Edit node ${previewNode.id}`}
                  className={`preview-card-chip ${previewNode.id === currentNodeId ? 'is-active' : ''} ${hoveredTargetNodeIds.has(previewNode.id) ? 'is-targeted' : ''}`}
                  key={previewNode.id}
                  onClick={() => setEditingNodeId(previewNode.id)}
                  type="button"
                >
                  <strong>{previewNode.id}</strong>
                  <span>{previewNode.text || 'Empty dialogue text'}</span>
                  <small>{previewNode.choices.length} choices</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {editingNodeId && <PreviewNodeEditorDialog nodeId={editingNodeId} onClose={() => setEditingNodeId(undefined)} project={project} />}
      {pendingActiveChoice && (
        <div className="preview-overlay preview-overlay--nested" role="dialog" aria-modal="true">
          <div className="choice-editor preview-resolution-dialog">
            <div className="preview-toolbar">
              <strong>Resolve Skill Check</strong>
              <div className="toolbar-actions">
                <button className="ghost-button" onClick={() => setPendingActiveChoice(undefined)} type="button">
                  Cancel
                </button>
              </div>
            </div>
            <div className="choice-editor__grid">
              <p>{pendingActiveChoice.text}</p>
              <p className="muted-copy">
                {pendingActiveChoice.resolutionCheck?.skill} vs {pendingActiveChoice.resolutionCheck?.difficulty}
              </p>
              <div className="button-row">
                <button
                  className="ghost-button danger"
                  onClick={() => {
                    applyChoice(pendingActiveChoice, 'failure');
                    setPendingActiveChoice(undefined);
                  }}
                  type="button"
                >
                  Fail
                </button>
                <button
                  className="primary-button subtle"
                  onClick={() => {
                    applyChoice(pendingActiveChoice, 'success');
                    setPendingActiveChoice(undefined);
                  }}
                  type="button"
                >
                  Succeed
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    applyChoice(pendingActiveChoice, 'critical');
                    setPendingActiveChoice(undefined);
                  }}
                  type="button"
                >
                  Critical success
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewNodeEditorDialog({ project, nodeId, onClose }: { project: DialogueProject; nodeId: string; onClose: () => void }) {
  const node = project.nodes[nodeId];
  const updateNodeText = useProjectStore((state) => state.updateNodeText);
  const updateNodePortrait = useProjectStore((state) => state.updateNodePortrait);
  const addChoice = useProjectStore((state) => state.addChoice);
  const updateChoice = useProjectStore((state) => state.updateChoice);
  const setSelection = useProjectStore((state) => state.setSelection);

  if (!node) {
    return null;
  }

  const assetIds = Object.keys(project.assets);

  return (
    <div className="preview-overlay preview-overlay--nested" role="dialog" aria-modal="true">
      <div className="choice-editor preview-node-editor">
        <div className="preview-toolbar">
          <strong>Edit Node: {node.id}</strong>
          <div className="toolbar-actions">
            <button className="ghost-button" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>
        <div className="choice-editor__grid">
          <label>
            Dialogue text
            <textarea rows={6} value={node.text} onChange={(event) => updateNodeText(node.id, event.target.value)} />
          </label>
          <div className="inline-grid">
            <label>
              Left portrait
              <select
                value={node.portraits.left === null ? '__clear__' : node.portraits.left ?? ''}
                onChange={(event) => updateNodePortrait(node.id, 'left', event.target.value === '__clear__' ? null : event.target.value)}
              >
                <option value="">Inherit previous</option>
                <option value="__clear__">Clear portrait</option>
                {assetIds.map((assetId) => (
                  <option key={assetId} value={assetId}>
                    {assetId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Right portrait
              <select
                value={node.portraits.right === null ? '__clear__' : node.portraits.right ?? ''}
                onChange={(event) => updateNodePortrait(node.id, 'right', event.target.value === '__clear__' ? null : event.target.value)}
              >
                <option value="">Inherit previous</option>
                <option value="__clear__">Clear portrait</option>
                {assetIds.map((assetId) => (
                  <option key={assetId} value={assetId}>
                    {assetId}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="preview-node-editor__choices">
            <div className="panel-header">
              <strong>Choices</strong>
              <button className="primary-button subtle" onClick={() => addChoice(node.id)} type="button">
                Add choice
              </button>
            </div>
            {node.choices.map((choice) => (
              <div className="preview-node-editor__choice" key={choice.id}>
                <input value={choice.text} onChange={(event) => updateChoice(node.id, choice.id, setChoiceText(event.target.value))} />
                <button className="ghost-button" onClick={() => setSelection({ kind: 'choice', nodeId: node.id, choiceId: choice.id })} type="button">
                  Edit details
                </button>
              </div>
            ))}
            {node.choices.length === 0 && <p className="muted-copy">This node has no choices yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
