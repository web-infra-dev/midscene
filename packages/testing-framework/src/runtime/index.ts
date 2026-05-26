import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { MidsceneFrameworkConfig } from '../types';
import { setupFrameworkAgent } from './setup';
import { createYamlFrameworkTestSource } from './source';
import {
  normalizeYamlCase,
  runBuiltinYamlCase,
  runYamlFlowWithCustomSteps,
} from './yaml';

export { createYamlFrameworkTestSource } from './source';
export {
  normalizeYamlCase,
  runBuiltinYamlCase,
  runYamlFlowWithCustomSteps,
} from './yaml';
export { createDefaultSetup, setupFrameworkAgent } from './setup';

const caseNameFromPath = (filePath: string): string =>
  basename(filePath, extname(filePath)) || 'case';

export async function runYamlFrameworkCase(options: {
  config: MidsceneFrameworkConfig;
  configPath?: string;
  filePath: string;
}): Promise<void> {
  const content = await readFile(options.filePath, 'utf8');
  const normalizedCase = normalizeYamlCase(content, options.filePath);
  const setupResult = await setupFrameworkAgent(options.config);

  try {
    if (options.config.yamlSteps) {
      const state: Record<string, unknown> = {};
      for (const task of normalizedCase.tasks) {
        await runYamlFlowWithCustomSteps({
          agent: setupResult.agent,
          filePath: options.filePath,
          caseName: task.name || caseNameFromPath(options.filePath),
          flow: task.flow,
          yamlSteps: options.config.yamlSteps,
          state,
        });
      }
      return;
    }

    await runBuiltinYamlCase({
      agent: setupResult.agent,
      normalizedCase,
      config: options.config,
    });
  } finally {
    await setupResult.teardown?.();
  }
}
