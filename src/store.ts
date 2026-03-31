import { create } from 'zustand';
import {
  collectCascadeDeleteNodeIds,
  connectProjectRoute,
  createChoice,
  createConnectedNodeProject,
  createDefaultProject,
  createNode,
  createUniqueNodeId,
  deleteNodesFromProject,
  deepClone,
  getChoiceCanvasPosition,
  makeId,
  normalizeChoiceColor,
  normalizeProject,
  pickChoiceColor,
  slugify,
  type AssetEntry,
  type DialogueChoice,
  type DialogueNode,
  type DialogueProject,
  type RouteBranch,
  type ActiveSkillCheck,
  type PassiveSkillCheck,
  type SkillId
} from './dialogue';

export type Selection =
  | { kind: 'scene' }
  | { kind: 'node'; nodeId: string }
  | { kind: 'choice'; nodeId: string; choiceId: string }
  | { kind: 'edge'; nodeId: string; choiceId: string; branch: RouteBranch };
export type FocusChoice = { nodeId: string; choiceId: string } | undefined;

type ProjectStore = {
  project: DialogueProject;
  selection: Selection;
  focusChoice: FocusChoice;
  previewOpen: boolean;
  replaceProject: (project: DialogueProject) => void;
  setSelection: (selection: Selection) => void;
  setFocusChoice: (focusChoice: FocusChoice) => void;
  setPreviewOpen: (open: boolean) => void;
  resetProject: () => void;
  clearScene: () => void;
  setSceneField: (field: 'sceneId' | 'title' | 'startNodeId', value: string) => void;
  addNode: () => void;
  duplicateNode: (nodeId: string) => void;
  updateNodeText: (nodeId: string, value: string) => void;
  updateNodePortrait: (nodeId: string, side: 'left' | 'right', value: string) => void;
  updateNodeId: (nodeId: string, nextId: string) => void;
  setNodeHidden: (nodeId: string, hidden: boolean) => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  moveNodes: (nodeIds: string[], delta: { x: number; y: number }) => void;
  setTerminalPosition: (position: { x: number; y: number }) => void;
  setChoicePosition: (nodeId: string, choiceId: string, position: { x: number; y: number }) => void;
  addChoice: (nodeId: string) => void;
  removeChoice: (nodeId: string, choiceId: string) => void;
  updateChoice: (nodeId: string, choiceId: string, updater: (choice: DialogueChoice) => DialogueChoice) => void;
  createChoiceWithNode: (
    parentNodeId: string,
    input: {
      choiceText: string;
      targetNodeId?: string;
      eventName?: string;
      visibilityCheck?: PassiveSkillCheck;
      resolutionCheck?: ActiveSkillCheck;
      newNode?: {
        preferredId?: string;
        text: string;
        position: { x: number; y: number };
      };
    }
  ) => { choiceId: string; nodeId?: string };
  createConnectedNode: (nodeId: string, choiceId: string, branch: RouteBranch, position?: { x: number; y: number }) => void;
  connectRoute: (nodeId: string, choiceId: string, branch: RouteBranch, targetNodeId?: string) => void;
  clearEdge: (nodeId: string, choiceId: string, branch: RouteBranch) => void;
  deleteNode: (nodeId: string, cascadeChildren?: boolean) => void;
  addAsset: (asset: AssetEntry) => void;
  renameAsset: (oldId: string, nextId: string) => void;
  removeAsset: (assetId: string) => void;
};

function updateNode(project: DialogueProject, nodeId: string, updater: (node: DialogueNode) => DialogueNode): DialogueProject {
  const nextProject = deepClone(project);
  const node = nextProject.nodes[nodeId];
  if (!node) {
    return nextProject;
  }
  nextProject.nodes[nodeId] = updater(node);
  return nextProject;
}

function updateChoice(project: DialogueProject, nodeId: string, choiceId: string, updater: (choice: DialogueChoice) => DialogueChoice): DialogueProject {
  return updateNode(project, nodeId, (node) => ({
    ...node,
    choices: node.choices.map((choice) => (choice.id === choiceId ? updater(choice) : choice))
  }));
}

export const useProjectStore = create<ProjectStore>((set) => ({
  project: createDefaultProject(),
  selection: { kind: 'scene' },
  focusChoice: undefined,
  previewOpen: false,
  replaceProject: (project) => set({ project: normalizeProject(project), selection: { kind: 'scene' }, focusChoice: undefined }),
  setSelection: (selection) => set({ selection }),
  setFocusChoice: (focusChoice) => set({ focusChoice }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  resetProject: () => set({ project: normalizeProject(createDefaultProject()), selection: { kind: 'scene' }, focusChoice: undefined, previewOpen: false }),
  clearScene: () =>
    set((state) => {
      const startNode = createNode({ x: 120, y: 120 }, 'start');

      return {
        project: normalizeProject({
          ...state.project,
          startNodeId: startNode.id,
          nodes: {
            [startNode.id]: startNode
          },
          terminal: undefined
        }),
        selection: { kind: 'node', nodeId: startNode.id },
        focusChoice: undefined,
        previewOpen: false
      };
    }),
  setSceneField: (field, value) =>
    set((state) => ({
      project: {
        ...state.project,
        [field]: value
      }
    })),
  addNode: () =>
    set((state) => {
      const node = createNode({ x: 180, y: 180 });
      return {
        project: {
          ...state.project,
          nodes: {
            ...state.project.nodes,
            [node.id]: node
          }
        },
        selection: { kind: 'node', nodeId: node.id }
      };
    }),
  duplicateNode: (nodeId) =>
    set((state) => {
      const sourceNode = state.project.nodes[nodeId];
      if (!sourceNode) {
        return {};
      }

      const nextNodeId = makeId('node');
      const duplicated: DialogueNode = {
        ...deepClone(sourceNode),
        id: nextNodeId,
        canvas: { x: sourceNode.canvas.x + 80, y: sourceNode.canvas.y + 80 },
        choices: sourceNode.choices.map((choice) => ({ ...deepClone(choice), id: makeId('choice') }))
      };

      return {
        project: {
          ...state.project,
          nodes: {
            ...state.project.nodes,
            [duplicated.id]: duplicated
          }
        },
        selection: { kind: 'node', nodeId: duplicated.id }
      };
    }),
  deleteNode: (nodeId, cascadeChildren = false) =>
    set((state) => {
      const nodeIdsToDelete = cascadeChildren ? collectCascadeDeleteNodeIds(state.project, nodeId) : new Set([nodeId]);
      const nextProject = deleteNodesFromProject(state.project, nodeIdsToDelete);

      return {
        project: nextProject,
        selection: { kind: 'scene' },
        focusChoice: undefined
      };
    }),
  updateNodeText: (nodeId, value) =>
    set((state) => ({
      project: updateNode(state.project, nodeId, (node) => ({ ...node, text: value }))
    })),
  updateNodePortrait: (nodeId, side, value) =>
    set((state) => ({
      project: updateNode(state.project, nodeId, (node) => ({
        ...node,
        portraits: {
          ...node.portraits,
          [side]: value || undefined
        }
      }))
    })),
  updateNodeId: (nodeId, nextId) =>
    set((state) => {
      const sanitized = slugify(nextId);
      if (!sanitized || sanitized === nodeId || state.project.nodes[sanitized]) {
        return {};
      }

      const nextProject = deepClone(state.project);
      const node = nextProject.nodes[nodeId];
      if (!node) {
        return {};
      }

      delete nextProject.nodes[nodeId];
      node.id = sanitized;
      nextProject.nodes[sanitized] = node;

      Object.values(nextProject.nodes).forEach((currentNode) => {
        currentNode.choices = currentNode.choices.map((choice) => {
          const nextChoice = deepClone(choice);
          if (nextChoice.nextNodeId === nodeId) {
            nextChoice.nextNodeId = sanitized;
          }
          if (nextChoice.resolutionCheck?.failureNodeId === nodeId) {
            nextChoice.resolutionCheck.failureNodeId = sanitized;
          }
          if (nextChoice.resolutionCheck?.successNodeId === nodeId) {
            nextChoice.resolutionCheck.successNodeId = sanitized;
          }
          if (nextChoice.resolutionCheck?.criticalSuccessNodeId === nodeId) {
            nextChoice.resolutionCheck.criticalSuccessNodeId = sanitized;
          }
          return nextChoice;
        });
      });

      if (nextProject.startNodeId === nodeId) {
        nextProject.startNodeId = sanitized;
      }

      return {
        project: nextProject,
        selection: { kind: 'node', nodeId: sanitized },
        focusChoice: undefined
      };
    }),
  setNodeHidden: (nodeId, hidden) =>
    set((state) => ({
      project: updateNode(state.project, nodeId, (node) => ({ ...node, hidden }))
    })),
  setNodePosition: (nodeId, position) =>
    set((state) => {
      const node = state.project.nodes[nodeId];
      if (!node || (node.canvas.x === position.x && node.canvas.y === position.y)) {
        return {};
      }

      return {
        project: {
          ...state.project,
          nodes: {
            ...state.project.nodes,
            [nodeId]: {
              ...node,
              canvas: position
            }
          }
        }
      };
    }),
  moveNodes: (nodeIds, delta) =>
    set((state) => {
      if (delta.x === 0 && delta.y === 0) {
        return {};
      }

      const nextNodes = { ...state.project.nodes };
      let changed = false;

      nodeIds.forEach((nodeId) => {
        const node = state.project.nodes[nodeId];
        if (!node) {
          return;
        }

        nextNodes[nodeId] = {
          ...node,
          canvas: {
            x: node.canvas.x + delta.x,
            y: node.canvas.y + delta.y
          }
        };
        changed = true;
      });

      if (!changed) {
        return {};
      }

      return {
        project: {
          ...state.project,
          nodes: nextNodes
        }
      };
    }),
  setTerminalPosition: (position) =>
    set((state) => ({
      project: {
        ...state.project,
        terminal: position
      }
    })),
  setChoicePosition: (nodeId, choiceId, position) =>
    set((state) => ({
      project: updateChoice(state.project, nodeId, choiceId, (choice) => ({ ...choice, canvas: position }))
    })),
  addChoice: (nodeId) =>
    set((state) => {
      const node = state.project.nodes[nodeId];
      if (!node) {
        return {};
      }

      const choice = createChoice(
        'New option',
        getChoiceCanvasPosition(node.canvas, node.choices.length, node.choices.length + 1),
        pickChoiceColor(node.choices.map((choice) => choice.color).filter((color): color is string => Boolean(color)))
      );

      return {
        project: updateNode(state.project, nodeId, (currentNode) => ({
          ...currentNode,
          choices: [...currentNode.choices, choice]
        })),
        selection: { kind: 'choice', nodeId, choiceId: choice.id },
        focusChoice: { nodeId, choiceId: choice.id }
      };
    }),
  removeChoice: (nodeId, choiceId) =>
    set((state) => ({
      project: updateNode(state.project, nodeId, (node) => ({
        ...node,
        choices: node.choices.filter((choice) => choice.id !== choiceId)
      })),
      selection: { kind: 'node', nodeId }
    })),
  updateChoice: (nodeId, choiceId, updater) =>
    set((state) => ({
      project: updateChoice(state.project, nodeId, choiceId, updater)
    })),
  createChoiceWithNode: (parentNodeId, input) => {
    let created = { choiceId: '', nodeId: undefined as string | undefined };

    set((state) => {
      const nextProject = deepClone(state.project);
      const parentNode = nextProject.nodes[parentNodeId];
      if (!parentNode) {
        return {};
      }

      let targetNodeId = input.targetNodeId;
      if (input.newNode) {
        const nextNodeId = createUniqueNodeId(nextProject, input.newNode.preferredId);
        const nextNode = createNode(input.newNode.position, nextNodeId);
        nextNode.text = input.newNode.text.trim() || nextNode.text;
        nextProject.nodes[nextNodeId] = nextNode;
        targetNodeId = nextNodeId;
        created.nodeId = nextNodeId;
      }

      const choice = createChoice(
        input.choiceText.trim() || 'New option',
        getChoiceCanvasPosition(parentNode.canvas, parentNode.choices.length, parentNode.choices.length + 1),
        pickChoiceColor(parentNode.choices.map((choice) => choice.color).filter((color): color is string => Boolean(color)))
      );
      choice.nextNodeId = targetNodeId;
      choice.eventName = input.eventName?.trim() || undefined;
      choice.visibilityCheck = input.visibilityCheck ? deepClone(input.visibilityCheck) : undefined;
      choice.resolutionCheck = input.resolutionCheck ? deepClone(input.resolutionCheck) : undefined;
      parentNode.choices.push(choice);
      created.choiceId = choice.id;

      return {
        project: nextProject,
        selection: created.nodeId ? { kind: 'node', nodeId: created.nodeId } : { kind: 'choice', nodeId: parentNodeId, choiceId: choice.id },
        focusChoice: { nodeId: parentNodeId, choiceId: choice.id }
      };
    });

    return created;
  },
  createConnectedNode: (nodeId, choiceId, branch, position) =>
    set((state) => {
      const result = createConnectedNodeProject(state.project, nodeId, choiceId, branch, position);
      return {
        project: result.project,
        selection: { kind: 'node', nodeId: result.newNodeId }
      };
    }),
  connectRoute: (nodeId, choiceId, branch, targetNodeId) =>
    set((state) => ({
      project: connectProjectRoute(state.project, nodeId, choiceId, branch, targetNodeId),
      selection: { kind: 'edge', nodeId, choiceId, branch }
    })),
  clearEdge: (nodeId, choiceId, branch) =>
    set((state) => ({
      project: connectProjectRoute(state.project, nodeId, choiceId, branch, undefined),
      selection: { kind: 'choice', nodeId, choiceId }
    })),
  addAsset: (asset) =>
    set((state) => {
      const baseId = slugify(asset.id);
      let uniqueId = baseId;
      let suffix = 1;
      while (state.project.assets[uniqueId]) {
        suffix += 1;
        uniqueId = `${baseId}_${suffix}`;
      }
      return {
        project: {
          ...state.project,
          assets: {
            ...state.project.assets,
            [uniqueId]: {
              ...asset,
              id: uniqueId
            }
          }
        }
      };
    }),
  renameAsset: (oldId, nextId) =>
    set((state) => {
      const sanitized = slugify(nextId);
      if (!sanitized || sanitized === oldId || state.project.assets[sanitized]) {
        return {};
      }

      const nextProject = deepClone(state.project);
      const asset = nextProject.assets[oldId];
      if (!asset) {
        return {};
      }
      delete nextProject.assets[oldId];
      asset.id = sanitized;
      nextProject.assets[sanitized] = asset;

      Object.values(nextProject.nodes).forEach((node) => {
        if (node.portraits.left === oldId) {
          node.portraits.left = sanitized;
        }
        if (node.portraits.right === oldId) {
          node.portraits.right = sanitized;
        }
      });

      return { project: nextProject };
    }),
  removeAsset: (assetId) =>
    set((state) => {
      const nextProject = deepClone(state.project);
      delete nextProject.assets[assetId];
      return { project: nextProject };
    })
}));

export function setChoiceText(value: string) {
  return (choice: DialogueChoice): DialogueChoice => ({ ...choice, text: value });
}

export function setChoiceColor(value: string) {
  return (choice: DialogueChoice): DialogueChoice => ({
    ...choice,
    color: normalizeChoiceColor(value) ?? choice.color
  });
}

export function setChoiceNextField(field: 'nextNodeId' | 'eventName', value: string) {
  return (choice: DialogueChoice): DialogueChoice => ({
    ...choice,
    [field]: value || undefined
  });
}

export function setChoiceClose(value: boolean) {
  return (choice: DialogueChoice): DialogueChoice => ({ ...choice, close: value });
}

export function setChoiceVisibilityEnabled(enabled: boolean) {
  return (choice: DialogueChoice): DialogueChoice => ({
    ...choice,
    visibilityCheck: enabled ? choice.visibilityCheck ?? { skill: 'perception', difficulty: 1 } : undefined
  });
}

export function setChoiceVisibilityField(field: keyof { skill: SkillId; difficulty: number }, value: string | number) {
  return (choice: DialogueChoice): DialogueChoice => ({
    ...choice,
    visibilityCheck: {
      skill: choice.visibilityCheck?.skill ?? 'perception',
      difficulty: choice.visibilityCheck?.difficulty ?? 1,
      [field]: value
    } as { skill: SkillId; difficulty: number }
  });
}

export function setChoiceResolutionEnabled(enabled: boolean) {
  return (choice: DialogueChoice): DialogueChoice => ({
    ...choice,
    resolutionCheck: enabled ? choice.resolutionCheck ?? { skill: 'strength', difficulty: 1 } : undefined
  });
}

export function setChoiceResolutionField(
  field: keyof {
    skill: SkillId;
    difficulty: number;
    failureNodeId?: string;
    successNodeId?: string;
    criticalSuccessNodeId?: string;
  },
  value: string | number
) {
  return (choice: DialogueChoice): DialogueChoice => ({
    ...choice,
    resolutionCheck: {
      skill: choice.resolutionCheck?.skill ?? 'strength',
      difficulty: choice.resolutionCheck?.difficulty ?? 1,
      failureNodeId: choice.resolutionCheck?.failureNodeId,
      successNodeId: choice.resolutionCheck?.successNodeId,
      criticalSuccessNodeId: choice.resolutionCheck?.criticalSuccessNodeId,
      [field]: value || undefined
    }
  });
}
