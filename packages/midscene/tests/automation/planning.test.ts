// /* eslint-disable max-lines-per-function */
// import { it, describe, vi, expect } from 'vitest';
// import { plan } from '@/automation/';
// import { getFixture, launch } from 'tests/utils';
// import { parseContextFromPuppeteerBrowser } from '@/puppeteer';
// import { beforeEach } from 'node:test';
// import { Browser } from 'puppeteer';

// vi.setConfig({
//   testTimeout: 180 * 1000,
//   hookTimeout: 30 * 1000,
// });

// const localPage = `file://${getFixture('simple.html')}`;
// describe('automation - planning', () => {
//   let browser: Browser;
//   beforeEach(() =>
//      async () => {
//       await browser?.close();
//     },
//   );

//   it('basic run', async () => {
//     browser = await launch('https://www.baidu.com');
//     const context = await parseContextFromPuppeteerBrowser(browser);

//     const {plans} = await plan(context, 'type keyword "Why is the earth a sphere?", hit Enter');
//     expect(plans.length).toBe(3);
//     expect(plans[0].thought).toBeTruthy();
//     expect(plans[0].type).toBe('Find');
//     expect(plans[1].type).toBe('Input');
//     expect(plans[2].type).toBe('KeyboardPress');
//   });

//   it('should raise an error when prompt is irrelevant with page', async () => {
//     browser = await launch(localPage);
//     const context = await parseContextFromPuppeteerBrowser(browser);

//     expect((async () => {
//       await plan(context, 'Tap the blue T-shirt in left top corner, and click the "add to cart" button');
//     })).rejects.toThrowError();
//   });

//   it('Error message in Chinese', async () => {
//     browser = await launch(localPage);
//     const context = await parseContextFromPuppeteerBrowser(browser);

//     let error: Error | undefined;
//     try {
//       await plan(context, '在界面上点击“香蕉奶茶”，然后添加到购物车');
//     } catch(e: any) {
//       error = e;
//     }

//     expect(error).toBeTruthy();
//     expect(/a-z/i.test(error!.message)).toBeFalsy();
//   });

//   it.only('instructions of to-do mvc', async() => {
//     browser = await launch('https://todomvc.com/examples/react/dist/');
//     const context = await parseContextFromPuppeteerBrowser(browser);

//     const instructions = [
//       '在任务框 input 输入 今天学习 JS，按回车键',
//       '在任务框 input 输入 明天学习 Rust，按回车键',
//       '在任务框 input 输入后天学习 AI，按回车键',
//       '将鼠标移动到任务列表中的第二项，点击第二项任务右边的删除按钮',
//       '点击第二条任务左边的勾选按钮',
//       '点击任务列表下面的 completed 状态按钮',
//     ];

//     for(const instruction of instructions) {
//       const {plans} = await plan(context, instruction);
//       expect(plans).toBeTruthy();
//       console.log(`instruction: ${instruction}\nplans: ${JSON.stringify(plans, undefined, 2)}`);
//     }
//   });
// });

