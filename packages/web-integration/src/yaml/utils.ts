import { assert } from '@midscene/shared/utils';
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
  ignoreCheckingTarget?: boolean,
): MidsceneYamlScript {
  const interpolatedContent = interpolateEnvVars(content);
  const obj = yaml.load(interpolatedContent) as MidsceneYamlScript;
  const pathTip = filePath ? `, failed to load ${filePath}` : '';
  if (!ignoreCheckingTarget) {
    assert(
      obj.target,
      `property "target" is required in yaml script${pathTip}`,
    );
    assert(
      typeof obj.target === 'object',
      `property "target" must be an object${pathTip}`,
    );
  }
  assert(obj.tasks, `property "tasks" is required in yaml script ${pathTip}`);
  assert(
    Array.isArray(obj.tasks),
    `property "tasks" must be an array in yaml script, but got ${obj.tasks}`,
  );
  return obj;
}
