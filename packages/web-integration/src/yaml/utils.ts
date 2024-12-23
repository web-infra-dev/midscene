import assert from 'node:assert';
import yaml from 'js-yaml';

import type { MidsceneYamlScript } from '@midscene/core';

export function loadYamlScript(
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
