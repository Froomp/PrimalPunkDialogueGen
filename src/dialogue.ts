import { z } from 'zod';
import type { Edge } from '@xyflow/react';

export const skillIds = [
  'strength',
  'dexterity',
  'perception',
  'intelligence',
  'empathy',
  'persuasion',
  'stealth',
  'technology'
] as const;

export type SkillId = (typeof skillIds)[number];
export const skillColors: Record<SkillId, string> = {
  strength: '#e97a37',
  dexterity: '#56a8ff',
  perception: '#f0c24b',
  intelligence: '#4fc3c7',
  empathy: '#d84db6',
  persuasion: '#9b6bff',
  stealth: '#2ca58d',
  technology: '#7aa6ff'
};
export type RouteBranch = 'next' | 'failure' | 'success' | 'critical';
export type DisplayBranch = RouteBranch | 'close';
export type HandleSide = 'top' | 'right' | 'bottom' | 'left';

export type AssetEntry = {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
};

export type PassiveSkillCheck = {
  skill: SkillId;
  difficulty: number;
};

export type ActiveSkillCheck = {
  skill: SkillId;
  difficulty: number;
  failureNodeId?: string;
  successNodeId?: string;
  criticalSuccessNodeId?: string;
};

export type DialogueChoice = {
  id: string;
  text: string;
  color?: string;
  canvas: {
    x: number;
    y: number;
  };
  nextNodeId?: string;
  close?: boolean;
  eventName?: string;
  visibilityCheck?: PassiveSkillCheck;
  resolutionCheck?: ActiveSkillCheck;
};

export type DialogueNode = {
  id: string;
  text: string;
  hidden?: boolean;
  portraits: {
    left?: string;
    right?: string;
  };
  choices: DialogueChoice[];
  canvas: {
    x: number;
    y: number;
  };
};

export type DialogueProject = {
  version: 1;
  sceneId: string;
  title?: string;
  startNodeId: string;
  assets: Record<string, AssetEntry>;
  nodes: Record<string, DialogueNode>;
  terminal?: {
    x: number;
    y: number;
  };
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
};

export type RuntimeChoice = {
  text: string;
  next?: string;
  close?: boolean;
  event?: string;
  visibility_check?: {
    skill: SkillId;
    difficulty: number;
  };
  skill_check?: {
    skill: SkillId;
    difficulty: number;
    failure_node?: string;
    success_node?: string;
    critical_node?: string;
  };
};

export type RuntimeNode = {
  text: string;
  portraits?: {
    left?: string;
    right?: string;
  };
  choices: RuntimeChoice[];
};

export type RuntimeDialogue = {
  version: 1;
  scene_id: string;
  start_node: string;
  assets: Record<string, { path: string }>;
  nodes: Record<string, RuntimeNode>;
};

const skillSchema = z.enum(skillIds);
const passiveSkillSchema = z.object({
  skill: skillSchema,
  difficulty: z.number().int().min(1)
});
const activeSkillSchema = z.object({
  skill: skillSchema,
  difficulty: z.number().int().min(1),
  failureNodeId: z.string().optional(),
  successNodeId: z.string().optional(),
  criticalSuccessNodeId: z.string().optional()
});

export const choiceSchema: z.ZodType<DialogueChoice> = z.object({
  id: z.string().min(1),
  text: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  canvas: z.object({
    x: z.number(),
    y: z.number()
  }),
  nextNodeId: z.string().optional(),
  close: z.boolean().optional(),
  eventName: z.string().optional(),
  visibilityCheck: passiveSkillSchema.optional(),
  resolutionCheck: activeSkillSchema.optional()
});

export const nodeSchema: z.ZodType<DialogueNode> = z.object({
  id: z.string().min(1),
  text: z.string(),
  hidden: z.boolean().optional(),
  portraits: z.object({
    left: z.string().optional(),
    right: z.string().optional()
  }),
  choices: z.array(choiceSchema),
  canvas: z.object({
    x: z.number(),
    y: z.number()
  })
});

export const projectSchema: z.ZodType<DialogueProject> = z.object({
  version: z.literal(1),
  sceneId: z.string().min(1),
  title: z.string().optional(),
  startNodeId: z.string().min(1),
  assets: z.record(
    z.object({
      id: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      dataUrl: z.string().min(1)
    })
  ),
  nodes: z.record(nodeSchema),
  terminal: z
    .object({
      x: z.number(),
      y: z.number()
    })
    .optional(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number()
  })
});

const idCounters = new Map<string, number>();

export const choiceColorPalette = ['#9b6bff', '#d84db6', '#21b59b', '#e97a37', '#56a8ff', '#c55353', '#c08cff', '#58c771'] as const;
export const NODE_WIDTH = 360;
export const NODE_HEIGHT = 176;
export const LEVEL_VERTICAL_SPACING = 460;
export const SIBLING_HORIZONTAL_SPACING = 560;
const SHARED_TERMINAL_NODE_ID = 'terminal:end';

export function makeId(prefix: string): string {
  const current = idCounters.get(prefix) ?? 0;
  const next = current + 1;
  idCounters.set(prefix, next);
  return `${prefix}_${String(next).padStart(3, '0')}`;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'asset'
  );
}

export function createUniqueNodeId(project: DialogueProject, preferredId?: string): string {
  const baseId = slugify(preferredId?.trim() || 'node');

  if (!project.nodes[baseId]) {
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}_${suffix}`;
  while (project.nodes[candidate]) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }

  return candidate;
}

export function normalizeChoiceColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return undefined;
  }

  return trimmed.toLowerCase();
}

export function pickChoiceColor(usedColors: string[]): string {
  const taken = new Set(usedColors.map((color) => color.toLowerCase()));
  const available = choiceColorPalette.find((color) => !taken.has(color.toLowerCase()));

  if (available) {
    return available;
  }

  const hue = (usedColors.length * 41) % 360;
  const saturation = 60;
  const lightness = 58;
  const hslToHex = (h: number, s: number, l: number): string => {
    const saturationFraction = s / 100;
    const lightnessFraction = l / 100;
    const chroma = (1 - Math.abs(2 * lightnessFraction - 1)) * saturationFraction;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const match = lightnessFraction - chroma / 2;

    let red = 0;
    let green = 0;
    let blue = 0;

    if (h < 60) {
      red = chroma;
      green = x;
    } else if (h < 120) {
      red = x;
      green = chroma;
    } else if (h < 180) {
      green = chroma;
      blue = x;
    } else if (h < 240) {
      green = x;
      blue = chroma;
    } else if (h < 300) {
      red = x;
      blue = chroma;
    } else {
      red = chroma;
      blue = x;
    }

    const toHex = (channel: number) => Math.round((channel + match) * 255).toString(16).padStart(2, '0');
    return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  };

  return hslToHex(hue, saturation, lightness);
}

export function createChoice(text = 'New option', position?: { x: number; y: number }, color?: string): DialogueChoice {
  return {
    id: makeId('choice'),
    text,
    color,
    canvas: position ?? { x: 120, y: 260 }
  };
}

export function terminalCanvasId(): string {
  return SHARED_TERMINAL_NODE_ID;
}

export function getSkillColor(skill: SkillId): string {
  return skillColors[skill];
}

export function createNode(position?: { x: number; y: number }, id?: string): DialogueNode {
  return {
    id: id ?? makeId('node'),
    text: 'New dialogue node.',
    hidden: false,
    portraits: {},
    choices: [],
    canvas: position ?? { x: 120, y: 120 }
  };
}

export function getChoiceCanvasPosition(parent: { x: number; y: number }, index: number, total: number): { x: number; y: number } {
  const spacing = 280;
  const startX = parent.x - ((Math.max(total, 1) - 1) * spacing) / 2;
  return {
    x: startX + index * spacing,
    y: parent.y + 230
  };
}

export function getBranchCanvasPosition(parent: { x: number; y: number }, branch: RouteBranch): { x: number; y: number } {
  const offsets: Record<RouteBranch, { x: number; y: number }> = {
    next: { x: 0, y: 250 },
    failure: { x: -240, y: 260 },
    success: { x: 0, y: 260 },
    critical: { x: 240, y: 260 }
  };

  return {
    x: parent.x + offsets[branch].x,
    y: parent.y + offsets[branch].y
  };
}

export function getSpawnedNodePosition(project: DialogueProject, sourceNodeId: string, choiceId: string, branch: RouteBranch): { x: number; y: number } {
  const sourceNode = project.nodes[sourceNodeId];
  if (!sourceNode) {
    return { x: 120, y: 120 };
  }

  const choiceIndex = sourceNode.choices.findIndex((choice) => choice.id === choiceId);
  const centeredIndex = choiceIndex - (sourceNode.choices.length - 1) / 2;
  const directSpacing = SIBLING_HORIZONTAL_SPACING;
  const branchOffsets: Record<RouteBranch, { x: number; y: number }> = {
    next: { x: centeredIndex * directSpacing, y: LEVEL_VERTICAL_SPACING },
    failure: { x: centeredIndex * directSpacing - 240, y: LEVEL_VERTICAL_SPACING + 260 },
    success: { x: centeredIndex * directSpacing, y: LEVEL_VERTICAL_SPACING + 260 },
    critical: { x: centeredIndex * directSpacing + 240, y: LEVEL_VERTICAL_SPACING + 260 }
  };

  const occupiedPositions = new Set(Object.values(project.nodes).map((node) => `${Math.round(node.canvas.x / 20)}:${Math.round(node.canvas.y / 20)}`));
  const base = {
    x: sourceNode.canvas.x + branchOffsets[branch].x,
    y: sourceNode.canvas.y + branchOffsets[branch].y
  };

  let candidate = { ...base };
  let attempts = 0;
  while (occupiedPositions.has(`${Math.round(candidate.x / 20)}:${Math.round(candidate.y / 20)}`) && attempts < 8) {
    attempts += 1;
    candidate = {
      x: base.x + attempts * 220,
      y: base.y
    };
  }

  return candidate;
}

function buildChildrenMap(project: DialogueProject): Map<string, string[]> {
  const children = new Map<string, Set<string>>();

  Object.values(project.nodes).forEach((node) => {
    children.set(node.id, children.get(node.id) ?? new Set<string>());

    node.choices.forEach((choice) => {
      const targets = [choice.nextNodeId, choice.resolutionCheck?.failureNodeId, choice.resolutionCheck?.successNodeId, choice.resolutionCheck?.criticalSuccessNodeId].filter(
        (target): target is string => Boolean(target && project.nodes[target])
      );

      targets.forEach((target) => {
        const nodeChildren = children.get(node.id) ?? new Set<string>();
        nodeChildren.add(target);
        children.set(node.id, nodeChildren);
      });
    });
  });

  return new Map([...children.entries()].map(([nodeId, targetIds]) => [nodeId, [...targetIds]]));
}

function computeNodeDepths(project: DialogueProject): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: Array<{ nodeId: string; depth: number }> = project.nodes[project.startNodeId] ? [{ nodeId: project.startNodeId, depth: 0 }] : [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const knownDepth = depths.get(current.nodeId);
    if (knownDepth !== undefined && knownDepth <= current.depth) {
      continue;
    }
    depths.set(current.nodeId, current.depth);

    const node = project.nodes[current.nodeId];
    node?.choices.forEach((choice) => {
      [choice.nextNodeId, choice.resolutionCheck?.failureNodeId, choice.resolutionCheck?.successNodeId, choice.resolutionCheck?.criticalSuccessNodeId].forEach((targetId) => {
        if (targetId && project.nodes[targetId]) {
          queue.push({ nodeId: targetId, depth: current.depth + 1 });
        }
      });
    });
  }

  return depths;
}

export function autoLayoutProject(project: DialogueProject): DialogueProject {
  const nextProject = deepClone(project);
  const depths = computeNodeDepths(nextProject);
  const children = buildChildrenMap(nextProject);
  const orderedNodes = Object.keys(nextProject.nodes).sort((left, right) => (depths.get(left) ?? Number.MAX_SAFE_INTEGER) - (depths.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right));
  const leafSpacing = SIBLING_HORIZONTAL_SPACING;
  const xPositions = new Map<string, number>();
  let leafCursor = 0;

  const placeNode = (nodeId: string, trail = new Set<string>()): number => {
    if (xPositions.has(nodeId)) {
      return xPositions.get(nodeId)!;
    }

    if (trail.has(nodeId)) {
      const fallback = leafCursor * leafSpacing;
      leafCursor += 1;
      xPositions.set(nodeId, fallback);
      return fallback;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(nodeId);
    const childIds = (children.get(nodeId) ?? []).filter((childId) => depths.get(childId) === (depths.get(nodeId) ?? 0) + 1);

    if (childIds.length === 0) {
      const leafX = leafCursor * leafSpacing;
      leafCursor += 1;
      xPositions.set(nodeId, leafX);
      return leafX;
    }

    const childXs = childIds.map((childId) => placeNode(childId, nextTrail));
    const averaged = childXs.reduce((sum, value) => sum + value, 0) / childXs.length;
    xPositions.set(nodeId, averaged);
    return averaged;
  };

  orderedNodes.forEach((nodeId) => placeNode(nodeId));

  const minX = Math.min(...[...xPositions.values(), 0]);
  const centerOffset = 120 - minX;

  Object.values(nextProject.nodes).forEach((node) => {
    const depth = depths.get(node.id);
    if (depth === undefined) {
      return;
    }

    node.canvas = {
      x: Math.round((xPositions.get(node.id) ?? 0) + centerOffset),
      y: 80 + depth * LEVEL_VERTICAL_SPACING
    };
  });

  return nextProject;
}

export function shouldAutoLayout(project: DialogueProject): boolean {
  const nodes = Object.values(project.nodes);
  if (nodes.length < 2) {
    return false;
  }

  let overlapCount = 0;
  let crampedRouteCount = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < nodes.length; compareIndex += 1) {
      const deltaX = Math.abs(nodes[index].canvas.x - nodes[compareIndex].canvas.x);
      const deltaY = Math.abs(nodes[index].canvas.y - nodes[compareIndex].canvas.y);
      if (deltaX < NODE_WIDTH * 0.7 && deltaY < NODE_HEIGHT * 0.9) {
        overlapCount += 1;
      }
    }
  }

  Object.values(project.nodes).forEach((node) => {
    node.choices.forEach((choice) => {
      [choice.nextNodeId, choice.resolutionCheck?.failureNodeId, choice.resolutionCheck?.successNodeId, choice.resolutionCheck?.criticalSuccessNodeId].forEach((targetId) => {
        if (!targetId || !project.nodes[targetId]) {
          return;
        }

        const target = project.nodes[targetId];
        const deltaX = Math.abs(node.canvas.x - target.canvas.x);
        const deltaY = Math.abs(node.canvas.y - target.canvas.y);

        if (deltaY < LEVEL_VERTICAL_SPACING * 0.7 || deltaX < SIBLING_HORIZONTAL_SPACING * 0.45) {
          crampedRouteCount += 1;
        }
      });
    });
  });

  return overlapCount >= Math.max(1, Math.floor(nodes.length / 3)) || crampedRouteCount >= Math.max(1, Math.floor(nodes.length / 4));
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function normalizeProject(project: DialogueProject): DialogueProject {
  const nextProject = deepClone(project);

  Object.values(nextProject.nodes).forEach((node) => {
    const usedColors: string[] = [];

    node.choices = node.choices.map((choice) => {
      const normalizedColor = normalizeChoiceColor(choice.color);
      const nextColor = normalizedColor ?? pickChoiceColor(usedColors);
      usedColors.push(nextColor);

      return {
        ...choice,
        color: nextColor
      };
    });

    node.hidden = Boolean(node.hidden);
  });

  const positionedProject = shouldAutoLayout(nextProject) ? autoLayoutProject(nextProject) : nextProject;
  return ensureTerminalPosition(positionedProject);
}

export function createDefaultProject(): DialogueProject {
  const start: DialogueNode = {
    id: 'start',
    text: 'Red button invites you to press it.',
    portraits: {},
    canvas: { x: 80, y: 80 },
    choices: [
      {
        id: 'choice_press',
        text: 'Press the button',
        canvas: { x: -180, y: 300 },
        eventName: 'press_button',
        nextNodeId: 'pressed'
      },
      {
        id: 'choice_inspect',
        text: 'Inspect the button',
        canvas: { x: 80, y: 300 },
        nextNodeId: 'inspect'
      },
      {
        id: 'choice_bash',
        text: 'Bash the button',
        canvas: { x: 340, y: 300 },
        resolutionCheck: {
          skill: 'strength',
          difficulty: 2,
          failureNodeId: 'bash_fail',
          successNodeId: 'bash_success',
          criticalSuccessNodeId: 'bash_critical'
        }
      },
      {
        id: 'choice_leave',
        text: 'Leave',
        canvas: { x: 600, y: 300 },
        close: true
      }
    ]
  };

  return normalizeProject({
    version: 1,
    sceneId: 'red_button',
    title: 'Red Button',
    startNodeId: 'start',
    assets: {},
    nodes: {
      start,
      pressed: {
        id: 'pressed',
        text: 'You press the button. A distant mechanism clicks.',
        portraits: {},
        canvas: { x: -180, y: 560 },
        choices: [{ id: 'choice_continue_press', text: 'Continue', canvas: { x: -180, y: 800 }, close: true }]
      },
      inspect: {
        id: 'inspect',
        text: 'It looks worn. Many have pressed it before.',
        portraits: {},
        canvas: { x: 80, y: 560 },
        choices: [
          {
            id: 'choice_press_anyway',
            text: 'Press it anyway',
            canvas: { x: -60, y: 800 },
            eventName: 'press_button',
            nextNodeId: 'pressed'
          },
          { id: 'choice_leave_inspect', text: 'Leave', canvas: { x: 220, y: 800 }, close: true }
        ]
      },
      bash_success: {
        id: 'bash_success',
        text: 'You slam the button hard enough to trigger the mechanism.',
        portraits: {},
        canvas: { x: 340, y: 620 },
        choices: [{ id: 'choice_bash_success', text: 'Continue', canvas: { x: 340, y: 860 }, eventName: 'press_button', close: true }]
      },
      bash_fail: {
        id: 'bash_fail',
        text: 'You hit the button, but nothing happens except a dull thud.',
        portraits: {},
        canvas: { x: 40, y: 620 },
        choices: [
          { id: 'choice_try_again', text: 'Try something else', canvas: { x: -80, y: 860 }, nextNodeId: 'start' },
          { id: 'choice_leave_fail', text: 'Leave', canvas: { x: 180, y: 860 }, close: true }
        ]
      },
      bash_critical: {
        id: 'bash_critical',
        text: 'You smash the button with brutal force. The mechanism triggers instantly.',
        portraits: {},
        canvas: { x: 640, y: 620 },
        choices: [{ id: 'choice_bash_critical', text: 'Continue', canvas: { x: 640, y: 860 }, eventName: 'press_button', close: true }]
      }
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  });
}

export type IncomingRoute = {
  sourceNodeId: string;
  choiceId: string;
  branch: RouteBranch;
  color?: string;
};

export function findIncomingRoute(project: DialogueProject, nodeId: string): IncomingRoute | undefined {
  for (const node of Object.values(project.nodes)) {
    for (const choice of node.choices) {
      if (choice.nextNodeId === nodeId) {
        return {
          sourceNodeId: node.id,
          choiceId: choice.id,
          branch: 'next',
          color: choice.color
        };
      }

      if (choice.resolutionCheck?.failureNodeId === nodeId) {
        return {
          sourceNodeId: node.id,
          choiceId: choice.id,
          branch: 'failure',
          color: choice.color
        };
      }

      if (choice.resolutionCheck?.successNodeId === nodeId) {
        return {
          sourceNodeId: node.id,
          choiceId: choice.id,
          branch: 'success',
          color: choice.color
        };
      }

      if (choice.resolutionCheck?.criticalSuccessNodeId === nodeId) {
        return {
          sourceNodeId: node.id,
          choiceId: choice.id,
          branch: 'critical',
          color: choice.color
        };
      }
    }
  }

  return undefined;
}

export function getNodeAccentColor(project: DialogueProject, nodeId: string): string | undefined {
  return findIncomingRoute(project, nodeId)?.color;
}

export function getRouteAnchorSide(source: { x: number; y: number }, target: { x: number; y: number }): HandleSide {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX >= 0 ? 'right' : 'left';
  }

  return deltaY >= 0 ? 'bottom' : 'top';
}

export function getTargetHandleId(side: HandleSide): string {
  return `target:${side}`;
}

export function parseNodeHandle(handle: string | null | undefined): HandleSide | null {
  if (!handle) {
    return null;
  }

  const parts = handle.split(':');
  if (parts.length !== 2 || parts[0] !== 'target') {
    return null;
  }

  const side = parts[1];
  if (side !== 'top' && side !== 'right' && side !== 'bottom' && side !== 'left') {
    return null;
  }

  return side;
}

export type RouteHandleDirectionMap = Record<string, HandleSide>;

type CloseRouteSummary = {
  count: number;
  eventNames: string[];
};

export function getCloseRouteSummary(project: DialogueProject): CloseRouteSummary {
  const eventNames = new Set<string>();
  let count = 0;

  Object.values(project.nodes).forEach((node) => {
    node.choices.forEach((choice) => {
      if (!choice.close) {
        return;
      }

      count += 1;
      if (choice.eventName?.trim()) {
        eventNames.add(choice.eventName.trim());
      }
    });
  });

  return {
    count,
    eventNames: [...eventNames].sort()
  };
}

function getComputedTerminalNodePosition(project: DialogueProject): { x: number; y: number } | undefined {
  const closingNodes = Object.values(project.nodes).filter((node) => node.choices.some((choice) => choice.close));

  if (closingNodes.length === 0) {
    return undefined;
  }

  const averageX = closingNodes.reduce((sum, node) => sum + node.canvas.x, 0) / closingNodes.length;
  const lowestY = Math.max(...Object.values(project.nodes).map((node) => node.canvas.y));

  return {
    x: Math.round(averageX / 20) * 20,
    y: Math.round((lowestY + LEVEL_VERTICAL_SPACING * 0.8) / 20) * 20
  };
}

export function getTerminalNodePosition(project: DialogueProject): { x: number; y: number } | undefined {
  if (getCloseRouteSummary(project).count === 0) {
    return undefined;
  }

  return project.terminal ?? getComputedTerminalNodePosition(project);
}

export function ensureTerminalPosition(project: DialogueProject): DialogueProject {
  const nextProject = deepClone(project);
  const terminalPosition = getTerminalNodePosition(nextProject);

  if (!terminalPosition) {
    delete nextProject.terminal;
    return nextProject;
  }

  if (!nextProject.terminal) {
    nextProject.terminal = terminalPosition;
  }

  return nextProject;
}

export function getRouteHandleDirections(project: DialogueProject, terminalPosition?: { x: number; y: number }): Record<string, RouteHandleDirectionMap> {
  const directions: Record<string, RouteHandleDirectionMap> = {};

  Object.values(project.nodes).forEach((node) => {
    const nodeDirections: RouteHandleDirectionMap = {};

    node.choices.forEach((choice) => {
      const routes: Array<[DisplayBranch, { x: number; y: number } | undefined]> = [
        ['next', choice.nextNodeId ? project.nodes[choice.nextNodeId]?.canvas : undefined],
        ['failure', choice.resolutionCheck?.failureNodeId ? project.nodes[choice.resolutionCheck.failureNodeId]?.canvas : undefined],
        ['success', choice.resolutionCheck?.successNodeId ? project.nodes[choice.resolutionCheck.successNodeId]?.canvas : undefined],
        ['critical', choice.resolutionCheck?.criticalSuccessNodeId ? project.nodes[choice.resolutionCheck.criticalSuccessNodeId]?.canvas : undefined],
        ['close', choice.close ? terminalPosition : undefined]
      ];

      routes.forEach(([branch, targetPosition]) => {
        nodeDirections[choiceHandleId(choice.id, branch)] = targetPosition ? getRouteAnchorSide(node.canvas, targetPosition) : 'bottom';
      });
    });

    directions[node.id] = nodeDirections;
  });

  return directions;
}

export function resolveNodePortraits(project: DialogueProject, nodeId: string, trail = new Set<string>()): { left?: string; right?: string } {
  const node = project.nodes[nodeId];
  if (!node) {
    return {};
  }

  if (trail.has(nodeId)) {
    return {
      left: node.portraits.left,
      right: node.portraits.right
    };
  }

  const nextTrail = new Set(trail);
  nextTrail.add(nodeId);
  const incoming = findIncomingRoute(project, nodeId);
  const inherited = incoming?.sourceNodeId ? resolveNodePortraits(project, incoming.sourceNodeId, nextTrail) : {};

  return {
    left: node.portraits.left ?? inherited.left,
    right: node.portraits.right ?? inherited.right
  };
}

export function parseSourceHandle(handle: string | null | undefined): { choiceId: string; branch: RouteBranch } | null {
  if (!handle) {
    return null;
  }
  const parts = handle.split(':');
  if (parts.length !== 3 || parts[0] !== 'choice') {
    return null;
  }
  const [, choiceId, branch] = parts;
  if (branch !== 'next' && branch !== 'failure' && branch !== 'success' && branch !== 'critical') {
    return null;
  }
  return { choiceId, branch };
}

export function choiceHandleId(choiceId: string, branch: DisplayBranch): string {
  return `choice:${choiceId}:${branch}`;
}

export function setChoiceRoute(choice: DialogueChoice, branch: RouteBranch, targetNodeId?: string): DialogueChoice {
  const nextChoice = deepClone(choice);

  if (branch === 'next') {
    nextChoice.nextNodeId = targetNodeId || undefined;
    return nextChoice;
  }

  const resolutionCheck = nextChoice.resolutionCheck ?? {
    skill: 'strength' as SkillId,
    difficulty: 1
  };

  if (branch === 'failure') {
    resolutionCheck.failureNodeId = targetNodeId || undefined;
  }

  if (branch === 'success') {
    resolutionCheck.successNodeId = targetNodeId || undefined;
  }

  if (branch === 'critical') {
    resolutionCheck.criticalSuccessNodeId = targetNodeId || undefined;
  }

  nextChoice.resolutionCheck = resolutionCheck;
  return nextChoice;
}

export function connectProjectRoute(
  project: DialogueProject,
  sourceNodeId: string,
  choiceId: string,
  branch: RouteBranch,
  targetNodeId?: string
): DialogueProject {
  const nextProject = deepClone(project);
  const node = nextProject.nodes[sourceNodeId];

  if (!node) {
    return nextProject;
  }

  node.choices = node.choices.map((choice) => {
    if (choice.id !== choiceId) {
      return choice;
    }
    return setChoiceRoute(choice, branch, targetNodeId);
  });

  return nextProject;
}

export function createConnectedNodeProject(
  project: DialogueProject,
  sourceNodeId: string,
  choiceId: string,
  branch: RouteBranch,
  position?: { x: number; y: number }
): { project: DialogueProject; newNodeId: string } {
  const nextProject = deepClone(project);
  const sourceNode = nextProject.nodes[sourceNodeId];
  const sourceChoice = sourceNode?.choices.find((choice) => choice.id === choiceId);

  if (!sourceNode || !sourceChoice) {
    return { project: nextProject, newNodeId: '' };
  }

  const newNode = createNode(position ?? getSpawnedNodePosition(nextProject, sourceNodeId, choiceId, branch));

  nextProject.nodes[newNode.id] = newNode;

  return {
    project: connectProjectRoute(nextProject, sourceNodeId, choiceId, branch, newNode.id),
    newNodeId: newNode.id
  };
}

export function deriveEdges(project: DialogueProject): Edge[] {
  type DraftEdge = {
    edge: Edge;
    sourceSide: HandleSide;
    targetSide: HandleSide;
    sourcePoint: { x: number; y: number };
    targetPoint: { x: number; y: number };
  };

  const edges: DraftEdge[] = [];
  const terminalPosition = getTerminalNodePosition(project);
  const routeHandleDirections = getRouteHandleDirections(project, terminalPosition);

  const pushEdge = (edge: Edge, sourceSide: HandleSide, targetSide: HandleSide, sourcePoint: { x: number; y: number }, targetPoint: { x: number; y: number }) => {
    edges.push({ edge, sourceSide, targetSide, sourcePoint, targetPoint });
  };

  Object.values(project.nodes).forEach((node) => {
    node.choices.forEach((choice) => {
      if (choice.nextNodeId) {
        const targetNode = project.nodes[choice.nextNodeId];
        if (!targetNode) {
          return;
        }
        const sourceSide = routeHandleDirections[node.id]?.[choiceHandleId(choice.id, 'next')] ?? 'bottom';
        const targetSide = getRouteAnchorSide(targetNode.canvas, node.canvas);
        pushEdge({
          id: `${node.id}:${choice.id}:next`,
          source: dialogueCanvasId(node.id),
          sourceHandle: choiceHandleId(choice.id, 'next'),
          target: dialogueCanvasId(choice.nextNodeId),
          targetHandle: getTargetHandleId(targetSide),
          label: choice.text,
          className: choice.visibilityCheck ? 'edge-passive' : 'edge-normal',
          type: 'dialogue',
          animated: Boolean(choice.visibilityCheck),
          style: {
            stroke: choice.color,
            strokeWidth: 2
          },
          data: {
            nodeId: node.id,
            choiceId: choice.id,
            branch: 'next',
            sourceSide
          }
        }, sourceSide, targetSide, node.canvas, targetNode.canvas);
      }

      if (choice.close && terminalPosition) {
        const sourceSide = routeHandleDirections[node.id]?.[choiceHandleId(choice.id, 'close')] ?? 'bottom';
        const targetSide = getRouteAnchorSide(terminalPosition, node.canvas);
        pushEdge({
          id: `${node.id}:${choice.id}:close`,
          source: dialogueCanvasId(node.id),
          sourceHandle: choiceHandleId(choice.id, 'close'),
          target: terminalCanvasId(),
          targetHandle: getTargetHandleId(targetSide),
          label: choice.eventName ? `${choice.text} (end)` : choice.text,
          className: 'edge-close',
          type: 'dialogue',
          style: {
            stroke: choice.color,
            strokeWidth: 2
          },
          data: {
            nodeId: node.id,
            choiceId: choice.id,
            sourceSide
          }
        }, sourceSide, targetSide, node.canvas, terminalPosition);
      }

      const resolution = choice.resolutionCheck;
      if (!resolution) {
        return;
      }

      const routes: Array<[RouteBranch, string | undefined]> = [
        ['failure', resolution.failureNodeId],
        ['success', resolution.successNodeId],
        ['critical', resolution.criticalSuccessNodeId]
      ];

      routes.forEach(([branch, target]) => {
        if (!target) {
          return;
        }
        const targetNode = project.nodes[target];
        if (!targetNode) {
          return;
        }
        const sourceSide = routeHandleDirections[node.id]?.[choiceHandleId(choice.id, branch)] ?? 'bottom';
        const targetSide = getRouteAnchorSide(targetNode.canvas, node.canvas);
        pushEdge({
          id: `${node.id}:${choice.id}:${branch}`,
          source: dialogueCanvasId(node.id),
          sourceHandle: choiceHandleId(choice.id, branch),
          target: dialogueCanvasId(target),
          targetHandle: getTargetHandleId(targetSide),
          label: `${choice.text} (${branch})`,
          className: `edge-${branch}`,
          type: 'dialogue',
          animated: branch !== 'failure',
          style: {
            stroke: choice.color,
            strokeWidth: 2
          },
          data: {
            nodeId: node.id,
            choiceId: choice.id,
            branch,
            sourceSide
          }
        }, sourceSide, targetSide, node.canvas, targetNode.canvas);
      });
    });
  });

  const laneGroups = new Map<string, DraftEdge[]>();

  edges.forEach((draftEdge) => {
    const groupKey = `${draftEdge.edge.source}:${draftEdge.sourceSide}`;
    const group = laneGroups.get(groupKey) ?? [];
    group.push(draftEdge);
    laneGroups.set(groupKey, group);
  });

  laneGroups.forEach((group) => {
    const sourceSide = group[0]?.sourceSide;
    if (!sourceSide) {
      return;
    }

    const sortAxis = sourceSide === 'left' || sourceSide === 'right' ? 'y' : 'x';
    group.sort((left, right) => left.targetPoint[sortAxis] - right.targetPoint[sortAxis] || left.edge.id.localeCompare(right.edge.id));

    group.forEach((draftEdge, index) => {
      const laneOffset = (index - (group.length - 1) / 2) * 18;
      draftEdge.edge.data = {
        ...draftEdge.edge.data,
        targetSide: draftEdge.targetSide,
        laneOffset
      };
    });
  });

  return edges.map(({ edge }) => {
    const sourceNodeId = edge.source.replace(/^dialogue:/, '');
    const targetNodeId = edge.target.replace(/^dialogue:/, '');
    const hidden = Boolean(project.nodes[sourceNodeId]?.hidden) || Boolean(project.nodes[targetNodeId]?.hidden);

    return {
      ...edge,
      style: {
        ...edge.style,
        opacity: hidden ? 0.22 : 1
      }
    };
  });
}

function getChoiceRouteTargets(choice: DialogueChoice): string[] {
  return [choice.nextNodeId, choice.resolutionCheck?.failureNodeId, choice.resolutionCheck?.successNodeId, choice.resolutionCheck?.criticalSuccessNodeId].filter(
    (targetId): targetId is string => Boolean(targetId)
  );
}

export type FocusScope = {
  nodeIds: Set<string>;
  includeTerminal: boolean;
};

export function getChoiceFocusScope(project: DialogueProject, nodeId: string, choiceId: string): FocusScope {
  const scope: FocusScope = {
    nodeIds: new Set<string>([nodeId]),
    includeTerminal: false
  };
  const choice = project.nodes[nodeId]?.choices.find((candidate) => candidate.id === choiceId);

  if (!choice) {
    return scope;
  }

  const stack = [...getChoiceRouteTargets(choice)];
  scope.includeTerminal = Boolean(choice.close);

  while (stack.length > 0) {
    const currentNodeId = stack.pop()!;
    if (scope.nodeIds.has(currentNodeId) || !project.nodes[currentNodeId]) {
      continue;
    }

    scope.nodeIds.add(currentNodeId);
    project.nodes[currentNodeId].choices.forEach((childChoice) => {
      if (childChoice.close) {
        scope.includeTerminal = true;
      }
      stack.push(...getChoiceRouteTargets(childChoice));
    });
  }

  return scope;
}

export function collectCascadeDeleteNodeIds(project: DialogueProject, rootNodeId: string): Set<string> {
  const descendants = new Set<string>();
  const stack = [rootNodeId];

  while (stack.length > 0) {
    const currentNodeId = stack.pop()!;
    const currentNode = project.nodes[currentNodeId];
    if (!currentNode) {
      continue;
    }

    currentNode.choices.forEach((choice) => {
      getChoiceRouteTargets(choice).forEach((targetId) => {
        if (!descendants.has(targetId) && targetId !== rootNodeId) {
          descendants.add(targetId);
          stack.push(targetId);
        }
      });
    });
  }

  const cascadeIds = new Set<string>([rootNodeId]);
  let changed = true;

  while (changed) {
    changed = false;

    descendants.forEach((nodeId) => {
      if (cascadeIds.has(nodeId)) {
        return;
      }

      const incomingSources = Object.values(project.nodes).flatMap((node) =>
        node.choices.filter((choice) => getChoiceRouteTargets(choice).includes(nodeId)).map(() => node.id)
      );

      if (incomingSources.length > 0 && incomingSources.every((sourceNodeId) => cascadeIds.has(sourceNodeId))) {
        cascadeIds.add(nodeId);
        changed = true;
      }
    });
  }

  return cascadeIds;
}

export function deleteNodesFromProject(project: DialogueProject, nodeIds: Iterable<string>): DialogueProject {
  const nextProject = deepClone(project);
  const deletedNodeIds = new Set(nodeIds);

  deletedNodeIds.forEach((nodeId) => {
    delete nextProject.nodes[nodeId];
  });

  Object.values(nextProject.nodes).forEach((node) => {
    node.choices = node.choices.map((choice) => {
      const nextChoice = deepClone(choice);

      if (nextChoice.nextNodeId && deletedNodeIds.has(nextChoice.nextNodeId)) {
        nextChoice.nextNodeId = undefined;
      }

      if (nextChoice.resolutionCheck?.failureNodeId && deletedNodeIds.has(nextChoice.resolutionCheck.failureNodeId)) {
        nextChoice.resolutionCheck.failureNodeId = undefined;
      }
      if (nextChoice.resolutionCheck?.successNodeId && deletedNodeIds.has(nextChoice.resolutionCheck.successNodeId)) {
        nextChoice.resolutionCheck.successNodeId = undefined;
      }
      if (nextChoice.resolutionCheck?.criticalSuccessNodeId && deletedNodeIds.has(nextChoice.resolutionCheck.criticalSuccessNodeId)) {
        nextChoice.resolutionCheck.criticalSuccessNodeId = undefined;
      }

      return nextChoice;
    });
  });

  if (deletedNodeIds.has(nextProject.startNodeId)) {
    nextProject.startNodeId = Object.keys(nextProject.nodes)[0] ?? '';
  }

  return ensureTerminalPosition(nextProject);
}
export function dialogueCanvasId(nodeId: string): string {
  return `dialogue:${nodeId}`;
}

export function compileRuntime(project: DialogueProject): RuntimeDialogue {
  const referencedAssets = new Set<string>();

  const nodes = Object.fromEntries(
    Object.values(project.nodes).map((node) => {
      const portraits = resolveNodePortraits(project, node.id);

      if (portraits.left) {
        referencedAssets.add(portraits.left);
      }
      if (portraits.right) {
        referencedAssets.add(portraits.right);
      }

      const runtimeChoices: RuntimeChoice[] = node.choices.map((choice) => {
        const compiled: RuntimeChoice = {
          text: choice.text
        };

        if (choice.nextNodeId) {
          compiled.next = choice.nextNodeId;
        }
        if (choice.close) {
          compiled.close = true;
        }
        if (choice.eventName) {
          compiled.event = choice.eventName;
        }
        if (choice.visibilityCheck) {
          compiled.visibility_check = {
            skill: choice.visibilityCheck.skill,
            difficulty: choice.visibilityCheck.difficulty
          };
        }
        if (choice.resolutionCheck) {
          compiled.skill_check = {
            skill: choice.resolutionCheck.skill,
            difficulty: choice.resolutionCheck.difficulty,
            failure_node: choice.resolutionCheck.failureNodeId,
            success_node: choice.resolutionCheck.successNodeId,
            critical_node: choice.resolutionCheck.criticalSuccessNodeId
          };
        }

        return compiled;
      });

      const runtimeNode: RuntimeNode = {
        text: node.text,
        choices: runtimeChoices
      };

      if (portraits.left || portraits.right) {
        runtimeNode.portraits = {
          ...(portraits.left ? { left: portraits.left } : {}),
          ...(portraits.right ? { right: portraits.right } : {})
        };
      }

      return [node.id, runtimeNode];
    })
  );

  const assets = Object.fromEntries(
    [...referencedAssets]
      .map((assetId) => project.assets[assetId])
      .filter((asset): asset is AssetEntry => Boolean(asset))
      .map((asset) => [asset.id, { path: `images/${asset.fileName}` }])
  );

  return {
    version: 1,
    scene_id: project.sceneId,
    start_node: project.startNodeId,
    assets,
    nodes
  };
}
