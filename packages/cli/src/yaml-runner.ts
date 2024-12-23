import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

import {
  ScriptPlayer,
  type ScriptPlayerOptions,
  loadYamlScript,
} from '@midscene/web';
import {
  contextInfo,
  contextTaskListSummary,
  isTTY,
  singleTaskInfo,
  spinnerInterval,
} from './printer';
import { TTYWindowRenderer } from './tty-renderer';

interface MidsceneYamlFileContext {
  file: string;
  player: ScriptPlayer;
}

export const defaultUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
export const defaultViewportWidth = 1280;
export const defaultViewportHeight = 960;
export const defaultViewportScale = process.platform === 'darwin' ? 2 : 1;
export const defaultWaitForNetworkIdleTimeout = 10 * 1000;

let ttyRenderer: TTYWindowRenderer | undefined;
export async function playYamlFiles(
  files: string[],
  options?: ScriptPlayerOptions,
): Promise<boolean> {
  // prepare
  const fileContextList: MidsceneYamlFileContext[] = [];
  for (const file of files) {
    const script = loadYamlScript(readFileSync(file, 'utf-8'), file);
    const fileName = basename(file, extname(file));
    const player = new ScriptPlayer(script, {
      ...options,
      testId: fileName,
      onTaskStatusChange: (taskStatus) => {
        if (!isTTY) {
          const { nameText } = singleTaskInfo(taskStatus);
          // console.log(`${taskStatus.status} - ${nameText}`);
        }
      },
    });
    fileContextList.push({ file, player });
  }

  // play
  if (isTTY) {
    const summaryContents = () => {
      const summary: string[] = [''];
      for (const context of fileContextList) {
        summary.push(
          contextTaskListSummary(context.player.taskStatus, context),
        );
      }
      summary.push('');
      return summary;
    };
    ttyRenderer = new TTYWindowRenderer({
      outputStream: process.stdout,
      errorStream: process.stderr,
      getWindow: summaryContents,
      interval: spinnerInterval,
    });

    ttyRenderer.start();
    for (const context of fileContextList) {
      await context.player.run();
    }
    ttyRenderer.stop();
  } else {
    for (const context of fileContextList) {
      const { mergedText } = contextInfo(context);
      console.log(mergedText);
      await context.player.run();
      console.log(contextTaskListSummary(context.player.taskStatus, context));
    }
  }

  const ifFail = fileContextList.some((task) => task.player.status === 'error');
  return !ifFail;
}
