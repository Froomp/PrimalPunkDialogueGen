import {
  collectCascadeDeleteNodeIds,
  createDefaultProject,
  deleteNodesFromProject,
  deriveSkillGroupLayouts,
  deriveEdges,
  getChoiceFocusScope,
  getRouteAnchorSide,
  getRouteHandleDirections,
  shouldProceedWithRouteConnection,
  getTerminalNodePosition,
  terminalCanvasId,
  type DialogueProject
} from './dialogue';
import { vi } from 'vitest';

function createProject(): DialogueProject {
  return {
    version: 1,
    sceneId: 'routing_test',
    startNodeId: 'parent',
    assets: {},
    nodes: {
      parent: {
        id: 'parent',
        text: 'Parent',
        portraits: {},
        canvas: { x: 0, y: 0 },
        choices: [
          { id: 'to_right', text: 'Right', canvas: { x: 0, y: 0 }, nextNodeId: 'right' },
          { id: 'to_up', text: 'Up', canvas: { x: 0, y: 0 }, nextNodeId: 'up' },
          { id: 'end', text: 'End', canvas: { x: 0, y: 0 }, close: true }
        ]
      },
      right: {
        id: 'right',
        text: 'Right target',
        portraits: {},
        canvas: { x: 720, y: 0 },
        choices: []
      },
      up: {
        id: 'up',
        text: 'Upper target',
        portraits: {},
        canvas: { x: 0, y: -520 },
        choices: []
      }
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };
}

describe('dialogue routing', () => {
  it('chooses the nearest outward side for edge anchors', () => {
    expect(getRouteAnchorSide({ x: 0, y: 0 }, { x: 0, y: 400 })).toBe('bottom');
    expect(getRouteAnchorSide({ x: 0, y: 0 }, { x: 0, y: -400 })).toBe('top');
    expect(getRouteAnchorSide({ x: 0, y: 0 }, { x: 500, y: 100 })).toBe('right');
    expect(getRouteAnchorSide({ x: 0, y: 0 }, { x: -500, y: 100 })).toBe('left');
  });

  it('recomputes source handle sides from current node positions', () => {
    const project = createProject();
    const initialDirections = getRouteHandleDirections(project, getTerminalNodePosition(project));

    expect(initialDirections.parent['choice:to_right:next']).toBe('right');
    expect(initialDirections.parent['choice:to_up:next']).toBe('top');
    expect(initialDirections.parent['choice:end:close']).toBe('bottom');

    project.nodes.right.canvas = { x: 0, y: 640 };

    const movedDirections = getRouteHandleDirections(project, getTerminalNodePosition(project));

    expect(movedDirections.parent['choice:to_right:next']).toBe('bottom');
  });

  it('routes every close edge into the shared terminal node', () => {
    const project = createDefaultProject();
    const closeEdges = deriveEdges(project).filter((edge) => edge.id.endsWith(':close'));

    expect(closeEdges.length).toBeGreaterThan(1);
    expect(new Set(closeEdges.map((edge) => edge.target))).toEqual(new Set([terminalCanvasId()]));
    closeEdges.forEach((edge) => {
      expect(edge.targetHandle).toMatch(/^target:/);
    });
  });

  it('defaults the shared terminal node below the graph', () => {
    const project = createProject();
    const terminalPosition = getTerminalNodePosition(project);

    expect(terminalPosition).toBeDefined();
    expect(terminalPosition?.y).toBeGreaterThan(project.nodes.right.canvas.y);
    expect(terminalPosition?.y).toBeGreaterThan(project.nodes.up.canvas.y);
  });

  it('can cascade delete descendants that are only reachable from the removed branch', () => {
    const project = createProject();
    project.nodes.parent.choices = [{ id: 'to_right', text: 'Right', canvas: { x: 0, y: 0 }, nextNodeId: 'right' }];
    project.nodes.right.choices = [{ id: 'to_leaf', text: 'Leaf', canvas: { x: 0, y: 0 }, nextNodeId: 'up' }];

    const cascadeIds = collectCascadeDeleteNodeIds(project, 'parent');
    const nextProject = deleteNodesFromProject(project, cascadeIds);

    expect(cascadeIds).toEqual(new Set(['parent', 'right', 'up']));
    expect(nextProject.nodes.parent).toBeUndefined();
    expect(nextProject.nodes.right).toBeUndefined();
    expect(nextProject.nodes.up).toBeUndefined();
  });

  it('builds a focus scope from a selected choice through its descendants', () => {
    const project = createProject();
    project.nodes.right.choices = [{ id: 'right_end', text: 'End', canvas: { x: 0, y: 0 }, close: true }];

    const scope = getChoiceFocusScope(project, 'parent', 'to_right');

    expect(scope.nodeIds).toEqual(new Set(['parent', 'right']));
    expect(scope.includeTerminal).toBe(true);
  });

  it('draws a single active skill-check edge to the grouped outcome panel', () => {
    const project = createDefaultProject();
    const resolutionEdges = deriveEdges(project).filter((edge) => edge.data?.choiceId === 'choice_bash');

    expect(resolutionEdges).toHaveLength(1);
    expect(resolutionEdges[0]?.animated).toBe(true);
    expect(resolutionEdges[0]?.target).toBe('skill-group:start:choice_bash');
  });

  it('derives a visual skill group around active-check outcome cards', () => {
    const project = createDefaultProject();
    const groups = deriveSkillGroupLayouts(project);
    const bashGroup = groups.find((group) => group.choiceId === 'choice_bash');

    expect(bashGroup).toBeDefined();
    expect(bashGroup?.nodeIds).toEqual(['bash_fail', 'bash_success', 'bash_critical']);
    expect(bashGroup?.width).toBeGreaterThan(0);
    expect(bashGroup?.height).toBeGreaterThan(0);
  });

  it('ships the sample scene with a more open starter layout', () => {
    const project = createDefaultProject();
    const terminalPosition = getTerminalNodePosition(project);

    expect(project.nodes.start.canvas.y).toBe(-360);
    expect(project.nodes.bash_fail.canvas.x).toBeGreaterThan(project.nodes.inspect.canvas.x + 400);
    expect(project.nodes.bash_critical.canvas.x).toBeGreaterThan(project.nodes.bash_success.canvas.x);
    expect(terminalPosition?.y).toBeGreaterThan(project.nodes.bash_critical.canvas.y + 600);
  });

  it('prompts before replacing an existing route target', () => {
    const project = createProject();
    const confirmReplacement = vi.fn(() => true);

    const result = shouldProceedWithRouteConnection(project.nodes.parent.choices[0], 'next', 'up', confirmReplacement);

    expect(result).toBe(true);
    expect(confirmReplacement).toHaveBeenCalledWith('"Right" already has a next connection to "right". Replace it with "up"?');
  });

  it('skips prompting when reconnecting to the same target or connecting an empty branch', () => {
    const project = createProject();
    const confirmReplacement = vi.fn();

    expect(shouldProceedWithRouteConnection(project.nodes.parent.choices[0], 'next', 'right', confirmReplacement)).toBe(false);
    expect(shouldProceedWithRouteConnection(project.nodes.parent.choices[2], 'next', 'up', confirmReplacement)).toBe(true);
    expect(confirmReplacement).not.toHaveBeenCalled();
  });
});
