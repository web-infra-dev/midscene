import type { ExecutionTaskAction, IExecutionDump } from '@midscene/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/core/agent', () => ({
  paramStr: () => '',
  typeStr: (task: { type: string }) => task.type,
}));

import {
  allScriptsFromDump,
  generateAnimationScripts,
} from '../src/utils/replay-scripts';

function createActionTask({
  height,
  screenshot,
  taskId,
  width,
}: {
  height: number;
  screenshot: string;
  taskId: string;
  width: number;
}): ExecutionTaskAction {
  return {
    type: 'Action Space',
    subType: 'Sleep',
    taskId,
    status: 'finished',
    executor: () => undefined,
    recorder: [{ screenshot: { base64: screenshot } }] as NonNullable<
      ExecutionTaskAction['recorder']
    >,
    uiContext: {
      shotSize: {
        width,
        height,
      },
    } as ExecutionTaskAction['uiContext'],
  };
}

describe('generateAnimationScripts', () => {
  it('uses each task shotSize when building full-page camera frames', () => {
    const execution = {
      name: 'camera-size-regression',
      tasks: [
        createActionTask({
          taskId: 'task-1',
          screenshot: 'frame-1',
          width: 720,
          height: 1280,
        }),
        createActionTask({
          taskId: 'task-2',
          screenshot: 'frame-2',
          width: 1080,
          height: 2400,
        }),
      ],
    } as IExecutionDump;

    const scripts = generateAnimationScripts(execution, -1, 720, 1280);
    const imageScripts = scripts?.filter(
      (script) => script.type === 'img' && script.taskId,
    );

    expect(imageScripts).toHaveLength(2);
    expect(imageScripts?.[0].imageWidth).toBe(720);
    expect(imageScripts?.[0].camera?.width).toBe(720);
    expect(imageScripts?.[1].imageWidth).toBe(1080);
    expect(imageScripts?.[1].camera?.width).toBe(1080);
  });
});

describe('allScriptsFromDump', () => {
  it('orders grouped executions by logTime before generating replay scripts', () => {
    const dump = {
      sdkVersion: 'test',
      groupName: 'group',
      modelBriefs: [],
      executions: [
        {
          logTime: 200,
          name: 'later',
          tasks: [
            createActionTask({
              taskId: 'later-task',
              screenshot: 'later-frame',
              width: 720,
              height: 1280,
            }),
          ],
        },
        {
          logTime: 100,
          name: 'earlier',
          tasks: [
            createActionTask({
              taskId: 'earlier-task',
              screenshot: 'earlier-frame',
              width: 720,
              height: 1280,
            }),
          ],
        },
      ],
    };

    const scripts = allScriptsFromDump(dump as any)?.scripts || [];
    const imageTaskIds = scripts
      .filter((script) => script.type === 'img' && script.taskId)
      .map((script) => script.taskId);

    expect(imageTaskIds).toEqual(['earlier-task', 'later-task']);
  });
});
