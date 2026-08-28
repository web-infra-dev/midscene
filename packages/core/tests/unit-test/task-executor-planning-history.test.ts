import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/workflows/planning', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/workflows/planning')>();
  return {
    ...actual,
    standardPlan: vi.fn(),
  };
});

import { TaskExecutor } from '@/agent/tasks';
import { getModelRuntime } from '@/ai-model/models';
import { standardPlan } from '@/ai-model/workflows/planning';
import { ConversationHistory } from '@/ai-model/workflows/planning/conversation-history';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { AiActEffort, DeviceAction, ExecutionTaskApply } from '@/types';
import type Service from '../../src';

const validBase64Image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const planningModel = () =>
  getModelRuntime({
    modelName: 'planning-model',
    modelDescription: 'planning-model',
    intent: 'planning',
    slot: 'planning',
  });

const defaultModel = () =>
  getModelRuntime({
    modelName: 'default-model',
    modelDescription: 'default-model',
    intent: 'default',
    slot: 'default',
  });

describe('TaskExecutor planning history', () => {
  let taskExecutor: TaskExecutor;

  beforeEach(() => {
    const actionSpace: DeviceAction[] = [
      {
        name: 'Noop',
        description: 'noop',
        call: async () => undefined,
      },
    ];
    const mockInterface = {
      interfaceType: 'web',
      actionSpace: vi.fn().mockReturnValue(actionSpace),
    } as unknown as AbstractInterface;
    const mockService = {
      contextRetrieverFn: vi.fn().mockResolvedValue({
        screenshot: ScreenshotItem.create(validBase64Image, Date.now()),
        shotSize: { width: 1920, height: 1080 },
        shrunkShotToLogicalRatio: 1,
        tree: {
          id: 'root',
          attributes: {},
          children: [],
        },
      }),
    } as unknown as Service;

    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runTwoPlanningRounds(options: {
    actionExecutor: ExecutionTaskApply['executor'];
    effort?: AiActEffort;
  }): Promise<string> {
    let planningRound = 0;
    let historySeenBySecondRound = '';
    vi.mocked(standardPlan).mockImplementation(
      async (_instruction, planOptions) => {
        planningRound += 1;
        if (planningRound === 1) {
          if (options.effort === 'deepThink') {
            planOptions.conversationHistory.setSubGoals([
              {
                index: 1,
                status: 'pending',
                description: 'Complete the action',
              },
            ]);
          }
          return {
            actions: [{ type: 'Noop' }],
            log: 'Performed the planned action',
            shouldContinuePlanning: true,
          };
        }

        planOptions.conversationHistory.resetPendingFeedbackMessageIfExists();
        historySeenBySecondRound =
          options.effort === 'deepThink'
            ? planOptions.conversationHistory.subGoalsToText()
            : planOptions.conversationHistory.historicalLogsToText();
        return {
          actions: [],
          log: '',
          shouldContinuePlanning: false,
          finalizeSuccess: true,
        };
      },
    );

    vi.spyOn(taskExecutor, 'convertPlanToExecutable')
      .mockResolvedValueOnce({
        tasks: [
          {
            type: 'Action Space',
            subType: 'Noop',
            executor: options.actionExecutor,
          },
        ],
        yamlFlow: [],
      } as never)
      .mockResolvedValueOnce({
        tasks: [],
        yamlFlow: [],
      } as never);

    await taskExecutor.action(
      'perform the action',
      planningModel(),
      defaultModel(),
      undefined,
      undefined,
      undefined,
      options.effort,
    );

    return historySeenBySecondRound;
  }

  it('commits a planning log after successful action execution', async () => {
    const history = await runTwoPlanningRounds({
      actionExecutor: async () => undefined,
    });

    expect(history).toContain('Performed the planned action');
    expect(history.match(/Performed the planned action/g)).toHaveLength(1);
  });

  it('does not commit a planning log when action execution fails', async () => {
    const appendLog = vi.spyOn(
      ConversationHistory.prototype,
      'appendHistoricalLog',
    );
    vi.mocked(standardPlan).mockResolvedValue({
      actions: [{ type: 'Noop' }],
      log: 'Performed the planned action',
      shouldContinuePlanning: false,
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [
        {
          type: 'Action Space',
          subType: 'Noop',
          executor: async () => {
            throw new Error('action failed');
          },
        },
      ],
      yamlFlow: [],
    } as never);

    await taskExecutor.action(
      'perform the action',
      planningModel(),
      defaultModel(),
    );

    expect(appendLog).not.toHaveBeenCalled();
  });

  it('does not commit a planning log when no action is executable', async () => {
    const appendLog = vi.spyOn(
      ConversationHistory.prototype,
      'appendHistoricalLog',
    );
    vi.mocked(standardPlan).mockResolvedValue({
      actions: [],
      log: 'No action was performed',
      shouldContinuePlanning: false,
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as never);

    await taskExecutor.action(
      'perform the action',
      planningModel(),
      defaultModel(),
    );

    expect(appendLog).not.toHaveBeenCalled();
  });

  it('commits successful deepThink logs to the running sub-goal', async () => {
    const history = await runTwoPlanningRounds({
      actionExecutor: async () => undefined,
      effort: 'deepThink',
    });

    expect(history).toContain(
      'Actions performed for current sub-goal:\n- Performed the planned action',
    );
  });
});
