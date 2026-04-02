import { readProjectFile } from './projectFiles';

describe('readProjectFile', () => {
  it('imports the game runtime format with portraits, passive checks, and conditions', async () => {
    const file = {
      name: 'game-runtime.json',
      text: async () =>
        JSON.stringify({
          start: {
            text: 'Start node',
            portraits: {
              left: null,
              right: 'player_neutral'
            },
            choices: [
              {
                text: 'Continue',
                next: 'result',
                set_flags: ['panel_open'],
                passive_check: {
                  skill: 'perception',
                  difficulty: 2
                },
                conditions: {
                  flags_all: ['panel_open'],
                  flags_not: ['alarm_triggered']
                }
              }
            ]
          },
          result: {
            text: 'Result node',
            choices: [{ text: 'End', close: true }]
          }
        })
    } as File;

    const project = await readProjectFile(file);
    const choice = project.nodes.start.choices[0];

    expect(project.startNodeId).toBe('start');
    expect(project.nodes.start.portraits.left).toBeNull();
    expect(project.nodes.start.portraits.right).toBe('player_neutral');
    expect(choice.visibilityCheck).toEqual({
      skill: 'perception',
      difficulty: 2
    });
    expect(choice.conditions).toEqual({
      flagsAll: ['panel_open'],
      flagsNot: ['alarm_triggered']
    });
    expect(choice.setFlags).toEqual(['panel_open']);
  });

  it('imports legacy passive branching runtime files without dropping their branches', async () => {
    const file = {
      name: 'legacy-runtime.json',
      text: async () =>
        JSON.stringify({
          start: {
            text: 'Start node',
            choices: [
              {
                text: 'Old passive branch',
                passive_skill_check: {
                  skill: 'perception',
                  difficulty: 3,
                  failure_node: 'fail',
                  success_node: 'success',
                  critical_node: 'critical'
                }
              }
            ]
          },
          fail: {
            text: 'Fail node',
            choices: [{ text: 'End', close: true }]
          },
          success: {
            text: 'Success node',
            choices: [{ text: 'End', close: true }]
          },
          critical: {
            text: 'Critical node',
            choices: [{ text: 'End', close: true }]
          }
        })
    } as File;

    const project = await readProjectFile(file);
    const choice = project.nodes.start.choices[0];

    expect(choice.visibilityCheck).toBeUndefined();
    expect(choice.resolutionCheck).toEqual({
      skill: 'perception',
      difficulty: 3,
      failureNodeId: 'fail',
      successNodeId: 'success',
      criticalSuccessNodeId: 'critical'
    });
  });
});
