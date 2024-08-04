// /* eslint-disable max-lines-per-function */
// import { describe, expect, it, vi } from 'vitest';
// import  { shallowExpandIds, idsIntoElements, writeInsightDump, expandLiteSection } from '@/insight/utils';
// import { getFixture, launch } from 'tests/utils';
// import { readFileSync } from 'fs';
// import { tmpdir } from 'os';
// import { join } from 'path';
// import { BaseElement } from '@/types';
// import { alignTextElements, parseContextFromPuppeteerBrowser, TextElement } from '@/puppeteer/utils';

// vi.setConfig({
//   testTimeout: 180 * 1000,
// });

// const noop : any = () => {
//   //
// };

// const baseElement = (content: Pick<BaseElement, 'content' | 'rect' | 'center'>): BaseElement => ({
//     ...content,
//     tap: noop,
//     hover:noop,
//     type: noop,
//     press: noop,
//   });

// describe('insight - utils', () => {
//   it('expand id into elements', () => {
//     const elementById = (id: string) => (baseElement({
//       content: `hello world of ${id}`,
//       rect: { top: 0, left: 0, width: 100, height: 100 },
//       center: [0,0] as [number, number],
//     }));

//     const elementIds = ['1', '2', '3'];
//     const elements = idsIntoElements(elementIds, elementById);
//     expect(elements).toMatchSnapshot();
//   });

//   it('shallow expand ids inside data', () => {
//     const ifMeet = (id: string) => /^\d+$/.test(id)

//     const elementById = (id: string) => {
//       if(/^\d$/.test(id)) {
//         return baseElement({
//           content: `hello world of ${id}`,
//           rect: { top: 0, left: 0, width: 100, height: 100 },
//           center: [0,0] as [number, number],
//         });
//       } else if(/^\d{2}$/.test(id)) {
//         return [baseElement({
//           content: `hello world of ${id}`,
//           rect: { top: 0, left: 0, width: 100, height: 100 },
//           center: [0,0] as [number, number],
//         }), baseElement({
//           content: `second world of ${id}`,
//           rect: { top: 0, left: 0, width: 100, height: 100 },
//           center: [0,0] as [number, number],
//         })];
//       }
//       return null;
//     };

//     const data1 = {
//       title: 'title',
//       element: '9',
//       moreElements: '99',
//       undefinedElement:'365',
//       myIds: ['1', '2', '3'],
//     };

//     const data2 = [
//       {...data1},
//       {...data1},
//     ];

//     shallowExpandIds(data1, ifMeet, elementById);
//     shallowExpandIds(data2, ifMeet, elementById);
//     expect(data1).toMatchSnapshot();
//     expect(data2).toMatchSnapshot();
//   });

//   it('expandLiteSection', () => {
//     const liteSection = {
//       name: 'section',
//       description: 'description',
//       sectionCharacteristics: 'characteristics',
//       textIds: ['1', '2', '3'],
//     };
//     const elementById = (id: string) => (baseElement({
//       content: `hello world of ${id}`,
//       rect: { top: 0, left: 0, width: 100, height: 100 },
//       center: [50,50] as [number, number],
//     }));
//     const section = expandLiteSection(liteSection, elementById);
//     expect(section).toMatchSnapshot();

//     const liteSection2 = {
//       name: 'section',
//       description: 'description',
//       sectionCharacteristics: 'characteristics',
//       textIds: [],
//     };
//     const section2 = expandLiteSection(liteSection2, elementById);
//     expect(section2).toMatchSnapshot();
//   });

//   it('align text', async () => {
//     const imagePath = getFixture('table.png');
//     const text: TextElement = {
//       content: 'does not matter',
//       rect: { left: 470, top: 190, width: 600, height: 85 },
//       center: [450, 190],
//       locator: 'find_me',
//     };
//     const aligned = await alignTextElements(readFileSync(imagePath), [text]);
//     expect(aligned).toMatchSnapshot();
//   });

//   it('get context of online context', async () => {
//     const browser = await launch('https://www.baidu.com');
//     const context = await parseContextFromPuppeteerBrowser(browser);
//     expect(context.size).toBeTruthy();
//   });

//   it('write and update dump file', () => {
//     const tmpDir = tmpdir();
//     const mockDumpData = {} as any;
//     // append
//     const logId = writeInsightDump(mockDumpData, tmpDir);
//     expect(typeof logId).toBe('string');

//     const getLatestContent = () => {
//       const file = join(tmpDir, 'latest.insight.json');
//       const content = JSON.parse(readFileSync(file, 'utf-8'));
//       return content;
//     }

//     let data = getLatestContent();
//     expect(data.length).toBe(1);

//     // append
//     writeInsightDump(mockDumpData, tmpDir);
//     data = getLatestContent();
//     expect(data.length).toBe(2);

//     const mockDumpData2 = {
//       hello: 'world',
//     } as any;

//     // modify the first log
//     writeInsightDump(mockDumpData2, logId);
//     data = getLatestContent();
//     expect(data.length).toBe(2);
//     expect(data[0].hello).toBe('world');
//   });
// });

