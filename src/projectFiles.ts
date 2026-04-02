import {
  applyBundledSampleLayout,
  compileRuntime,
  createChoice,
  getChoiceCanvasPosition,
  legacyRuntimeDialogueSchema,
  projectSchema,
  runtimeDialogueSchema,
  type AssetEntry,
  type DialogueProject,
  type LegacyRuntimeDialogue,
  type RuntimeDialogue
} from './dialogue';

export const AUTOSAVE_KEY = 'primal-punk-dialogue-editor.project';

export function loadProjectFromStorage(): DialogueProject | null {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) {
    return null;
  }

  return applyBundledSampleLayout(projectSchema.parse(JSON.parse(raw)));
}

export function downloadProjectFile(project: DialogueProject): void {
  const blob = new Blob([JSON.stringify(compileRuntime(project), null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${project.sceneId}.json`;
  link.click();
  URL.revokeObjectURL(href);
}

export async function fileToAsset(file: File): Promise<AssetEntry> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return {
    id: file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataUrl
  };
}

export async function readProjectFile(file: File): Promise<DialogueProject> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  try {
    return projectSchema.parse(parsed);
  } catch {
    const sceneId = file.name.replace(/\.json$/i, '');

    try {
      return runtimeDialogueToProject(runtimeDialogueSchema.parse(parsed), sceneId);
    } catch {
      return legacyRuntimeDialogueToProject(legacyRuntimeDialogueSchema.parse(parsed), sceneId);
    }
  }
}

function addPortraitAsset(assets: DialogueProject['assets'], portrait?: string | null): void {
  if (!portrait || assets[portrait]) {
    return;
  }

  const normalizedName = portrait.split('/').pop() || `${portrait}.png`;
  assets[portrait] = {
    id: portrait,
    fileName: normalizedName,
    mimeType: 'application/octet-stream',
    dataUrl: 'data:,'
  };
}

function runtimeDialogueToProject(runtime: RuntimeDialogue, sceneId: string): DialogueProject {
  const nodeIds = Object.keys(runtime);
  const startNodeId = runtime.start ? 'start' : nodeIds[0] ?? 'start';
  const assets: DialogueProject['assets'] = {};
  const levels = new Map<string, number>();
  const queue = [{ nodeId: startNodeId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (levels.has(current.nodeId) || !runtime[current.nodeId]) {
      continue;
    }

    levels.set(current.nodeId, current.depth);
    runtime[current.nodeId].choices.forEach((choice) => {
      if (choice.next) {
        queue.push({ nodeId: choice.next, depth: current.depth + 1 });
      }
      if (choice.skill_check?.failure_node) {
        queue.push({ nodeId: choice.skill_check.failure_node, depth: current.depth + 1 });
      }
      if (choice.skill_check?.success_node) {
        queue.push({ nodeId: choice.skill_check.success_node, depth: current.depth + 1 });
      }
      if (choice.skill_check?.critical_node) {
        queue.push({ nodeId: choice.skill_check.critical_node, depth: current.depth + 1 });
      }
    });
  }

  nodeIds.forEach((nodeId) => {
    if (!levels.has(nodeId)) {
      levels.set(nodeId, levels.size);
    }
  });

  const nodesAtDepth = new Map<number, string[]>();
  nodeIds.forEach((nodeId) => {
    const depth = levels.get(nodeId) ?? 0;
    const bucket = nodesAtDepth.get(depth) ?? [];
    bucket.push(nodeId);
    nodesAtDepth.set(depth, bucket);
  });

  const nodes = Object.fromEntries(
    nodeIds.map((nodeId) => {
      const runtimeNode = runtime[nodeId];
      addPortraitAsset(assets, runtimeNode.portraits?.left);
      addPortraitAsset(assets, runtimeNode.portraits?.right);
      const depth = levels.get(nodeId) ?? 0;
      const siblings = nodesAtDepth.get(depth) ?? [nodeId];
      const index = siblings.indexOf(nodeId);
      const canvas = {
        x: 120 + index * 520,
        y: 120 + depth * 460
      };

      return [
        nodeId,
        {
          id: nodeId,
          text: runtimeNode.text,
          hidden: false,
          portraits: {
            ...(runtimeNode.portraits?.left !== undefined ? { left: runtimeNode.portraits.left } : {}),
            ...(runtimeNode.portraits?.right !== undefined ? { right: runtimeNode.portraits.right } : {})
          },
          canvas,
          choices: runtimeNode.choices.map((choice, choiceIndex) => {
            const created = createChoice(choice.text, getChoiceCanvasPosition(canvas, choiceIndex, runtimeNode.choices.length));
            created.nextNodeId = choice.next;
            created.close = choice.close;
            created.eventName = choice.event;
            created.setFlags = choice.set_flags?.length ? choice.set_flags : undefined;
            created.visibilityCheck = choice.passive_check
              ? {
                  skill: choice.passive_check.skill,
                  difficulty: choice.passive_check.difficulty
                }
              : undefined;
            created.resolutionCheck = choice.skill_check
              ? {
                  skill: choice.skill_check.skill,
                  difficulty: choice.skill_check.difficulty,
                  failureNodeId: choice.skill_check.failure_node,
                  successNodeId: choice.skill_check.success_node,
                  criticalSuccessNodeId: choice.skill_check.critical_node
                }
              : undefined;
            created.conditions = choice.conditions
              ? {
                  ...(choice.conditions.flags_all?.length ? { flagsAll: choice.conditions.flags_all } : {}),
                  ...(choice.conditions.flags_not?.length ? { flagsNot: choice.conditions.flags_not } : {})
                }
              : undefined;
            return created;
          })
        }
      ];
    })
  );

  return projectSchema.parse({
    version: 1,
    sceneId: sceneId || 'dialogue',
    title: sceneId || 'Imported Dialogue',
    startNodeId,
    assets,
    nodes,
    viewport: { x: 0, y: 0, zoom: 1 }
  });
}

function legacyRuntimeDialogueToProject(runtime: LegacyRuntimeDialogue, sceneId: string): DialogueProject {
  const upgradedRuntime: RuntimeDialogue = Object.fromEntries(
    Object.entries(runtime).map(([nodeId, node]) => [
      nodeId,
      {
        text: node.text,
        portraits: {
          ...(node.left_portrait ? { left: node.left_portrait } : {}),
          ...(node.right_portrait ? { right: node.right_portrait } : {})
        },
        choices: node.choices.map((choice) => {
          const passiveHasBranches = Boolean(
            choice.passive_skill_check?.failure_node || choice.passive_skill_check?.success_node || choice.passive_skill_check?.critical_node
          );

          return {
            text: choice.text,
            next: choice.next,
            close: choice.close,
            event: choice.event,
            passive_check:
              choice.passive_skill_check && !passiveHasBranches
                ? {
                    skill: choice.passive_skill_check.skill,
                    difficulty: choice.passive_skill_check.difficulty
                  }
                : undefined,
            skill_check:
              choice.skill_check ??
              (choice.passive_skill_check && passiveHasBranches
                ? {
                    skill: choice.passive_skill_check.skill,
                    difficulty: choice.passive_skill_check.difficulty,
                    failure_node: choice.passive_skill_check.failure_node,
                    success_node: choice.passive_skill_check.success_node,
                    critical_node: choice.passive_skill_check.critical_node
                  }
                : undefined)
          };
        })
      }
    ])
  );

  return runtimeDialogueToProject(upgradedRuntime, sceneId);
}
