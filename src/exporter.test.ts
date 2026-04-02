import JSZip from 'jszip';
import { compileRuntime, createDefaultProject, type DialogueProject } from './dialogue';
import { buildRuntimeZip } from './exporter';

describe('compileRuntime', () => {
  it('builds runtime nodes and only includes referenced assets', () => {
    const project = createDefaultProject();
    project.assets.npc_frown = {
      id: 'npc_frown',
      fileName: 'npc_frown.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,QQ=='
    };
    project.assets.unused = {
      id: 'unused',
      fileName: 'unused.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,QQ=='
    };
    project.nodes.start.portraits.left = 'npc_frown';

    const runtime = compileRuntime(project);

    expect(runtime.start.portraits?.left).toBe('npc_frown');
  });

  it('packages referenced images into the runtime zip', async () => {
    const project = createDefaultProject();
    project.assets.npc_frown = {
      id: 'npc_frown',
      fileName: 'npc_frown.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,QQ=='
    };
    project.nodes.start.portraits.left = 'npc_frown';

    const blob = await buildRuntimeZip(project);
    const zip = await JSZip.loadAsync(blob);

    expect(zip.file('red_button.json')).toBeTruthy();
    expect(zip.file('red_button.project.json')).toBeTruthy();
    expect(zip.file('images/npc_frown.png')).toBeTruthy();
    expect(zip.file('images/unused.png')).toBeFalsy();
  });

  it('exports only explicit portrait changes so omitted sides inherit at runtime', () => {
    const project = createDefaultProject();
    project.assets.npc_frown = {
      id: 'npc_frown',
      fileName: 'npc_frown.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,QQ=='
    };
    project.assets.player_neutral = {
      id: 'player_neutral',
      fileName: 'player_neutral.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,QQ=='
    };
    project.nodes.start.portraits.left = 'npc_frown';
    project.nodes.start.portraits.right = 'player_neutral';

    const runtime = compileRuntime(project);

    expect(runtime.start.portraits).toEqual({
      left: 'npc_frown',
      right: 'player_neutral'
    });
    expect(runtime.inspect.portraits).toBeUndefined();
  });

  it('remaps a custom start node to the required start key and exports game-only passive checks and conditions', () => {
    const project: DialogueProject = {
      version: 1 as const,
      sceneId: 'custom_start',
      startNodeId: 'entry',
      title: 'Custom Start',
      assets: {},
      nodes: {
        entry: {
          id: 'entry',
          text: 'Entry node',
          hidden: false,
          portraits: { left: null },
          canvas: { x: 0, y: 0 },
          choices: [
            {
              id: 'choice_entry',
              text: 'Look closer',
              canvas: { x: 0, y: 0 },
              nextNodeId: 'result',
              eventName: 'inspect_panel',
              setFlags: ['panel_open'],
              visibilityCheck: {
                skill: 'perception',
                difficulty: 3
              },
              conditions: {
                flagsAll: ['panel_open'],
                flagsNot: ['alarm_triggered']
              }
            }
          ]
        },
        result: {
          id: 'result',
          text: 'Result node',
          hidden: false,
          portraits: {},
          canvas: { x: 0, y: 0 },
          choices: [{ id: 'choice_end', text: 'End', canvas: { x: 0, y: 0 }, close: true }]
        }
      },
      viewport: { x: 0, y: 0, zoom: 1 }
    };

    const runtime = compileRuntime(project);

    expect(runtime.start.text).toBe(project.nodes.entry.text);
    expect(runtime.start.portraits?.left).toBeNull();
    expect(runtime.start.choices[0]).toMatchObject({
      text: 'Look closer',
      next: 'result',
      event: 'inspect_panel',
      set_flags: ['panel_open'],
      passive_check: {
        skill: 'perception',
        difficulty: 3
      },
      conditions: {
        flags_all: ['panel_open'],
        flags_not: ['alarm_triggered']
      }
    });
  });
});
