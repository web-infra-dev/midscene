import { plan } from '@/ai-model';
import { getPageDataOfTestName } from 'tests/ai-model/inspector/util';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

describe('automation - planning', () => {
  it('basic run', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const { plans } = await plan(
      'type "Why is the earth a sphere?", hit Enter',
      {
        context,
      },
      'coze',
    );
    expect(plans.length).toBe(3);
    expect(plans[0].thought).toBeTruthy();
    expect(plans[0].type).toBe('Locate');
    expect(plans[1].type).toBe('Input');
    expect(plans[2].type).toBe('KeyboardPress');
  });

  it('should raise an error when prompt is irrelevant with page', async () => {
    const { context } = await getPageDataOfTestName('todo');

    expect(async () => {
      await plan(
        'Tap the blue T-shirt in left top corner, and click the "add to cart" button',
        {
          context,
        },
        'coze',
      );
    }).rejects.toThrowError();
  });

  it('Error message in Chinese', async () => {
    const { context } = await getPageDataOfTestName('todo');
    let error: Error | undefined;
    try {
      await plan(
        '在界面上点击“香蕉奶茶”，然后添加到购物车',
        {
          context,
        },
        'coze',
      );
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeTruthy();
    expect(/a-z/i.test(error!.message)).toBeFalsy();
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
      const { plans } = await plan(instruction, { context }, 'coze');
      expect(plans).toBeTruthy();
      // console.log(`instruction: ${instruction}\nplans: ${JSON.stringify(plans, undefined, 2)}`);
    }
  });
});
