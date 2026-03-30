import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('opens the preview overlay', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Red button invites you to press it.')).toBeInTheDocument();
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
