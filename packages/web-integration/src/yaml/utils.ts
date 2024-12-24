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

export function parseYamlScript(
  content: string,
  filePath?: string,
): MidsceneYamlScript {
  const obj = yaml.load(content) as MidsceneYamlScript;
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
    return `aiAction: ${sliceText(
      (flowItem as MidsceneYamlFlowItemAIAction).aiActionProgressTip ||
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
