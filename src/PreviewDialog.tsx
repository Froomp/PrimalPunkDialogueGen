import { useEffect, useMemo, useState } from 'react';
import { resolveNodePortraits, type DialogueChoice, type DialogueNode, type DialogueProject } from './dialogue';
import { setChoiceText, useProjectStore } from './store';

type PreviewDialogProps = {
  open: boolean;
  project: DialogueProject;
  onClose: () => void;
};

type PassiveMode = 'ask' | 'pass-all' | 'fail-all';
type ActiveResult = 'failure' | 'success' | 'critical';

export function PreviewDialog({ open, project, onClose }: PreviewDialogProps) {
  const [currentNodeId, setCurrentNodeId] = useState(project.startNodeId);
  const [passiveMode, setPassiveMode] = useState<PassiveMode>('ask');
  const [passiveChoices, setPassiveChoices] = useState<Record<string, boolean>>({});
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [editingNodeId, setEditingNodeId] = useState<string | undefined>(undefined);

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

  const unresolvedPassiveChoices = useMemo(() => {
    if (!node) {
      return [];
    }
    return node.choices.filter((choice) => choice.visibilityCheck && passiveMode === 'ask' && passiveChoices[choice.id] === undefined);
  }, [node, passiveChoices, passiveMode]);

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
    setPassiveChoices({});
    setEventLog([]);
  }

  function isPassiveChoiceVisible(choice: DialogueChoice): boolean {
    if (!choice.visibilityCheck) {
      return true;
    }
    if (passiveMode === 'pass-all') {
      return true;
    }
    if (passiveMode === 'fail-all') {
      return false;
    }
    return passiveChoices[choice.id] === true;
  }

  function executeChoice(choice: DialogueChoice) {
    if (choice.eventName) {
      setEventLog((log) => [...log, `Event: ${choice.eventName}`]);
    }

    if (choice.resolutionCheck) {
      const result = window.prompt('Resolve skill check: failure, success, or critical', 'success') as ActiveResult | null;
      if (!result) {
        return;
      }

      const routes: Record<ActiveResult, string | undefined> = {
        failure: choice.resolutionCheck.failureNodeId,
        success: choice.resolutionCheck.successNodeId,
        critical: choice.resolutionCheck.criticalSuccessNodeId ?? choice.resolutionCheck.successNodeId
      };

      const nextNodeId = routes[result];
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

  const currentNode: DialogueNode | undefined = node;
  const visibleChoices = currentNode?.choices.filter(isPassiveChoiceVisible) ?? [];
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
              Passive checks
              <select value={passiveMode} onChange={(event) => setPassiveMode(event.target.value as PassiveMode)}>
                <option value="ask">Ask per choice</option>
                <option value="pass-all">Pass all</option>
                <option value="fail-all">Fail all</option>
              </select>
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
          <div className="preview-portrait">
            {leftAsset ? <img alt={effectivePortraits.left} src={leftAsset.dataUrl} /> : <span>Left portrait empty</span>}
          </div>
          <div className="preview-dialogue">
            <div className="preview-text">{currentNode?.text || 'Missing start node.'}</div>
            {unresolvedPassiveChoices.length > 0 && (
              <div className="preview-resolution">
                <strong>Resolve passive visibility</strong>
                {unresolvedPassiveChoices.map((choice) => (
                  <div className="preview-resolution__row" key={choice.id}>
                    <span>{choice.text}</span>
                    <div className="toolbar-actions">
                      <button className="mini-button" onClick={() => setPassiveChoices((state) => ({ ...state, [choice.id]: true }))} type="button">
                        Show
                      </button>
                      <button className="mini-button" onClick={() => setPassiveChoices((state) => ({ ...state, [choice.id]: false }))} type="button">
                        Hide
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="preview-choices">
              {visibleChoices.map((choice) => (
                <button className="preview-choice" key={choice.id} onClick={() => executeChoice(choice)} style={{ borderColor: choice.color, boxShadow: `inset 3px 0 0 ${choice.color}` }} type="button">
                  {choice.text}
                </button>
              ))}
            </div>

            <div className="preview-log">
              {eventLog.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
          <div className="preview-portrait">
            {rightAsset ? <img alt={effectivePortraits.right} src={rightAsset.dataUrl} /> : <span>Right portrait empty</span>}
          </div>
          <div className="preview-card-rail">
            <div className="preview-card-rail__title">Cards</div>
            <div className="preview-card-rail__list">
              {previewNodes.map((previewNode) => (
                <button
                  aria-label={`Edit card ${previewNode.id}`}
                  className={`preview-card-chip ${previewNode.id === currentNodeId ? 'is-active' : ''}`}
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
          <strong>Edit Card: {node.id}</strong>
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
              <select value={node.portraits.left ?? ''} onChange={(event) => updateNodePortrait(node.id, 'left', event.target.value)}>
                <option value="">Inherit previous</option>
                {assetIds.map((assetId) => (
                  <option key={assetId} value={assetId}>
                    {assetId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Right portrait
              <select value={node.portraits.right ?? ''} onChange={(event) => updateNodePortrait(node.id, 'right', event.target.value)}>
                <option value="">Inherit previous</option>
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
            {node.choices.length === 0 && <p className="muted-copy">This card has no choices yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
