import assert from 'node:assert';
import yaml from 'js-yaml';

import type { MidsceneYamlScript } from '@midscene/core';
import type {
  MidsceneYamlFlowItem,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemSleep,
} from '@midscene/core';

function interpolateEnvVars(content: string): string {
  return content.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const value = process.env[envVar.trim()];
    if (value === undefined) {
      throw new Error(`Environment variable "${envVar.trim()}" is not defined`);
    }
    return value;
  });
}

export function parseYamlScript(
  content: string,
  filePath?: string,
): MidsceneYamlScript {
  const interpolatedContent = interpolateEnvVars(content);
  const obj = yaml.load(interpolatedContent) as MidsceneYamlScript;
  const pathTip = filePath ? `, failed to load ${filePath}` : '';
  assert(obj.target, `property "target" is required in yaml script${pathTip}`);
  assert(
    typeof obj.target === 'object',
    `property "target" must be an object${pathTip}`,
  );
  assert(
    typeof obj.target.url === 'string',
    `property "target.url" must be provided in yaml script: ${pathTip}`,
  );
  assert(obj.tasks, `property "tasks" is required in yaml script${pathTip}`);
  assert(
    Array.isArray(obj.tasks),
    `property "tasks" must be an array${pathTip}`,
  );
  return obj;
}

export const flowItemBrief = (flowItem?: MidsceneYamlFlowItem) => {
  if (!flowItem) {
    return '';
  }

  const sliceText = (text?: string) => {
    const lengthLimit = 60;
    if (text && text.length > lengthLimit) {
      return `${text.slice(0, lengthLimit)}...`;
    }

    return text || '';
  };

  if (
    (flowItem as MidsceneYamlFlowItemAIAction).aiAction ||
    (flowItem as MidsceneYamlFlowItemAIAction).ai
  ) {
    const lastTip = (
      (flowItem as MidsceneYamlFlowItemAIAction).aiActionProgressTips || []
    ).at(-1);
    return `aiAction: ${sliceText(
      lastTip ||
        (flowItem as MidsceneYamlFlowItemAIAction).aiAction ||
        (flowItem as MidsceneYamlFlowItemAIAction).ai,
    )}`;
  }
  if ((flowItem as MidsceneYamlFlowItemAIAssert).aiAssert) {
    return `aiAssert: ${sliceText(
      (flowItem as MidsceneYamlFlowItemAIAssert).aiAssert,
    )}`;
  }
  if ((flowItem as MidsceneYamlFlowItemAIQuery).aiQuery) {
    return `aiQuery: ${sliceText((flowItem as MidsceneYamlFlowItemAIQuery).aiQuery)}`;
  }
  if ((flowItem as MidsceneYamlFlowItemAIWaitFor).aiWaitFor) {
    return `aiWaitFor: ${sliceText(
      (flowItem as MidsceneYamlFlowItemAIWaitFor).aiWaitFor,
    )}`;
  }
  if ((flowItem as MidsceneYamlFlowItemSleep).sleep) {
    return `sleep: ${(flowItem as MidsceneYamlFlowItemSleep).sleep}`;
  }
  return '';
};
