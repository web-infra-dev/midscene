import { plan } from '@/ai-model';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';
import { getPageDataOfTestName } from './test-suite/util';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

describe('automation - planning', () => {
  it('basic run', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const { actions } = await plan(
      'type "Why is the earth a sphere?", wait 3.5s, hit Enter',
      {
        context,
      },
    );

    expect(actions.length).toBe(3);
    expect(actions[0].type).toBe('Input');
    expect(actions[1].type).toBe('Sleep');
    expect(actions[1].param).toMatchSnapshot();
    expect(actions[2].type).toBe('KeyboardPress');
    expect(actions[2].param).toMatchSnapshot();
  });

  it('instructions of to-do mvc', async () => {
    const { context } = await getPageDataOfTestName('todo');
    const instructions = [
      '在任务框 input 输入 今天学习 JS，按回车键',
      '在任务框 input 输入 明天学习 Rust，按回车键',
      '在任务框 input 输入后天学习 AI，按回车键',
      '将鼠标移动到任务列表中的第二项，点击第二项任务右边的删除按钮',
      '点击第二条任务左边的勾选按钮',
      '点击任务列表下面的 completed 状态按钮',
    ];

    for (const instruction of instructions) {
      const { actions } = await plan(instruction, { context });
      expect(actions).toBeTruthy();
      expect(actions[0].locate?.id).toBeTruthy();
    }
  });

  it('scroll some element', async () => {
    const { context } = await getPageDataOfTestName('todo');
    const { actions } = await plan(
      'Scroll left the status filters (with a button named "complete")',
      {
        context,
      },
    );

    expect(actions).toBeTruthy();
    expect(actions[0].type).toBe('Scroll');
    expect(actions[0].locate).toBeTruthy();
  });

  it('scroll page', async () => {
    const { context } = await getPageDataOfTestName('todo');
    const { actions } = await plan(
      'Scroll down the page by 200px, scroll up the page by 100px, scroll right the second item of the task list by 300px',
      { context },
    );
    expect(actions.length).toBe(3);
    expect(actions).toBeTruthy();
    expect(actions[0].type).toBe('Scroll');
    expect(actions[0].locate).toBeNull();
    expect(actions[0].param).toBeDefined();

    expect(actions[2].locate).toBeTruthy();
    expect(actions[2].param).toBeDefined();
  });

  it('throw error when instruction is not feasible', async () => {
    const { context } = await getPageDataOfTestName('todo');
    await expect(async () => {
      await plan('close Cookie Prompt', {
        context,
      });
    }).rejects.toThrow();
  });

  it('should not throw in an "if" statement', async () => {
    const { context } = await getPageDataOfTestName('todo');
    const { actions, error } = await plan(
      'If there is a cookie prompt, close it',
      { context },
    );

    expect(actions.length === 1).toBeTruthy();
    expect(actions[0]!.type).toBe('FalsyConditionStatement');
  });

  it('should give a further plan when something is not found', async () => {
    const { context } = await getPageDataOfTestName('todo');
    const res = await plan(
      'click the input box, wait 300ms, click the close button of the cookie prompt',
      { context },
    );
    // console.log(res);
    expect(res.furtherPlan).toBeTruthy();
    expect(res.furtherPlan?.whatToDoNext).toBeTruthy();
    expect(res.furtherPlan?.whatHaveDone).toBeTruthy();
  });

  it('partial error', async () => {
    const { context } = await getPageDataOfTestName('todo');
    const res = await plan(
      'click the input box, click the close button of the cookie prompt',
      { context },
    );
    expect(res.furtherPlan).toBeTruthy();
    expect(res.furtherPlan?.whatToDoNext).toBeTruthy();
    expect(res.furtherPlan?.whatHaveDone).toBeTruthy();
  });
});
