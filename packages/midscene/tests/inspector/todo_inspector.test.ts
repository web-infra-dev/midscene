import { it, expect } from 'vitest';
import path from 'path';
import { getPageTestData, repeat, runTestCases, writeFileSyncWithDir } from './util';
import { AiInspectElement } from '@/ai-model';


const testTodoCases = [
  {
    description: '任务输入框',
    multi: false,
  },
  {
    description: '任务列表中的第二项',
    multi: false,
  },
  {
    description: '第二项任务右边的删除按钮',
    multi: false,
  },
  {
    description: '任务列表中第三项左边的勾选按钮',
    multi: false,
  },
  {
    description: '任务列表下面的 Completed 状态按钮',
    multi: false,
  },
];


repeat(2, (repeatIndex) => {
  it('todo: inspect element', async () => {
    const { context } = await getPageTestData(path.join(__dirname, './test-data/todo'));
  
    const { aiResponse, filterUnStableinf } = await runTestCases(testTodoCases, async (testCase)=>{
        const { parseResult } = await AiInspectElement({
            context,
            multi: testCase.multi,
            findElementDescription: testCase.description,
        });
        return parseResult;
    });
    writeFileSyncWithDir(path.join(__dirname, `__ai_responses__/todo-inspector-element-${repeatIndex}.json`), JSON.stringify(aiResponse, null, 2), { encoding: 'utf-8'});
    expect(filterUnStableinf).toMatchFileSnapshot('./__snapshots__/todo_inspector.test.ts.snap');
  }, {
    timeout: 99999,
  });
});

