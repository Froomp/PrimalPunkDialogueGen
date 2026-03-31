import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { App } from './App';
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

    await user.click(screen.getByRole('button', { name: 'Add choice' }));

    const dialog = screen.getByRole('dialog');
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

  it('opens a card editor from the preview rail', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(screen.getByRole('button', { name: 'Edit card start' }));

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
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add node' }));
    await user.click(screen.getByRole('button', { name: 'Clear scene' }));

    expect(Object.keys(useProjectStore.getState().project.nodes)).toEqual(['start']);
    confirmSpy.mockRestore();
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
});
