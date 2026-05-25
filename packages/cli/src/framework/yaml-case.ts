import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  MidsceneYamlScript,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptEnv,
  MidsceneYamlScriptIOSEnv,
  MidsceneYamlScriptWebEnv,
  ScriptPlayerTaskStatus,
} from '@midscene/core';
import { type ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import merge from 'lodash.merge';
import { createYamlPlayer } from '../create-yaml-player';

export interface RunYamlCaseGlobalConfig {
  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
  ios?: MidsceneYamlScriptIOSEnv;
  target?: MidsceneYamlScriptWebEnv;
}

export interface RunYamlCaseOptions {
  file: string;
  executionConfig?: MidsceneYamlScript;
  globalConfig?: RunYamlCaseGlobalConfig;
  headed?: boolean;
  keepWindow?: boolean;
}

export interface RunYamlCaseResult {
  file: string;
  output?: string;
  report?: string | null;
  duration: number;
}

const taskErrorMessage = (task: ScriptPlayerTaskStatus): string | undefined => {
  if (task.error?.message) {
    return task.error.message;
  }

  if (task.status === 'error') {
    return `Task "${task.name}" failed`;
  }

  return undefined;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeTargetConfig = (
  config: MidsceneYamlScript | RunYamlCaseGlobalConfig,
) => {
  if (config.target) {
    config.web = {
      ...config.target,
      ...config.web,
    };
    config.target = undefined;
  }
};

const createExecutionConfig = (
  file: string,
  globalConfig: RunYamlCaseGlobalConfig,
): MidsceneYamlScript => {
  const content = readFileSync(file, 'utf8');
  const fileConfig = cloneJson(parseYamlScript(content, file));
  normalizeTargetConfig(fileConfig);

  const clonedGlobalConfig = cloneJson(globalConfig);
  normalizeTargetConfig(clonedGlobalConfig);

  return merge(fileConfig, clonedGlobalConfig);
};

export const getYamlPlayerFailure = (
  player: ScriptPlayer<MidsceneYamlScriptEnv>,
): Error | undefined => {
  if (player.errorInSetup) {
    return player.errorInSetup;
  }

  const failedMessages =
    player.taskStatusList?.map(taskErrorMessage).filter(Boolean) || [];

  if (player.status === 'error' || failedMessages.length > 0) {
    const details = failedMessages.length
      ? failedMessages.join('; ')
      : 'YAML case failed';
    const reportLine = player.reportFile
      ? `\nReport: ${player.reportFile}`
      : '';
    const outputLine = player.output ? `\nOutput: ${player.output}` : '';
    return new Error(`${details}${reportLine}${outputLine}`);
  }

  return undefined;
};

export async function runYamlCase(
  options: RunYamlCaseOptions,
): Promise<RunYamlCaseResult> {
  const file = resolve(options.file);
  const startTime = Date.now();
  const executionConfig =
    options.executionConfig ||
    (options.globalConfig
      ? createExecutionConfig(file, options.globalConfig)
      : undefined);
  const player = await createYamlPlayer(file, executionConfig, {
    headed: options.headed,
    keepWindow: options.keepWindow,
  });

  await player.run();

  const failure = getYamlPlayerFailure(player);
  if (failure) {
    throw failure;
  }

  return {
    file,
    output: player.output || undefined,
    report: player.reportFile,
    duration: Date.now() - startTime,
  };
}
