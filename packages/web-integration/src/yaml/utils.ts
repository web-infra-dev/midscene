import { assert } from '@midscene/shared/utils';
import yaml from 'js-yaml';

import type { MidsceneYamlScript } from '@midscene/core';

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
  const android = obj.android === null ? {} : obj.android; // deal with the case that user configures android, but not configures specific parameters
  const web = obj.web || obj.target; // no need to handle null case, because web has required parameters url

  if (!ignoreCheckingTarget) {
    // make sure at least one of target/web/android is provided
    assert(
      web || android,
      `at least one of "target", "web", or "android" properties is required in yaml script${pathTip}`,
    );

    // make sure only one of target/web/android is provided
    assert(
      (web && !android) || (!web && android),
      `only one of "target", "web", or "android" properties is allowed in yaml script${pathTip}`,
    );

    // make sure the config is valid
    if (web || android) {
      assert(
        typeof web === 'object' || typeof android === 'object',
        `property "target/web/android" must be an object${pathTip}`,
      );
    }
  }

  assert(obj.tasks, `property "tasks" is required in yaml script ${pathTip}`);
  assert(
    Array.isArray(obj.tasks),
    `property "tasks" must be an array in yaml script, but got ${obj.tasks}`,
  );
  return obj;
}
