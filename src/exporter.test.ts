import JSZip from 'jszip';
import { compileRuntime, createDefaultProject } from './dialogue';
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

    expect(runtime.assets).toEqual({
      npc_frown: { path: 'images/npc_frown.png' }
    });
    expect(runtime.nodes.start.portraits?.left).toBe('npc_frown');
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
    expect(zip.file('images/npc_frown.png')).toBeTruthy();
    expect(zip.file('images/unused.png')).toBeFalsy();
  });

  it('inherits portraits from the incoming dialogue node when a child leaves them empty', () => {
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

    expect(runtime.nodes.inspect.portraits).toEqual({
      left: 'npc_frown',
      right: 'player_neutral'
    });
  });
});
