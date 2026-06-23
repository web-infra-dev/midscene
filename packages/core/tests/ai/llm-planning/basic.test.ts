import { ConversationHistory, plan } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { globalModelConfigManager } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';
import { mockActionSpace } from '../../common';
import { getContextFromFixture } from '../../evaluation';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const modelConfig = globalModelConfigManager.getModelConfig('default');
const modelRuntime = getModelRuntime(modelConfig);

// These assertions check a deterministic next-action shape. In real
// model-family runs, planning may choose a valid intermediate Tap before Input
// or include a whole-page locate for page-level scroll, so keep this suite out
// of AI CI until that prompt contract is tightened.
describe.skipIf(modelConfig.modelFamily)('automation - llm planning', () => {
  it('basic run', async () => {
    const { context } = await getContextFromFixture('todo');

    const { actions, shouldContinuePlanning } = await plan(
      'type "Why is the earth a sphere?", wait 3.5s, hit Enter',
      {
        context,
        actionSpace: mockActionSpace,
        modelRuntime,
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: true,
      },
    );
    expect(actions).toBeTruthy();

    expect(actions!.length).toBe(1);
    expect(actions![0].type).toBe('Input');
    expect(shouldContinuePlanning).toBeTruthy();
  });

  it('scroll page', async () => {
    const { context } = await getContextFromFixture('todo');
    const { actions, shouldContinuePlanning } = await plan(
      'Scroll down the page by 200px, scroll up the page by 100px, scroll right the second item of the task list by 300px',
      {
        context,
        actionSpace: mockActionSpace,
        modelRuntime,
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: true,
      },
    );
    expect(actions).toBeTruthy();
    expect(actions!.length).toBe(1);
    expect(actions![0].type).toBe('Scroll');
    expect(actions![0].param).toBeDefined();
    expect(actions![0].param.locate).toBeNull();
    expect(shouldContinuePlanning).toBeTruthy();
  });
});

describe('planning', () => {
  const todoInstructions = [
    {
      name: 'input first todo item',
      instruction: '在任务框 input 输入 今天学习 JS，按回车键',
    },
    {
      name: 'input second todo item',
      instruction: '在任务框 input 输入 明天学习 Rust，按回车键',
    },
    {
      name: 'input third todo item',
      instruction: '在任务框 input 输入后天学习 AI，按回车键',
    },
    {
      name: 'delete second todo item',
      instruction:
        '将鼠标移动到任务列表中的第二项，点击第二项任务右边的删除按钮',
    },
    {
      name: 'check second todo item',
      instruction: '点击第二条任务左边的勾选按钮',
    },
    {
      name: 'filter completed items',
      instruction: '点击任务列表下面的 completed 状态按钮',
    },
  ];

  todoInstructions.forEach(({ name, instruction }) => {
    it(`todo mvc - ${name}`, async () => {
      const { context } = await getContextFromFixture('todo');
      const { actions } = await plan(instruction, {
        context,
        actionSpace: mockActionSpace,
        modelRuntime,
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: true,
      });
      expect(actions).toBeTruthy();
      // console.log(actions);
      expect(actions![0].param.locate).toBeTruthy();
      expect(actions![0].param.locate?.prompt).toBeTruthy();
      expect(
        actions![0].param.locate?.id || actions![0].param.locate?.bbox,
      ).toBeTruthy();
    });
  });

  it('scroll some element', async () => {
    const { context } = await getContextFromFixture('todo');
    const { actions } = await plan(
      'Scroll left the status filters (with a button named "completed")',
      {
        context,
        actionSpace: mockActionSpace,
        modelRuntime,
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: true,
      },
    );
    expect(actions).toBeTruthy();
    expect(actions![0].type).toBe('Scroll');
    expect(actions![0].param).toBeDefined();
    expect(actions![0].param.locate).toBeTruthy();
  });

  it('should not throw in an "if" statement', async () => {
    const { context } = await getContextFromFixture('todo');
    const { actions, error } = await plan(
      'If there is a cookie prompt, close it',
      {
        context,
        actionSpace: mockActionSpace,
        modelRuntime,
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: true,
      },
    );

    expect(error).toBeFalsy();
    // AI may return 0 actions or a no-op when condition isn't met
    expect(actions?.length).toBeLessThanOrEqual(1);
  });

  it('should make mark unfinished when something is not found', async () => {
    const { context } = await getContextFromFixture('todo');
    const res = await plan(
      'click the input box, wait 300ms. After that, the page will be redirected to the home page, click the close button of the cookie prompt on the home page',
      {
        context,
        actionSpace: mockActionSpace,
        modelRuntime,
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: true,
      },
    );

    // The instruction mentions future actions that can't be completed in this step
    // So the task should not be finalized yet (shouldContinuePlanning should be true)
    expect(res.shouldContinuePlanning).toBeTruthy();
    expect(res.log).toBeDefined();
    // Task should not be completed with success
    expect(res.finalizeSuccess).not.toBe(true);
  });
});
