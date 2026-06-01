import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  MidsceneYamlConfigResult,
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
  web?: Partial<MidsceneYamlScriptWebEnv>;
  android?: Partial<MidsceneYamlScriptAndroidEnv>;
  ios?: Partial<MidsceneYamlScriptIOSEnv>;
  target?: Partial<MidsceneYamlScriptWebEnv>;
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

export const createYamlCaseResult = (
  file: string,
  player: ScriptPlayer<MidsceneYamlScriptEnv>,
  duration: number,
): MidsceneYamlConfigResult => {
  const hasFailedTasks =
    player.taskStatusList?.some((task) => task.status === 'error') ?? false;
  const hasPlayerError = player.status === 'error';

  const outputPath =
    player.output && existsSync(player.output) ? player.output : undefined;
  const reportFile = player.reportFile || undefined;

  let errorMessage: string | undefined;
  if (player.errorInSetup?.message) {
    errorMessage = player.errorInSetup.message;
  } else if (hasPlayerError || hasFailedTasks) {
    const taskErrors = player.taskStatusList
      ?.filter((task) => task.status === 'error' && task.error?.message)
      .map((task) => task.error!.message);
    if (taskErrors && taskErrors.length > 0) {
      errorMessage = taskErrors.join('; ');
    } else if (hasPlayerError) {
      errorMessage = 'Execution failed';
    } else {
      errorMessage = 'Some tasks failed';
    }
  }

  const resultType = hasPlayerError
    ? 'failed'
    : hasFailedTasks
      ? 'partialFailed'
      : 'success';

  return {
    file,
    success: resultType === 'success',
    executed: true,
    output: outputPath,
    report: reportFile,
    duration,
    resultType,
    error: errorMessage,
  };
};

export const createYamlCaseFailure = (
  result: MidsceneYamlConfigResult,
): Error => {
  const reportLine = result.report ? `\nReport: ${result.report}` : '';
  const outputLine = result.output ? `\nOutput: ${result.output}` : '';
  return new Error(
    `${result.error || 'YAML case failed'}${reportLine}${outputLine}`,
  );
};

export async function runYamlCaseResult(
  options: RunYamlCaseOptions,
): Promise<MidsceneYamlConfigResult> {
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

  return createYamlCaseResult(file, player, Date.now() - startTime);
}

export async function runYamlCase(
  options: RunYamlCaseOptions,
): Promise<RunYamlCaseResult> {
  const result = await runYamlCaseResult(options);
  if (!result.success) {
    throw createYamlCaseFailure(result);
  }

  return {
    file: result.file,
    output: result.output || undefined,
    report: result.report,
    duration: result.duration || 0,
  };
}
