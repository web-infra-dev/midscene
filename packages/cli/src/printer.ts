import { basename, dirname, relative } from 'node:path';
import type {
  MidsceneYamlScriptEnv,
  ScriptPlayerStatusValue,
  ScriptPlayerTaskStatus,
} from '@midscene/core';
import type { ScriptPlayer } from '@midscene/core/yaml';
import chalk from 'chalk';

export interface MidsceneYamlFileContext {
  file: string;
  player: ScriptPlayer<MidsceneYamlScriptEnv>;
}

/**
 * Decide whether the interactive (spinner / in-place redraw) renderer is safe
 * to use. Besides a real TTY, we honor well-known "I'm not an interactive
 * terminal" signals so that CI pipelines and Kubernetes pods do not get their
 * stream-based log collectors (Fluentd / Filebeat) flooded with raw
 * `\x1b[1A\x1b[2K` cursor-control sequences.
 *
 * - `MIDSCENE_CLI_LOG_ON_NON_TTY`: explicit opt-out (existing flag).
 * - `NO_COLOR`: https://no-color.org convention.
 * - `TERM=dumb`: terminal that cannot handle cursor movement.
 * - `CI`: generic CI flag set by virtually every CI provider; relevant when the
 *   environment still allocates a pseudo-TTY (e.g. `kubectl exec -t`).
 */
export function resolveIsTTY(
  env: NodeJS.ProcessEnv = process.env,
  stdoutIsTTY: boolean | undefined = process.stdout.isTTY,
): boolean {
  if (
    env.MIDSCENE_CLI_LOG_ON_NON_TTY ||
    env.NO_COLOR ||
    env.TERM === 'dumb' ||
    env.CI
  ) {
    return false;
  }
  return Boolean(stdoutIsTTY);
}

export const isTTY = resolveIsTTY();
export const indent = '  ';
export const spinnerInterval = 80;
export const spinnerFrames = ['◰', '◳', '◲', '◱']; // https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json
export const currentSpinningFrame = () => {
  return spinnerFrames[
    Math.floor(Date.now() / spinnerInterval) % spinnerFrames.length
  ];
};

// status: init / running / done / error
function indicatorForStatus(status: ScriptPlayerStatusValue) {
  if (status === 'init') {
    return chalk.gray('◌');
  }
  if (status === 'running') {
    return chalk.yellowBright(currentSpinningFrame());
  }
  if (status === 'done') {
    return chalk.green('✔︎');
  }
  if (status === 'error') {
    return chalk.red('✘');
  }
}

export const contextInfo = (context: MidsceneYamlFileContext) => {
  const filePath = context.file;
  const filePathToShow = relative(process.cwd(), filePath);
  const fileNameToPrint = `${chalk.gray(`${filePathToShow}`)}`;
  const fileStatusText = indicatorForStatus(context.player.status);
  const contextActionText =
    typeof context.player.currentTaskIndex === 'undefined' &&
    context.player.status === 'running'
      ? chalk.gray('(navigating)')
      : '';

  // error: ...
  const errorText = context.player.errorInSetup
    ? `\n${indent}${chalk.red('error:')} ${context.player.errorInSetup?.message}\n${indent}${indent}${context.player.errorInSetup?.stack}`
    : '';

  // output: ...
  const outputFile = context.player.output;
  const outputText =
    outputFile && Object.keys(context.player.result || {}).length > 0
      ? `\n${indent}${chalk.gray(`output: ${outputFile}`)}`
      : '';

  // report: ...
  const reportFile = context.player.reportFile;
  const reportText = reportFile
    ? `\n${indent}${chalk.gray(`report: ${reportFile}`)}`
    : '';

  // agent status: ...
  const agentStatusTip = context.player.agentStatusTip;
  const agentStatusText = agentStatusTip
    ? `\n${indent}${chalk.gray(`agent status: ${agentStatusTip}`)}`
    : '';

  const mergedText =
    `${fileStatusText} ${fileNameToPrint} ${contextActionText}${outputText}${reportText}${errorText}${agentStatusText}`.trim();

  return {
    fileNameToPrint,
    fileStatusText,
    contextActionText,
    outputText,
    reportText,
    mergedText,
  };
};

export const singleTaskInfo = (task: ScriptPlayerTaskStatus) => {
  let stepText = '';
  if (task.status === 'init') {
    stepText = '';
  } else if (task.status === 'running' || task.status === 'error') {
    if (typeof task.currentStep === 'undefined') {
      stepText = chalk.gray('(navigating)');
    } else if (typeof task.currentStep === 'number') {
      const actionText = ''; // taskBrief ? `, ${taskBrief}` : '';
      stepText = chalk.gray(
        `(task ${task.currentStep + 1}/${task.totalSteps}${actionText})`.trim(),
      );
    } else {
      stepText = chalk.gray('(unknown task)');
    }
  }

  const errorText =
    task.status === 'error'
      ? `\n${indent}${chalk.gray('error:')}\n${indent}${indent}${task.error?.message}`
      : '';

  const statusText = indicatorForStatus(task.status);
  const mergedLine = `${statusText} ${task.name} ${stepText}${errorText}`;
  return {
    nameText: task.name,
    stepText,
    errorText,
    itemStatusText: statusText,
    mergedLine,
  };
};

function paddingLines(lines: string[]) {
  return lines.map((line) => {
    return `${indent}${line}`;
  });
}

export const contextTaskListSummary = (
  taskStatusArray: ScriptPlayerTaskStatus[],
  context: MidsceneYamlFileContext,
) => {
  const prefixLines: string[] = [];
  const currentLine: string[] = [];
  const suffixText: string[] = [];
  const { mergedText: fileInfo } = contextInfo(context);
  if (!context.player.errorInSetup) {
    for (const task of taskStatusArray) {
      const { mergedLine } = singleTaskInfo(task);

      if (context.player.status === 'init') {
        suffixText.push(mergedLine);
      } else if (context.player.status === 'running') {
        currentLine.push(mergedLine);
      } else if (context.player.status === 'done') {
        prefixLines.push(mergedLine);
      } else if (context.player.status === 'error') {
        prefixLines.push(mergedLine);
      }
    }
  }
  const lines: string[] = [fileInfo];
  if (prefixLines.length > 0) lines.push(...paddingLines(prefixLines));
  if (currentLine.length > 0) lines.push(...paddingLines(currentLine));
  if (suffixText.length > 0) lines.push(...paddingLines(suffixText));
  return lines.join('\n');
};
