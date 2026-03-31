import { Handle, Position, type NodeProps } from '@xyflow/react';
import { choiceHandleId, skillIds, type DialogueChoice } from './dialogue';
import {
  setChoiceClose,
  setChoiceNextField,
  setChoiceResolutionEnabled,
  setChoiceResolutionField,
  setChoiceText,
  setChoiceVisibilityEnabled,
  setChoiceVisibilityField,
  useProjectStore
} from './store';

type ChoiceNodeData = {
  nodeId: string;
  choice: DialogueChoice;
};

export function ChoiceNode({ data, selected }: NodeProps) {
  const choiceData = data as ChoiceNodeData;
  const setSelection = useProjectStore((state) => state.setSelection);
  const updateChoice = useProjectStore((state) => state.updateChoice);
  const removeChoice = useProjectStore((state) => state.removeChoice);

  return (
    <article className={`dialogue-node dialogue-node--choice ${selected ? 'is-selected' : ''}`}>
      <Handle className="route-target route-target--hidden route-target--top" position={Position.Top} type="target" />

      <div className="dialogue-node__header">
        <button
          className="link-button nodrag nopan"
          onClick={() => setSelection({ kind: 'choice', nodeId: choiceData.nodeId, choiceId: choiceData.choice.id })}
          type="button"
        >
          {choiceData.choice.id}
        </button>
        <button className="ghost-button danger nodrag nopan" onClick={() => removeChoice(choiceData.nodeId, choiceData.choice.id)} type="button">
          Remove
        </button>
      </div>

      <label className="node-field">
        <span className="node-field__label">Choice text</span>
        <textarea
          className="nodrag nopan choice-item__textarea"
          rows={3}
          value={choiceData.choice.text}
          onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceText(event.target.value))}
          onFocus={() => setSelection({ kind: 'choice', nodeId: choiceData.nodeId, choiceId: choiceData.choice.id })}
        />
      </label>

      <div className="choice-item__toggles">
        <label className="choice-toggle">
          <input
            className="nodrag nopan"
            checked={Boolean(choiceData.choice.visibilityCheck)}
            type="checkbox"
            onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceVisibilityEnabled(event.target.checked))}
          />
          Passive
        </label>
        <label className="choice-toggle">
          <input
            className="nodrag nopan"
            checked={Boolean(choiceData.choice.resolutionCheck)}
            type="checkbox"
            onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceResolutionEnabled(event.target.checked))}
          />
          Active
        </label>
        <label className="choice-toggle">
          <input
            className="nodrag nopan"
            checked={Boolean(choiceData.choice.close)}
            type="checkbox"
            onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceClose(event.target.checked))}
          />
          Close
        </label>
      </div>

      {!choiceData.choice.resolutionCheck && (
        <label className="node-field">
          <span className="node-field__label">Next node</span>
          <input
            className="nodrag nopan"
            placeholder="target node id"
            value={choiceData.choice.nextNodeId ?? ''}
            onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceNextField('nextNodeId', event.target.value))}
          />
        </label>
      )}

      <label className="node-field">
        <span className="node-field__label">Event name</span>
        <input
          className="nodrag nopan"
          placeholder="press_button"
          value={choiceData.choice.eventName ?? ''}
          onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceNextField('eventName', event.target.value))}
        />
      </label>

      {choiceData.choice.visibilityCheck && (
        <div className="choice-skill-grid">
          <label className="node-field">
            <span className="node-field__label">Passive skill</span>
            <select
              className="nodrag nopan"
              value={choiceData.choice.visibilityCheck.skill}
              onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceVisibilityField('skill', event.target.value))}
            >
              {skillIds.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </label>
          <label className="node-field">
            <span className="node-field__label">Difficulty</span>
            <input
              className="nodrag nopan"
              min={1}
              type="number"
              value={choiceData.choice.visibilityCheck.difficulty}
              onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceVisibilityField('difficulty', Number(event.target.value)))}
            />
          </label>
        </div>
      )}

      {choiceData.choice.resolutionCheck && (
        <>
          <div className="choice-skill-grid">
            <label className="node-field">
              <span className="node-field__label">Active skill</span>
              <select
                className="nodrag nopan"
                value={choiceData.choice.resolutionCheck.skill}
                onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceResolutionField('skill', event.target.value))}
              >
                {skillIds.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
            </label>
            <label className="node-field">
              <span className="node-field__label">Difficulty</span>
              <input
                className="nodrag nopan"
                min={1}
                type="number"
                value={choiceData.choice.resolutionCheck.difficulty}
                onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceResolutionField('difficulty', Number(event.target.value)))}
              />
            </label>
          </div>

          <div className="choice-skill-grid choice-skill-grid--routes">
            <label className="node-field">
              <span className="node-field__label">Fail node</span>
              <input
                className="nodrag nopan"
                placeholder="bash_fail"
                value={choiceData.choice.resolutionCheck.failureNodeId ?? ''}
                onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceResolutionField('failureNodeId', event.target.value))}
              />
            </label>
            <label className="node-field">
              <span className="node-field__label">Success node</span>
              <input
                className="nodrag nopan"
                placeholder="bash_success"
                value={choiceData.choice.resolutionCheck.successNodeId ?? ''}
                onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceResolutionField('successNodeId', event.target.value))}
              />
            </label>
            <label className="node-field">
              <span className="node-field__label">Critical node</span>
              <input
                className="nodrag nopan"
                placeholder="fallback to success"
                value={choiceData.choice.resolutionCheck.criticalSuccessNodeId ?? ''}
                onChange={(event) => updateChoice(choiceData.nodeId, choiceData.choice.id, setChoiceResolutionField('criticalSuccessNodeId', event.target.value))}
              />
            </label>
          </div>
        </>
      )}

      <Handle className="route-handle route-handle--next route-handle--bottom" id={choiceHandleId(choiceData.choice.id, 'next')} position={Position.Bottom} type="source" />
      {choiceData.choice.resolutionCheck && (
        <>
          <Handle className="route-handle route-handle--failure route-handle--bottom-left" id={choiceHandleId(choiceData.choice.id, 'failure')} position={Position.Bottom} type="source" />
          <Handle className="route-handle route-handle--success route-handle--bottom-center" id={choiceHandleId(choiceData.choice.id, 'success')} position={Position.Bottom} type="source" />
          <Handle className="route-handle route-handle--critical route-handle--bottom-right" id={choiceHandleId(choiceData.choice.id, 'critical')} position={Position.Bottom} type="source" />
        </>
      )}
    </article>
  );
}
