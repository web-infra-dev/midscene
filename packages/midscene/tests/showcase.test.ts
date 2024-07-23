/* eslint-disable max-len */
/* eslint-disable max-lines-per-function */
import { it, describe, expect, vi, beforeEach, afterAll } from 'vitest';
import Insight, { getSection , ExecutionTaskActionApply, ExecutionTaskInsightFindApply, Executor, BaseElement } from '@/index';

// import { launch } from 'tests/utils';
import { copyFileSync, existsSync, readFileSync } from 'fs';
import path, { join } from 'path';
// import { Browser } from 'puppeteer';
import { getElement } from '@/query';
import { base64Encoded, imageInfoOfBase64, transformImgPathToBase64 } from '@/image';
import { describeUserPage } from '@/ai-model';
import assert from 'node:assert';
import { generateUIContext } from './utils';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const vscodeSite = 'https://code.visualstudio.com/';
const githubStatus = 'https://www.githubstatus.com/';

describe('Show case - vscode site, write demo data', () => {

  it('download buttons of vscode', async (context) => {
    const insight = new Insight(generateUIContext(path.join(__dirname, './inspector/test-data/visualstudio')));
    const downloadBtns = await insight.find('download buttons on the page');
    assert(downloadBtns, 'donwload buttons not found');
    expect(downloadBtns.content).toBe('Download for Windows');
  });

  it('split the Github status page', async (context) => {
    const insight = new Insight(generateUIContext(path.join(__dirname, './inspector/test-data/githubstatus')));

    const result = await insight.extract('this is a service status page. Extract all status data with this scheme: {[serviceName]: [statusText]}');
    expect(result).toMatchSnapshot();
  });
});

// describe.skip('todo mvc', () => {
//   const todomvc = 'https:\/\/todomvc.com/examples/react/dist/'; // since DOM doesn't matter, the original site is fine
//   const TODO_ITEMS = ['buy some cheese', 'feed the cat', 'book a doctors appointment'];

//   let browser: Browser;
//   beforeEach(() => async () => {
//     await browser?.close();
//   });

//   afterAll(() => {
//     // write dump file
//     const src = join(process.cwd(), './midscene_run/latest.actions.json');
//     const dist = join(process.cwd(), './demo_data/demo.actions.json');
//     expect(existsSync(src)).toBeTruthy();
//     copyFileSync(src, dist);
//   });

//   it('find and click', async () => {
//     browser = await launch(todomvc);
//     const insight = await Insight.fromPuppeteerBrowser(browser);

//     const insightTask: ExecutionTaskInsightFindApply = {
//       type: 'Insight',
//       param: {
//         query: 'input box of the page',
//         insight,
//       },
//     };

//     const actionTap: ExecutionTaskActionApply = {
//       type: 'Action',
//       param: {
//         action: 'tap',
//         element: 'previous',
//         delayAfterAction: 500,
//       },
//     };

//     const actionType: ExecutionTaskActionApply = {
//       type: 'action',
//       param: {
//         action: 'type',
//         element: 'previous',
//         content: TODO_ITEMS[0],
//         delayAfterAction: 500,
//       },
//     };
    
//     const actionPress: ExecutionTaskActionApply = {
//       type: 'action',
//       param: {
//         action: 'press',
//         element: 'previous',
//         content: 'Enter',
//         delayAfterAction: 500,
//       },
//     };

//     const actionType2: ExecutionTaskActionApply = {
//       type: 'action',
//       param: {
//         action: 'type',
//         element: 'previous',
//         content: TODO_ITEMS[1],
//         delayAfterAction: 500,
//       },
//     };

//     const actionPress2: ExecutionTaskActionApply = {
//       type: 'action',
//       param: {
//         action: 'press',
//         element: 'previous',
//         content: 'Enter',
//         delayAfterAction: 500,
//       },
//     };

//     const executor = new Executor('test', [insightTask, actionTap, actionType, actionPress, actionType2, actionPress2]);
//     const r = await executor.run();
//     expect(r).toBeTruthy();

//     const filePath = executor.dump();
//     console.log('filePath', filePath);
//     expect(filePath).toBeTruthy();
//     expect(existsSync(filePath)).toBeTruthy();

//     const list = await insight.extract('todo list, string[], item names');
//     console.log(list);
//     expect(list).toMatchSnapshot();
//   });
// });

// // TODO
// describe.skip('Show case - code on readme', () => {
//   let browser: Browser;
//   beforeEach(() => 
//      async () => {
//       await browser?.close();
//     },
//   );

//   it('download buttons', async () => {
//     browser = await launch(vscodeSite);
//     const insight = await Insight.fromPuppeteerBrowser(browser);

//     const downloadBtns = await insight.find('download buttons on the page', {multi: true});
//     expect(downloadBtns.length).toBe(2);
//   });

//   it('segment many sections', async () => {
//     browser = await launch(vscodeSite);
//     const insight = await Insight.fromPuppeteerBrowser(browser);

//     const manySections = await insight.segment({
//       cookiePrompt: 'cookie prompt with its action buttons on the top of the page',
//       navigation: 'top navigation items besides logo',
//       topRightWidgets: 'widgets on the top right corner',
//     });
//   });

//   it('download buttons with data', async () => {
//     browser = await launch(vscodeSite);
//     const insight = await Insight.fromPuppeteerBrowser(browser);

//     const downloadBtns = await insight.find(query('download buttons on the page', {
//       textsOnButton: 'string',
//       backgroundColor: 'string, color of text, one of blue / red / yellow / green / white / black / others',
//       type: '`major` or `minor`. The Bigger one is major and the others are minor',
//       platform: 'string. Say `unknown` when it is not clear on the element',
//     }), {multi: true});

//     console.log(downloadBtns);
//   });

//   it('parse list from section', async () => {
//     browser = await launch(githubStatus);
//     const insight = await Insight.fromPuppeteerBrowser(browser);

//     const result = await insight.segment({
//       'services': query<{items: {service: string, status: string}[]}>(
//         'a list with service names and status',
//         { items: '{service: "service name as string", status: "string, like normal"}[]' }, // the value here is the prompt sending to AI
//       ),
//     });

//     const { items } = result.services;

//     console.log(items);
//   });
// });

