import { basename, dirname, relative } from 'node:path';
import chalk from 'chalk';
import type {
  MidsceneYamlFileContext,
  MidsceneYamlFlowItem,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemSleep,
  ScriptPlayerStatusValue,
  ScriptPlayerTaskStatus,
} from './types';

export const isTTY = process.env.MIDSCENE_CLI_LOG_ON_NON_TTY
  ? false
  : process.stdout.isTTY;
export const indent = '  ';
export const spinnerInterval = 80;
export const spinnerFrames = ['◰', '◳', '◲', '◱']; // https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json
export const currentSpinningFrame = () => {
  return spinnerFrames[
    Math.floor(Date.now() / spinnerInterval) % spinnerFrames.length
  ];
};

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

// status: init / running / done / error
function textForStatus(status: ScriptPlayerStatusValue) {
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
  const fileName = basename(filePath);
  const fileDir = dirname(filePath);
  const fileNameToPrint = `${chalk.gray(`${fileDir}/`)}${fileName}`;
  const fileStatusText = textForStatus(context.player.status);
  const contextActionText =
    typeof context.player.currentTaskIndex === 'undefined' &&
    context.player.status === 'running'
      ? chalk.gray('(navigating)')
      : '';

  // output: ...
  const outputFile = context.player.output;
  const outputText =
    outputFile && Object.keys(context.player.result || {}).length > 0
      ? `\n${indent}${chalk.gray(`output: ${outputFile}`)}`
      : '';

  // report: ...
  const reportFile = context.player.reportFile;
  const reportFileToShow = relative(process.cwd(), reportFile || '');
  const reportText = reportFile
    ? `\n${indent}${chalk.gray(`report: ./${reportFileToShow}`)}`
    : '';

  const mergedText =
    `${fileStatusText} ${fileNameToPrint} ${contextActionText}${outputText}${reportText}`.trim();

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
      const currentFlowItem = task.flow[task.currentStep];
      const taskBrief = currentFlowItem && flowItemBrief(currentFlowItem);
      const actionText = taskBrief ? `, ${taskBrief}` : '';
      stepText = chalk.gray(
        `(step ${task.currentStep + 1}/${task.totalSteps}${actionText})`.trim(),
      );
    } else {
      stepText = chalk.gray('(unknown step)');
    }
  }

  const errorText =
    task.status === 'error'
      ? `\n${indent}${chalk.gray('error:')}\n${indent}${indent}${task.error?.message}`
      : '';

  const statusText = textForStatus(task.status);
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
  taskStatus: ScriptPlayerTaskStatus[],
  context: MidsceneYamlFileContext,
) => {
  const prefixLines: string[] = [];
  const currentLine: string[] = [];
  const suffixText: string[] = [];
  const { mergedText: fileInfo } = contextInfo(context);
  for (const task of taskStatus) {
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
  const currentLineText =
    currentLine.length > 0 ? `\n${paddingLines(currentLine).join('\n')}` : '';
  const prefix =
    prefixLines.length > 0 ? `\n${paddingLines(prefixLines).join('\n')}` : '';
  const suffix =
    suffixText.length > 0 ? `\n${paddingLines(suffixText).join('\n')}` : '';
  return `${fileInfo}${prefix}${currentLineText}${suffix}`;
};
