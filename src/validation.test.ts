import { createDefaultProject } from './dialogue';
import { validateProject } from './validation';

describe('validateProject', () => {
  it('reports broken routes and unreachable nodes', () => {
    const project = createDefaultProject();
    project.nodes.start.choices[0].nextNodeId = 'missing_node';
    project.nodes.orphan = {
      id: 'orphan',
      text: 'Unused',
      portraits: {},
      canvas: { x: 0, y: 0 },
      choices: []
    };

    const issues = validateProject(project);

    expect(issues.some((issue) => issue.code === 'broken-next-target')).toBe(true);
    expect(issues.some((issue) => issue.code === 'unreachable-node' && issue.nodeId === 'orphan')).toBe(true);
  });

  it('warns when critical outcomes fall back to success', () => {
    const project = createDefaultProject();
    project.nodes.start.choices[2].resolutionCheck!.criticalSuccessNodeId = undefined;

    const issues = validateProject(project);

    expect(issues.some((issue) => issue.code === 'critical-falls-back')).toBe(true);
  });
});
