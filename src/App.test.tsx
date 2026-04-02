import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createDefaultProject } from './dialogue';
import { AUTOSAVE_KEY } from './projectFiles';
import { useProjectStore } from './store';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.getState().resetProject();
  });

  it('adds a new node from the project panel', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add node' }));

    expect(screen.getByDisplayValue('node_001')).toBeInTheDocument();
  });

  it('opens the new choice editor after adding a choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    act(() => {
      useProjectStore.getState().setSelection({ kind: 'node', nodeId: 'start' });
    });

    await user.click(screen.getByRole('button', { name: 'New Choice' }));
    const addChoiceDialog = screen.getByText('Add Choice').closest('[role="dialog"]') as HTMLElement | null;
    expect(addChoiceDialog).not.toBeNull();
    if (!addChoiceDialog) {
      throw new Error('Add choice dialog did not open');
    }
    await user.click(within(addChoiceDialog).getByRole('button', { name: 'New Choice' }));

    const dialogs = screen.getAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1];
    expect(within(dialog).getByDisplayValue('New option')).toBeInTheDocument();
  });

  it('opens the preview overlay', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Red button invites you to press it.', { selector: '.preview-text' })).toBeInTheDocument();
  });

  it('opens a node editor from the preview rail', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(screen.getByRole('button', { name: 'Edit node start' }));

    const dialogs = screen.getAllByRole('dialog');
    const editorDialog = dialogs[dialogs.length - 1];
    const textField = within(editorDialog).getByDisplayValue('Red button invites you to press it.');

    expect(textField).toBeInTheDocument();

    await user.clear(textField);
    await user.type(textField, 'Updated preview text');

    expect(useProjectStore.getState().project.nodes.start.text).toBe('Updated preview text');
  });

  it('clears the scene back to a fresh start node', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add node' }));
    await user.click(screen.getByRole('button', { name: 'Clear scene' }));
    const clearButtons = screen.getAllByRole('button', { name: 'Clear scene' });
    await user.click(clearButtons[clearButtons.length - 1]!);

    expect(Object.keys(useProjectStore.getState().project.nodes)).toEqual(['start']);
  });

  it('opens a choice editing dialog from the node card', async () => {
    const user = userEvent.setup();
    render(<App />);

    act(() => {
      useProjectStore.getState().setSelection({ kind: 'choice', nodeId: 'start', choiceId: 'choice_inspect' });
    });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('Inspect the button')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Choice color picker')).toBeInTheDocument();

    const activeToggle = within(dialog).getByLabelText('Active check');
    await user.click(activeToggle);

    expect(within(dialog).getByLabelText('Active skill')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Choice color picker'), { target: { value: '#ff8844' } });

    expect(useProjectStore.getState().project.nodes.start.choices.find((choice) => choice.id === 'choice_inspect')?.color).toBe('#ff8844');
  });

  it('does not switch into the node card when deleting a choice from the graph node view', () => {
    act(() => {
      useProjectStore.getState().setSelection({ kind: 'scene' });
      useProjectStore.getState().removeChoice('start', 'choice_inspect');
    });

    expect(useProjectStore.getState().selection.kind).toBe('scene');
    expect(useProjectStore.getState().project.nodes.start.choices.some((choice) => choice.id === 'choice_inspect')).toBe(false);
  });

  it('creates and links a new next node directly from the choice editor', async () => {
    const user = userEvent.setup();
    render(<App />);

    act(() => {
      useProjectStore.getState().setSelection({ kind: 'choice', nodeId: 'start', choiceId: 'choice_inspect' });
    });

    const nextNodeInput = screen.getByLabelText('Next node');
    await user.clear(nextNodeInput);
    await user.type(nextNodeInput, 'fresh_branch');
    await user.click(screen.getByRole('button', { name: 'Create next node fresh_branch' }));

    const project = useProjectStore.getState().project;
    expect(project.nodes.fresh_branch).toBeDefined();
    expect(project.nodes.start.choices.find((choice) => choice.id === 'choice_inspect')?.nextNodeId).toBe('fresh_branch');
    expect(project.nodes.fresh_branch.canvas.y).toBeGreaterThan(project.nodes.start.canvas.y + 200);
    expect(useProjectStore.getState().selection).toEqual({ kind: 'choice', nodeId: 'start', choiceId: 'choice_inspect' });
  });

  it('creates and links a new skill-check outcome node directly from the choice editor', async () => {
    const user = userEvent.setup();
    render(<App />);

    act(() => {
      useProjectStore.getState().setSelection({ kind: 'choice', nodeId: 'start', choiceId: 'choice_bash' });
    });

    const failureNodeInput = screen.getByLabelText('Failure node');
    await user.clear(failureNodeInput);
    await user.type(failureNodeInput, 'bash_alt_fail');
    await user.click(screen.getByRole('button', { name: 'Create failure node bash_alt_fail' }));

    const project = useProjectStore.getState().project;
    expect(project.nodes.bash_alt_fail).toBeDefined();
    expect(project.nodes.start.choices.find((choice) => choice.id === 'choice_bash')?.resolutionCheck?.failureNodeId).toBe('bash_alt_fail');
    expect(project.nodes.bash_alt_fail.canvas.y).toBeGreaterThan(project.nodes.start.canvas.y + 200);
    expect(useProjectStore.getState().selection).toEqual({ kind: 'choice', nodeId: 'start', choiceId: 'choice_bash' });
  });

  it('reorders choices in the store and refreshes their card positions', () => {
    act(() => {
      useProjectStore.getState().reorderChoice('start', 'choice_inspect', 'choice_press');
    });

    const choices = useProjectStore.getState().project.nodes.start.choices;
    expect(choices[0]?.id).toBe('choice_inspect');
    expect(choices[1]?.id).toBe('choice_press');
    expect(choices[0]?.canvas.y).toBe(choices[1]?.canvas.y);
    expect(choices[0]?.canvas.x).toBeLessThan(choices[1]?.canvas.x);
  });

  it('reorders choices by drag and drop in the card view', async () => {
    render(<App />);

    act(() => {
      useProjectStore.getState().setSelection({ kind: 'node', nodeId: 'start' });
    });

    const sourceRow = screen.getByTestId('card-choice-choice_inspect');
    const targetRow = screen.getByTestId('card-choice-choice_press');
    const dataTransfer = {
      data: {} as Record<string, string>,
      effectAllowed: 'all',
      setData(type: string, value: string) {
        this.data[type] = value;
      },
      getData(type: string) {
        return this.data[type] ?? '';
      }
    };

    fireEvent.dragStart(sourceRow, { dataTransfer });
    fireEvent.dragOver(targetRow, { dataTransfer });
    fireEvent.drop(targetRow, { dataTransfer });
    fireEvent.dragEnd(sourceRow);

    expect(useProjectStore.getState().project.nodes.start.choices[0]?.id).toBe('choice_inspect');
  });

  it('renames the current portrait asset when editing the portrait field from the card view', async () => {
    render(<App />);

    act(() => {
      useProjectStore.getState().addAsset({
        id: 'npc_smile',
        fileName: 'npc_smile.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,QQ=='
      });
      useProjectStore.getState().updateNodePortrait('start', 'left', 'npc_smile');
      useProjectStore.getState().setSelection({ kind: 'node', nodeId: 'start' });
    });

    fireEvent.change(screen.getByLabelText('start-left-portrait'), { target: { value: 'npc_grin' } });

    const project = useProjectStore.getState().project;
    expect(project.assets.npc_smile).toBeUndefined();
    expect(project.assets.npc_grin).toBeDefined();
    expect(project.nodes.start.portraits.left).toBe('npc_grin');
  });

  it('opens the add-choice picker above the card editor and flips directly into the new choice editor', async () => {
    const user = userEvent.setup();
    render(<App />);

    act(() => {
      useProjectStore.getState().setSelection({ kind: 'node', nodeId: 'start' });
    });

    await user.click(screen.getByRole('button', { name: 'New Choice' }));
    expect(screen.getByText('Add Choice')).toBeInTheDocument();

    const addChoiceDialog = screen.getByText('Add Choice').closest('[role="dialog"]') as HTMLElement | null;
    expect(addChoiceDialog).not.toBeNull();
    if (!addChoiceDialog) {
      throw new Error('Add choice dialog did not open');
    }
    await user.click(within(addChoiceDialog).getByRole('button', { name: 'New Choice' }));

    await waitFor(() => {
      expect(useProjectStore.getState().selection.kind).toBe('choice');
    });
    expect(screen.getByText('Edit Choice: New option')).toBeInTheDocument();
    expect(screen.getByDisplayValue('New option')).toBeInTheDocument();
  });

  it('creates a linked node choice with optional skill checks', () => {
    const result = useProjectStore.getState().createChoiceWithNode('start', {
      choiceText: 'Hack terminal',
      eventName: 'Open Panel!',
      visibilityCheck: {
        skill: 'perception',
        difficulty: 2
      },
      resolutionCheck: {
        skill: 'technology',
        difficulty: 4
      },
      newNode: {
        preferredId: 'hack_terminal',
        text: 'Terminal access granted.',
        position: { x: 640, y: 320 }
      }
    });

    const project = useProjectStore.getState().project;
    const choice = project.nodes.start.choices.find((candidate) => candidate.id === result.choiceId);

    expect(result.nodeId).toBe('hack_terminal');
    expect(project.nodes.hack_terminal?.text).toBe('Terminal access granted.');
    expect(choice?.eventName).toBe('open_panel');
    expect(choice?.visibilityCheck?.skill).toBe('perception');
    expect(choice?.resolutionCheck?.skill).toBe('technology');
  });

  it('creates a default leave choice template', () => {
    useProjectStore.getState().addLeaveChoice('start');

    const project = useProjectStore.getState().project;
    const choice = project.nodes.start.choices[project.nodes.start.choices.length - 1];

    expect(choice?.text).toBe('Leave');
    expect(choice?.close).toBe(true);
    expect(choice?.eventName).toBeUndefined();
    expect(choice?.nextNodeId).toBeUndefined();
  });

  it('does not add a duplicate default leave choice', () => {
    const initialLeaveChoices = useProjectStore.getState().project.nodes.start.choices.filter((choice) => choice.text === 'Leave' && choice.close);

    useProjectStore.getState().addLeaveChoice('start');

    const nextLeaveChoices = useProjectStore.getState().project.nodes.start.choices.filter((choice) => choice.text === 'Leave' && choice.close);
    expect(nextLeaveChoices).toHaveLength(initialLeaveChoices.length);
  });

  it('applies the latest bundled sample layout when loading the autosaved sample project', async () => {
    const storedProject = createDefaultProject();
    storedProject.nodes.start.canvas = { x: 120, y: 80 };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(storedProject));

    render(<App />);

    await waitFor(() => {
      expect(useProjectStore.getState().project.nodes.start.canvas.y).toBe(-360);
    });
  });
});
