import type {
  ExecutionTaskAction,
  ExecutionTaskPlanningLocate,
  IExecutionDump,
  ServiceDump,
} from '@midscene/core';
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

function createLocateTask(): ExecutionTaskPlanningLocate {
  const serviceDump = {
    type: 'locate',
    taskInfo: {
      durationMs: 100,
      searchArea: { left: 10, top: 20, width: 300, height: 200 },
    },
  } as ServiceDump;

  return {
    type: 'Planning',
    subType: 'Locate',
    taskId: 'locate-1',
    status: 'finished',
    executor: () => undefined,
    param: {
      prompt: 'settings',
      deepLocate: true,
    },
    output: {
      element: {
        description: 'settings',
        center: [80, 100],
        rect: { left: 70, top: 90, width: 20, height: 20 },
      } as any,
    },
    log: {
      dump: serviceDump,
    } as any,
    uiContext: {
      shotSize: { width: 720, height: 1280 },
      screenshot: { base64: 'frame-locate' },
      shrunkShotToLogicalRatio: 1,
    } as any,
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

  it('keeps deepLocate search area overlays from wrapped service dumps', () => {
    const execution = {
      name: 'search-area-regression',
      tasks: [createLocateTask()],
    } as IExecutionDump;

    const scripts = generateAnimationScripts(execution, -1, 720, 1280);
    const insightScript = scripts?.find((script) => script.type === 'insight');

    expect(insightScript?.searchArea).toEqual({
      left: 10,
      top: 20,
      width: 300,
      height: 200,
    });
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
