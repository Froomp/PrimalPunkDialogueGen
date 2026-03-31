import { compileRuntime, skillIds, type DialogueProject, type RouteBranch } from './dialogue';

export type ValidationSeverity = 'error' | 'warning';

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  nodeId?: string;
  choiceId?: string;
};

const validSkills = new Set(skillIds);

function isNodePresent(project: DialogueProject, nodeId?: string): boolean {
  return Boolean(nodeId && project.nodes[nodeId]);
}

function pushMissingTarget(
  issues: ValidationIssue[],
  branch: RouteBranch,
  nodeId: string,
  choiceId: string,
  targetNodeId?: string
): void {
  if (!targetNodeId) {
    issues.push({
      severity: 'error',
      code: `missing-${branch}-target`,
      message: `Choice "${choiceId}" is missing its ${branch} target.`,
      nodeId,
      choiceId
    });
    return;
  }

  issues.push({
    severity: 'error',
    code: `broken-${branch}-target`,
    message: `Choice "${choiceId}" points to missing node "${targetNodeId}" for ${branch}.`,
    nodeId,
    choiceId
  });
}

function choiceHasExit(choice: DialogueProject['nodes'][string]['choices'][number]): boolean {
  return Boolean(
    choice.close ||
      choice.nextNodeId ||
      choice.resolutionCheck?.failureNodeId ||
      choice.resolutionCheck?.successNodeId ||
      choice.resolutionCheck?.criticalSuccessNodeId
  );
}

export function validateProject(project: DialogueProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const choiceIds = new Set<string>();
  const reachable = new Set<string>();
  const referencedAssets = new Set<string>();

  if (!project.nodes[project.startNodeId]) {
    issues.push({
      severity: 'error',
      code: 'missing-start-node',
      message: `Start node "${project.startNodeId}" does not exist.`
    });
  }

  Object.values(project.nodes).forEach((node) => {
    if (node.portraits.left) {
      referencedAssets.add(node.portraits.left);
      if (!project.assets[node.portraits.left]) {
        issues.push({
          severity: 'error',
          code: 'missing-left-asset',
          message: `Node "${node.id}" references missing left portrait "${node.portraits.left}".`,
          nodeId: node.id
        });
      }
    }

    if (node.portraits.right) {
      referencedAssets.add(node.portraits.right);
      if (!project.assets[node.portraits.right]) {
        issues.push({
          severity: 'error',
          code: 'missing-right-asset',
          message: `Node "${node.id}" references missing right portrait "${node.portraits.right}".`,
          nodeId: node.id
        });
      }
    }

    if (!node.text.trim()) {
      issues.push({
        severity: 'warning',
        code: 'empty-node-text',
        message: `Node "${node.id}" has no dialogue text.`,
        nodeId: node.id
      });
    }

    node.choices.forEach((choice) => {
      if (choiceIds.has(choice.id)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-choice-id',
          message: `Choice id "${choice.id}" is duplicated.`,
          nodeId: node.id,
          choiceId: choice.id
        });
      }
      choiceIds.add(choice.id);

      if (!choice.text.trim()) {
        issues.push({
          severity: 'warning',
          code: 'empty-choice-text',
          message: `Choice "${choice.id}" has no text.`,
          nodeId: node.id,
          choiceId: choice.id
        });
      }

      if (choice.nextNodeId && !isNodePresent(project, choice.nextNodeId)) {
        pushMissingTarget(issues, 'next', node.id, choice.id, choice.nextNodeId);
      }

      if (choice.visibilityCheck && !validSkills.has(choice.visibilityCheck.skill)) {
        issues.push({
          severity: 'error',
          code: 'invalid-visibility-skill',
          message: `Choice "${choice.id}" uses an invalid passive skill.`,
          nodeId: node.id,
          choiceId: choice.id
        });
      }

      if (choice.resolutionCheck) {
        const check = choice.resolutionCheck;
        if (!validSkills.has(check.skill)) {
          issues.push({
            severity: 'error',
            code: 'invalid-resolution-skill',
            message: `Choice "${choice.id}" uses an invalid active skill.`,
            nodeId: node.id,
            choiceId: choice.id
          });
        }

        if (!isNodePresent(project, check.failureNodeId)) {
          pushMissingTarget(issues, 'failure', node.id, choice.id, check.failureNodeId);
        }
        if (!isNodePresent(project, check.successNodeId)) {
          pushMissingTarget(issues, 'success', node.id, choice.id, check.successNodeId);
        }
        if (check.criticalSuccessNodeId && !isNodePresent(project, check.criticalSuccessNodeId)) {
          pushMissingTarget(issues, 'critical', node.id, choice.id, check.criticalSuccessNodeId);
        }
        if (!check.criticalSuccessNodeId) {
          issues.push({
            severity: 'warning',
            code: 'critical-falls-back',
            message: `Choice "${choice.id}" has no critical target and will fall back to success.`,
            nodeId: node.id,
            choiceId: choice.id
          });
        }
      }
    });

    if (!node.choices.some(choiceHasExit)) {
      issues.push({
        severity: 'error',
        code: 'dead-end-node',
        message: `Node "${node.id}" has no exit or connection to another card.`,
        nodeId: node.id
      });
    }
  });

  const stack = project.nodes[project.startNodeId] ? [project.startNodeId] : [];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (reachable.has(nodeId)) {
      continue;
    }
    reachable.add(nodeId);
    const node = project.nodes[nodeId];
    node?.choices.forEach((choice) => {
      if (choice.nextNodeId) {
        stack.push(choice.nextNodeId);
      }
      if (choice.resolutionCheck?.failureNodeId) {
        stack.push(choice.resolutionCheck.failureNodeId);
      }
      if (choice.resolutionCheck?.successNodeId) {
        stack.push(choice.resolutionCheck.successNodeId);
      }
      if (choice.resolutionCheck?.criticalSuccessNodeId) {
        stack.push(choice.resolutionCheck.criticalSuccessNodeId);
      }
    });
  }

  Object.keys(project.nodes).forEach((nodeId) => {
    if (!reachable.has(nodeId)) {
      issues.push({
        severity: 'warning',
        code: 'unreachable-node',
        message: `Node "${nodeId}" is unreachable from the start node.`,
        nodeId
      });
    }
  });

  Object.keys(project.assets).forEach((assetId) => {
    if (!referencedAssets.has(assetId)) {
      issues.push({
        severity: 'warning',
        code: 'unused-asset',
        message: `Asset "${assetId}" is not used by any node.`
      });
    }
  });

  compileRuntime(project);
  return issues;
}
