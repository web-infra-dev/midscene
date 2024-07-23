import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://todomvc.com/examples/react/dist/');
});

test('ai todo', async ({ ai }) => {
  await ai('在任务框 input 输入 今天学习 JS，按回车键');
  await ai('在任务框 input 输入 明天学习 Rust，按回车键');
  await ai('在任务框 input 输入后天学习 AI，按回车键');
  await ai('将鼠标移动到任务列表中的第二项，点击第二项任务右边的删除按钮');
  await ai('点击第二条任务左边的勾选按钮');
  await ai('点击任务列表下面的 completed 状态按钮');
});
