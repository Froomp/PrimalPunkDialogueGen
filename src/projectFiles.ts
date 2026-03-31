import { compileRuntime, createChoice, getChoiceCanvasPosition, projectSchema, runtimeDialogueSchema, type AssetEntry, type DialogueProject, type RuntimeDialogue } from './dialogue';

export const AUTOSAVE_KEY = 'primal-punk-dialogue-editor.project';

export function loadProjectFromStorage(): DialogueProject | null {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) {
    return null;
  }

  return projectSchema.parse(JSON.parse(raw));
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
    return runtimeDialogueToProject(runtimeDialogueSchema.parse(parsed), file.name.replace(/\.json$/i, ''));
  }
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
      [runtimeNode.left_portrait, runtimeNode.right_portrait]
        .filter((portrait): portrait is string => Boolean(portrait))
        .forEach((portrait) => {
          if (!assets[portrait]) {
            const normalizedName = portrait.split('/').pop() || `${portrait}.png`;
            assets[portrait] = {
              id: portrait,
              fileName: normalizedName,
              mimeType: 'application/octet-stream',
              dataUrl: 'data:,'
            };
          }
        });
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
            ...(runtimeNode.left_portrait ? { left: runtimeNode.left_portrait } : {}),
            ...(runtimeNode.right_portrait ? { right: runtimeNode.right_portrait } : {})
          },
          canvas,
          choices: runtimeNode.choices.map((choice, choiceIndex) => {
            const created = createChoice(choice.text, getChoiceCanvasPosition(canvas, choiceIndex, runtimeNode.choices.length));
            created.nextNodeId = choice.next;
            created.close = choice.close;
            created.eventName = choice.event;
            created.visibilityCheck = choice.passive_skill_check
              ? {
                  skill: choice.passive_skill_check.skill,
                  difficulty: choice.passive_skill_check.difficulty
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
