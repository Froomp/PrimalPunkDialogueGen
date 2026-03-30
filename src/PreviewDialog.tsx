import { useMemo, useState } from 'react';
import { resolveNodePortraits, type DialogueChoice, type DialogueNode, type DialogueProject } from './dialogue';

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

  const node = project.nodes[currentNodeId];

  const unresolvedPassiveChoices = useMemo(() => {
    if (!node) {
      return [];
    }
    return node.choices.filter((choice) => choice.visibilityCheck && passiveMode === 'ask' && passiveChoices[choice.id] === undefined);
  }, [node, passiveChoices, passiveMode]);

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
        </div>
      </div>
    </div>
  );
}
