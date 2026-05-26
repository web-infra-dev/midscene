import { join, resolve } from 'node:path';
import { TaskExecutor } from '@/agent';
import { buildYamlFlowFromPlans } from '@/common';
import { actionTapParamSchema } from '@/device';
import type { DeviceAction, PlanningAction } from '@/types';
import { describe, expect, it, vi } from 'vitest';

const fixtureFile = join(__dirname, 'ai-act-file-upload-tap.test.ts');
type TestFileChooserHandler = (chooser: {
  accept(files: string[]): Promise<void>;
}) => Promise<void>;

describe('aiAct Tap fileChooserAccept', () => {
  it('should keep fileChooserAccept in generated yaml flow', () => {
    const plans: PlanningAction[] = [
      {
        type: 'Tap',
        thought: 'upload id card',
        param: {
          locate: { prompt: 'the id card upload button' },
          fileChooserAccept: './fixtures/id-card.png',
        },
      },
    ];
    const actionSpace = [
      {
        name: 'Tap',
        description: 'Tap the element',
        interfaceAlias: 'aiTap',
        paramSchema: actionTapParamSchema,
        call: vi.fn(),
      },
    ] as unknown as DeviceAction[];

    expect(buildYamlFlowFromPlans(plans, actionSpace)).toEqual([
      {
        aiTap: '',
        locate: 'the id card upload button',
        fileChooserAccept: './fixtures/id-card.png',
      },
    ]);
  });

  it('should accept files when executing a planned Tap action', async () => {
    let fileChooserHandler: TestFileChooserHandler | undefined;
    const dispose = vi.fn();
    const acceptedFiles: string[][] = [];
    const triggerFileChooser = async () => {
      await fileChooserHandler?.({
        accept: async (files: string[]) => {
          acceptedFiles.push(files);
        },
      });
    };
    const actionCall = vi.fn(async () => {});

    const mockInterface = {
      interfaceType: 'playwright',
      registerFileChooserListener: vi.fn(
        async (handler: TestFileChooserHandler) => {
          fileChooserHandler = handler;
          return {
            dispose: () => {
              fileChooserHandler = undefined;
              dispose();
            },
            getError: () => undefined,
          };
        },
      ),
      afterInvokeAction: vi.fn(async () => {
        await triggerFileChooser();
      }),
      actionSpace: () => [
        {
          name: 'Tap',
          description: 'Tap the element',
          interfaceAlias: 'aiTap',
          paramSchema: actionTapParamSchema,
          delayBeforeRunner: 0,
          delayAfterRunner: 0,
          call: actionCall,
        },
      ],
    } as any;

    const taskExecutor = new TaskExecutor(mockInterface, {} as any, {
      actionSpace: mockInterface.actionSpace(),
    });

    const plans: PlanningAction[] = [
      {
        type: 'Tap',
        thought: 'upload id card',
        param: {
          locate: { prompt: 'the id card upload button' },
          fileChooserAccept: fixtureFile,
        },
      },
    ];

    const { tasks } = await (taskExecutor as any).convertPlanToExecutable(
      plans,
    );
    const tapTask = tasks[tasks.length - 1];
    tapTask.param.locate = {
      id: 'upload',
      center: [100, 200],
      rect: { left: 90, top: 190, width: 20, height: 20 },
    };

    await tapTask.executor(tapTask.param, {
      task: { timing: {} },
      uiContext: {
        shrunkShotToLogicalRatio: 1,
      },
    });

    expect(mockInterface.registerFileChooserListener).toHaveBeenCalledTimes(1);
    expect(actionCall).toHaveBeenCalledTimes(1);
    expect(mockInterface.afterInvokeAction).toHaveBeenCalledTimes(1);
    expect(acceptedFiles).toEqual([[resolve(fixtureFile)]]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
