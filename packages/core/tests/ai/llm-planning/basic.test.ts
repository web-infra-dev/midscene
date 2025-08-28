import { plan } from '@/ai-model';
import { globalConfigManager, vlLocateMode } from '@midscene/shared/env';
import { mockActionSpace } from 'tests/common';
import { getContextFromFixture } from 'tests/evaluation';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

beforeAll(async () => {
  await globalConfigManager.init();
});

const vlMode = vlLocateMode({
  intent: 'default',
});

describe.skipIf(vlMode)('automation - llm planning', () => {
  it('basic run', async () => {
    const { context } = await getContextFromFixture('todo');

    const { actions } = await plan(
      'type "Why is the earth a sphere?", wait 3.5s, hit Enter',
      {
        context,
        actionSpace: mockActionSpace,
        interfaceType: 'puppeteer',
      },
    );
    expect(actions).toBeTruthy();

    expect(actions!.length).toBe(3);
    expect(actions![0].type).toBe('Input');
    expect(actions![1].type).toBe('Sleep');
    expect(actions![1].param).toMatchSnapshot();
    expect(actions![2].type).toBe('KeyboardPress');
    expect(actions![2].param).toMatchSnapshot();
  });

  it('scroll page', async () => {
    const { context } = await getContextFromFixture('todo');
    const { actions } = await plan(
      'Scroll down the page by 200px, scroll up the page by 100px, scroll right the second item of the task list by 300px',
      { context, actionSpace: mockActionSpace, interfaceType: 'puppeteer' },
    );
    expect(actions).toBeTruthy();
    expect(actions!.length).toBe(3);
    expect(actions![0].type).toBe('Scroll');
    expect(actions![0].param).toBeDefined();
    expect(actions![0].param.locate).toBeNull();

    expect(actions![2].param).toBeDefined();
    expect(actions![2].param.locate).toBeTruthy();
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
        interfaceType: 'puppeteer',
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
        interfaceType: 'puppeteer',
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
      { context, actionSpace: mockActionSpace, interfaceType: 'puppeteer' },
    );

    expect(error).toBeFalsy();
    expect(actions?.length).toBe(0);
  });

  it('should make mark unfinished when something is not found', async () => {
    const { context } = await getContextFromFixture('todo');
    const res = await plan(
      'click the input box, wait 300ms. After that, the page will be redirected to the home page, click the close button of the cookie prompt on the home page',
      { context, actionSpace: mockActionSpace, interfaceType: 'puppeteer' },
    );

    expect(res.more_actions_needed_by_instruction).toBeTruthy();
    expect(res.log).toBeDefined();
  });
});
