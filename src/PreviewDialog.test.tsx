import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewDialog } from './PreviewDialog';
import { createDefaultProject } from './dialogue';

describe('PreviewDialog', () => {
  it('resolves passive visibility before showing gated choices', async () => {
    const user = userEvent.setup();
    const project = createDefaultProject();
    project.nodes.start.choices[1].visibilityCheck = {
      skill: 'perception',
      difficulty: 2
    };

    render(<PreviewDialog onClose={() => undefined} open project={project} />);

    expect(screen.queryByRole('button', { name: 'Inspect the button' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show' }));

    expect(screen.getByRole('button', { name: 'Inspect the button' })).toBeInTheDocument();
  });

  it('routes active checks to the selected outcome', async () => {
    const user = userEvent.setup();
    const project = createDefaultProject();

    render(<PreviewDialog onClose={() => undefined} open project={project} />);

    await user.click(screen.getByRole('button', { name: 'Bash the button' }));
    await user.click(screen.getByRole('button', { name: 'Critical success' }));

    expect(screen.getByText('You smash the button with brutal force. The mechanism triggers instantly.', { selector: '.preview-text' })).toBeInTheDocument();
  });
});
