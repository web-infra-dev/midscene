import type {
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  MidsceneYamlTask,
} from '@midscene/core';
import yaml from 'js-yaml';

export function buildYaml(
  env: MidsceneYamlScriptEnv,
  tasks: MidsceneYamlTask[],
) {
  const result: MidsceneYamlScript = {
    target: env,
    tasks,
  };

  return yaml.dump(result, {
    indent: 2,
  });
}
