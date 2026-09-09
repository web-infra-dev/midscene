import { Agent } from '@/agent';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
import { prepareUserPrompt } from '@/ai-model/shared/multimodal-prompt';
import { AiLocateElement } from '@/ai-model/workflows/grounding';
import { standardPlan } from '@/ai-model/workflows/planning';
import {
  type PlanningAblationPart,
  parsePlanningAblation,
  resolvePlanningFeatures,
} from '@/ai-model/workflows/planning/ablation';
import { ConversationHistory } from '@/ai-model/workflows/planning/conversation-history';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import { actionInputParamSchema } from '@/device';
import type { UIContext } from '@/types';
import { MIDSCENE_PLANNING_DISABLE_PARTS } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../utils';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};
rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callAI: rs.fn(),
}));

const inputValue = 'Literal <memory>user text</memory>, <log>user text</log>';
const actionOutput = `<action-type>Input</action-type><action-param-json>${JSON.stringify({ value: inputValue })}</action-param-json>`;
const response = `${actionOutput}
<planning>THOUGHT_SENTINEL</planning>
<memory>MEMORY_SENTINEL</memory>
<update-plan-content><sub-goal index="1" status="pending">GOAL_SENTINEL</sub-goal></update-plan-content>
<log>LOG_SENTINEL</log>`;
const context = {
  screenshot: { base64: 'data:image/png;base64,AA==' },
  shotSize: { width: 100, height: 100 },
} as UIContext;
const options = (disabled: string): PlanOptions => ({
  context,
  actionSpace: [
    {
      name: 'Input',
      description: 'Input text',
      paramSchema: actionInputParamSchema,
      call: rs.fn(),
    },
  ],
  modelRuntime: getModelRuntime({
    modelName: 'test-model',
    modelDescription: 'test',
    intent: 'planning',
    slot: 'planning',
    retryCount: 1,
    retryInterval: 0,
  }),
  conversationHistory: new ConversationHistory(),
  includeLocateInPlanning: false,
  imagesIncludeCount: resolvePlanningFeatures(parsePlanningAblation(disabled))
    .imagesIncludeCount,
  ablation: parsePlanningAblation(disabled),
});
const run = async (opts: PlanOptions) =>
  standardPlan(await prepareUserPrompt('Enter the supplied text'), opts);
const requestText = () =>
  JSON.stringify(rs.mocked(callAI).mock.calls.at(-1)![0]);

beforeEach(() => {
  rs.mocked(callAI).mockReset();
  rs.mocked(callAI).mockResolvedValue({ content: response, isStreamed: false });
});
afterEach(() => {
  rs.restoreAllMocks();
  rs.unstubAllEnvs();
});

describe('Planning ablation across model calls', () => {
  const dynamic: PlanningAblationPart[] = [
    'memory',
    'subGoals',
    'planningText',
    'log',
  ];
  for (let mask = 0; mask < 16; mask++) {
    const disabled = dynamic.filter((_, index) => mask & (1 << index));
    it(`projects state and replay for ${disabled.join(',') || 'baseline'}`, async () => {
      const opts = options(disabled.join(','));
      const first = await run(opts);
      expect(first.rawResponse).toBe(response);
      expect(first.actions).toEqual([
        { type: 'Input', param: { value: inputValue } },
      ]);
      expect(first.memory).toBe(
        disabled.includes('memory') ? undefined : 'MEMORY_SENTINEL',
      );
      expect(first.thought).toBe(
        disabled.includes('planningText') ? undefined : 'THOUGHT_SENTINEL',
      );
      expect(first.log).toBe(disabled.includes('log') ? '' : 'LOG_SENTINEL');
      expect(first.updateSubGoals?.length).toBe(
        disabled.includes('subGoals') ? undefined : 1,
      );
      expect(
        opts.conversationHistory.memoriesToText().includes('MEMORY_SENTINEL'),
      ).toBe(!disabled.includes('memory'));
      expect(
        opts.conversationHistory.subGoalsToText().includes('GOAL_SENTINEL'),
      ).toBe(!disabled.includes('subGoals'));
      expect(opts.conversationHistory.historicalLogsToText()).toBe(
        disabled.includes('subGoals') && !disabled.includes('log')
          ? 'Here are the steps that have been executed:\n- LOG_SENTINEL'
          : '',
      );
      if (disabled.includes('log'))
        expect(opts.conversationHistory.subGoalsToText()).not.toContain(
          'LOG_SENTINEL',
        );

      opts.conversationHistory.pendingFeedbackMessage =
        'Input executed successfully';
      await run(opts);
      for (const [part, sentinel] of [
        ['memory', 'MEMORY_SENTINEL'],
        ['subGoals', 'GOAL_SENTINEL'],
        ['planningText', 'THOUGHT_SENTINEL'],
        ['log', 'LOG_SENTINEL'],
      ] as const) {
        expect(requestText().includes(sentinel)).toBe(!disabled.includes(part));
      }
      const messages = rs.mocked(callAI).mock.calls.at(-1)![0];
      const replay = messages.find((message) => message.role === 'assistant');
      expect(JSON.stringify(replay)).toContain(
        'Literal <memory>user text</memory>',
      );
      expect(requestText()).toContain('Input executed successfully');
      expect(JSON.stringify(messages[1])).toContain('Enter the supplied text');
      const images = messages.flatMap((message) =>
        Array.isArray(message.content)
          ? message.content.filter((item) => item.type === 'image_url')
          : [],
      );
      expect(images).toHaveLength(2);
    });
  }

  it.each([
    { disabled: '', count: 2 },
    { disabled: 'screenshotHistory', count: 1 },
  ])(
    'sends only the enabled screenshot history to the model: $disabled',
    async ({ disabled, count }) => {
      const opts = options(disabled);
      for (let round = 0; round < 3; round++) await run(opts);
      const messages = rs.mocked(callAI).mock.calls.at(-1)![0];
      const images = messages.flatMap((message) =>
        Array.isArray(message.content)
          ? message.content.filter((item) => item.type === 'image_url')
          : [],
      );
      expect(images).toHaveLength(count);
    },
  );

  it('removes grounding guidance from independent Locate calls while keeping standalone Locate unchanged', async () => {
    const modelRuntime = getModelRuntime({
      modelFamily: 'qwen2.5-vl',
      modelName: 'test',
      modelDescription: 'test',
      intent: 'default',
      slot: 'default',
      retryCount: 0,
    });
    rs.mocked(callAI).mockResolvedValue({
      content: '{"bbox":[100,200,300,400]}',
      isStreamed: false,
    });
    rs.stubEnv(MIDSCENE_PLANNING_DISABLE_PARTS, 'groundingGuidance');
    const locateOptions = {
      context: createFakeContext(),
      targetElementDescription: 'Submit',
      modelRuntime,
    };
    const ablated = await AiLocateElement({
      ...locateOptions,
      disableGroundingGuidance: true,
    });
    expect(requestText()).not.toContain('First identify the target primitive');
    expect(requestText()).toContain('bbox');
    const baseline = await AiLocateElement(locateOptions);
    expect(requestText()).toContain('First identify the target primitive');
    expect(ablated.parseResult).toEqual(baseline.parseResult);
    expect(baseline.parseResult.element).toBeDefined();
  });

  it('keeps disabled fields absent after history compression and environment changes', async () => {
    const opts = options('memory,subGoals,planningText,log');
    rs.stubEnv(MIDSCENE_PLANNING_DISABLE_PARTS, '');
    for (let round = 0; round < 27; round++) {
      await run(opts);
      opts.conversationHistory.pendingFeedbackMessage =
        'Input executed successfully';
    }
    expect(opts.conversationHistory.length).toBeLessThan(50);
    expect(requestText()).not.toMatch(
      /MEMORY_SENTINEL|GOAL_SENTINEL|THOUGHT_SENTINEL|LOG_SENTINEL/,
    );
  });

  it('filters retry responses and keeps the original raw response for reporting', async () => {
    const opts = options('memory,log');
    rs.mocked(callAI).mockResolvedValueOnce({
      content:
        '<memory>MEMORY_SENTINEL</memory><log>LOG_SENTINEL</log><action-type>Input</action-type><action-param-json>{invalid json}</action-param-json>',
      isStreamed: false,
    });
    const result = await run(opts);
    expect(rs.mocked(callAI)).toHaveBeenCalledTimes(2);
    expect(requestText()).not.toMatch(/MEMORY_SENTINEL|LOG_SENTINEL/);
    expect(result.rawResponse).toBe(response);
    expect(result.memory).toBeUndefined();
    expect(result.log).toBe('');
  });

  it('removes the process-evidence reminder without removing actual execution feedback', async () => {
    const opts = options('processEvidence');
    await run(opts);
    expect(requestText()).not.toContain(
      'No previous actions have been executed',
    );
    opts.conversationHistory.pendingFeedbackMessage =
      'Input failed: keyboard unavailable';
    await run(opts);
    expect(requestText()).toContain('Input failed: keyboard unavailable');
  });
});

describe('aiAct experiment boundary', () => {
  const makeAgent = (cache = false) =>
    new Agent({ interfaceType: 'puppeteer', actionSpace: () => [] } as any, {
      cache: cache ? { id: 'planning-ablation-unit-test' } : false,
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'test-model',
        MIDSCENE_MODEL_FAMILY: 'qwen2.5-vl',
        MIDSCENE_MODEL_API_KEY: 'test-key',
        MIDSCENE_MODEL_BASE_URL: 'https://api.sample.com/v1',
      },
    });

  it('captures each aiAct setting once and keeps it immutable during execution', async () => {
    const agent = makeAgent();
    const observed: unknown[] = [];
    rs.spyOn(agent.taskExecutor, 'action').mockImplementation(
      async (...args) => {
        const ablation = args.at(-1);
        observed.push(ablation);
        rs.stubEnv(MIDSCENE_PLANNING_DISABLE_PARTS, 'subGoals');
        expect(ablation).toEqual(
          observed.length === 1 ? ['memory'] : ['subGoals'],
        );
        expect(Object.isFrozen(ablation)).toBe(true);
        return { output: { output: 'done' } } as any;
      },
    );
    rs.stubEnv(MIDSCENE_PLANNING_DISABLE_PARTS, 'memory');
    await agent.aiAct('test');
    await agent.aiAct('test');
    expect(observed).toEqual([['memory'], ['subGoals']]);
  });

  it('fails before cache replay or inference when the config is invalid or cache is active', async () => {
    const agent = makeAgent(true);
    const match = rs.spyOn(agent.taskCache!, 'matchPlanCache');
    const execute = rs.spyOn(agent.taskExecutor, 'action');
    rs.stubEnv(MIDSCENE_PLANNING_DISABLE_PARTS, 'memroy');
    await expect(agent.aiAct('test')).rejects.toThrow('Unknown');
    rs.stubEnv(MIDSCENE_PLANNING_DISABLE_PARTS, 'memory');
    await expect(agent.aiAct('test')).rejects.toThrow('caches to be disabled');
    expect(match).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(callAI).not.toHaveBeenCalled();
  });
});
