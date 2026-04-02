import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewDialog } from './PreviewDialog';
import { createDefaultProject } from './dialogue';

describe('PreviewDialog', () => {
  it('can hide passive-gated choices in preview', async () => {
    const user = userEvent.setup();
    const project = createDefaultProject();
    project.nodes.start.choices[1].visibilityCheck = {
      skill: 'perception',
      difficulty: 2
    };

    render(<PreviewDialog onClose={() => undefined} open project={project} />);

    expect(screen.getByRole('button', { name: 'Inspect the button' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Hide passive-gated choices' }));

    expect(screen.queryByRole('button', { name: 'Inspect the button' })).not.toBeInTheDocument();
  });

  it('routes active checks to the selected outcome', async () => {
    const user = userEvent.setup();
    const project = createDefaultProject();

    render(<PreviewDialog onClose={() => undefined} open project={project} />);

    await user.click(screen.getByRole('button', { name: 'Bash the button' }));
    await user.click(screen.getByRole('button', { name: 'Critical success' }));

    expect(screen.getByText('You smash the button with brutal force. The mechanism triggers instantly.', { selector: '.preview-text' })).toBeInTheDocument();
  });

  it('applies set flags to required and blocked flag checks in preview', async () => {
    const user = userEvent.setup();
    const project = createDefaultProject();
    project.nodes.start.choices[0].setFlags = ['panel_open'];
    project.nodes.start.choices[0].nextNodeId = undefined;
    project.nodes.start.choices[1].conditions = { flagsAll: ['panel_open'] };
    project.nodes.start.choices[2].conditions = { flagsNot: ['panel_open'] };

    render(<PreviewDialog onClose={() => undefined} open project={project} />);

    expect(screen.queryByRole('button', { name: 'Inspect the button' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bash the button' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Press the button/ }));

    expect(screen.getByRole('button', { name: 'Inspect the button' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bash the button' })).not.toBeInTheDocument();
    expect(screen.getByText('Set flags: panel_open')).toBeInTheDocument();
  });
});
