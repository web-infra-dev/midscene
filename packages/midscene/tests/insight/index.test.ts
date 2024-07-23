// /* eslint-disable max-lines-per-function */
// import { it, beforeEach, describe, expect, vi } from 'vitest';
// import Insight, { getSection, UISection } from '@/index';
// import { BaseElement, UIContext } from '@/types';
// import { getFixture, launch } from 'tests/utils';
// import { Browser } from 'puppeteer';
// import { base64Encoded } from '@/image';
// import { readFileSync } from 'fs';
// import { join } from 'path';
// import { getElement } from '@/query';
// import { getDumpDir } from '@/utils';

// vi.setConfig({
//   testTimeout: 180 * 1000,
//   hookTimeout: 30 * 1000,
// });

// interface RichUI {
//   time: string;
//   userInfo: { name: string };
//   userInfoElement: BaseElement;
//   tableFields: string[];
//   tableDataRecord: Record<string, string>[];
//   tableSection: UISection;
// }

// const localPage = `file://${getFixture('simple.html')}`;
// describe('insight - basic', () => {
//   let browser: Browser;
//   beforeEach(() => 
//      async () => {
//       await browser?.close();
//     },
//   );

//   it('customize AI vendor', async () => {
//     const aiVendor = vi.fn().mockImplementation(() => ({
//       elements: [
//         {id: '1'},
//         {id: '2'},
//       ],
//       errors: [],
//       }));

//     browser = await launch(localPage);
//     const insight = await Insight.fromPuppeteerBrowser(browser, {
//       aiVendorFn: aiVendor as any,
//     });
//     const result = await insight.find('top navigation elements', {multi: true});
//     expect(aiVendor).toHaveBeenCalled();
//     expect(result.length).toBe(2);
//     expect(result).toMatchSnapshot();
//   });

//   it('customize AI vendor, describe dump, find', async () => {
//     const aiVendor = vi.fn().mockImplementation(() => ({
//       elements: [
//         {id: '1'},
//         {id: '2'},
//       ],
//       errors: [],
//       }));

//     browser = await launch(localPage);
//     const insight = await Insight.fromPuppeteerBrowser(browser, {
//       aiVendorFn: aiVendor as any,
//     });

//     const dumpCollector = vi.fn();
//     insight.onceDumpUpdatedFn = dumpCollector;
//     await insight.find('top navigation elements', {multi: true});
//     expect(dumpCollector.mock.calls.length).toBe(2); // first dump and update
//     const firstDump = dumpCollector.mock.calls[0][0];
//     const secondDump = dumpCollector.mock.calls[1][0];
//     expect(firstDump.logId === secondDump.logId).toBeTruthy();

//     await insight.find('another find');
//     expect(dumpCollector.mock.calls.length).toBe(2); // only be called once


//     const dumpCollector2 = vi.fn();
//     insight.onceDumpUpdatedFn = dumpCollector2;
//     await insight.extract('should fail');
//     expect(dumpCollector2.mock.calls.length).toBe(2);
    
//     await insight.extract('should fail');
//     expect(dumpCollector2.mock.calls.length).toBe(2);
//   });

//   it('throw error when calling AI', async () => {
//     let errLog = 'something went wrong';
//     const aiVendor = vi.fn().mockImplementation(() => ({
//       errors: [errLog],
//     }));

//     browser = await launch(localPage);
//     const insight = await Insight.fromPuppeteerBrowser(browser, {
//       aiVendorFn: aiVendor as any,
//     });
//     try {
//       await insight.find('top navigation elements', {multi: true});
//     } catch(e) {
//       //
//     }
//     const logContent = readFileSync(join(getDumpDir(), './latest.insight.json'), 'utf-8');
//     expect(logContent).contains(errLog);

//     errLog = 'something went wrong again';
//     try {
//       await insight.extract('something');
//     } catch(e) {
//       // 
//     }

//     const logContent2 = readFileSync(join(getDumpDir(), './latest.insight.json'), 'utf-8');
//     expect(logContent2).contains(errLog);
//   });

//   it('context should be updated before each calls', async () => {
//     const screenshot = getFixture('baidu.png');
//     const getContext = (content: string): UIContext => {
//       const basic = {
//         screenshotBase64: base64Encoded(screenshot),
//         size: { width: 1920, height: 1080 },
//         content: [
//           {
//             content,
//             rect: {
//               width: 100,
//               height: 100,
//               top: 200,
//               left: 200,
//             },
//             center: [250, 250],
//           },
//         ] as BaseElement[],
//       };

//       return {
//         ...basic,
//         describer: async () => ({
//             description: `this is a description: ${basic.content[0].content}`,
//             elementById: () => basic.content[0],
//           }),
//       }
//     };

//     const aiVendor = vi.fn().mockResolvedValue({
//       elements: [{ id: '0' }],
//       errors: [],
//     });

//     let count = 0;
//     const contextA = 'abcdefg12345';
//     const contextB = 'red fox jumps over the lazy dog';
//     const insight = new Insight(
//       () => {
//         count += 1;
//         if (count === 1) {
//           return getContext(contextA);
//         }
//         return Promise.resolve(getContext(contextB));
//       },
//       {
//         aiVendorFn: aiVendor as any,
//       },
//     );

//     await insight.find('f-query');
//     await insight.find('any prompt');

//     expect(count).toBe(2);

//     // check aiVendor call
//     expect(aiVendor).toHaveBeenCalledTimes(2);
//     const callParam1 = JSON.stringify(aiVendor.mock.calls[0]);
//     expect(callParam1).toContain(contextA);

//     const callParam2 = JSON.stringify(aiVendor.mock.calls[1]);
//     expect(callParam2).toContain(contextB);
//   });
// });

// describe('find', () => {
//   const vscodeSite = 'https://code.visualstudio.com/';
//   let browser: Browser;
//   beforeEach(() => 
//      async () => {
//       await browser?.close();
//     },
//   );

//   it('find elements with properties of online page', async () => {
//     browser = await launch(vscodeSite);
//     const insight = await Insight.fromPuppeteerBrowser(browser);
//     const btn = await insight.find('the main download button on the page');
//     expect(btn).toBeTruthy();
//     expect(/download/i.test(btn!.content)).toBeTruthy();
    
//     const btnWithProperties = await insight.find('all the download buttons on the page', {multi: true});
//     expect(btnWithProperties.length).toBeGreaterThanOrEqual(2);
//   });
// });

// describe('extract', () => {
//   let browser: Browser;
//   beforeEach(() => 
//      async () => {
//       await browser?.close();
//     },
//   );

//   it.skip('types', async () => {
//     browser = await launch(localPage);
//     const insight = await Insight.fromPuppeteerBrowser(browser);
//     // string query
//     const result = await insight.extract('abcdefg');
//     // string query + type
//     const result2 = await insight.extract<string[]>('abcdefg');
//     // object query
//     const result3 = await insight.extract({
//       foo: 'abcde',
//     });
//     // object query + type
//     const result4 = await insight.extract<{dataItem: number}>({
//       dataItem: 'abcde',
//     });

//     // types mismatch, should raise an error
//     await insight.extract<{dataItem: number}>({
//       foo: 'abcde', // should be error 
//     });
//     [
//       result, // should be: any
//       result2, // should be: string[]
//       result3, // should be: {foo: any}, 'foo' mean the same key as in the first param
//       result4, // should be: {dataItem: number}
//     ];
//   });

//   it('local page, one-line prompt, array style data', async () => {
//     browser = await launch(localPage);
//     const insight = await Insight.fromPuppeteerBrowser(browser);
//     const result = await insight.extract<string[]>('string[], indicates first row (after the first heading line) content of table, like ["value1", "value2"..]');
//     expect(Array.isArray(result)).toBeTruthy();
//     expect(result).toMatchSnapshot();
//   });

//   it('local page, kv prompt', async () => {
//     browser = await launch(localPage);
//     const insight = await Insight.fromPuppeteerBrowser(browser);
//     // default type
//     const result = await insight.extract({
//       'table-fields': 'string[], all field names of the table',
//     });
//     expect(result).toMatchSnapshot();
//     expect(Array.isArray(result['table-fields'])).toBeTruthy();

//     // specify type
//     const result2 = await insight.extract<{ 'fields': string[] }>({
//       'fields': 'string[], all field names of the table',
//     });
//     expect(result2).toMatchSnapshot();
//     expect(result2.fields.push).toBeTruthy();
//   });

//   it('get elements and sections', async () => {
//     browser = await launch(localPage);
//     const insight = await Insight.fromPuppeteerBrowser(browser);

//     // k-v query
//     const result = await insight.extract<RichUI>({
//       time: 'date and time, string',
//       userInfo: 'user info, return object style, {name: [username as string]}',
//       userInfoElement: getElement('element indicates the username'),
//       tableFields: getElement('field names of table', { multi: true }),
//       tableDataRecord: 'data record of table, {id: string, [fieldName]: string}[]',
//       tableSection: getSection('table section'),
//     });

//     expect(result.time).toMatchSnapshot();
//     expect(result.userInfo).toMatchSnapshot();
//     expect(result.tableDataRecord).toMatchSnapshot();

//     expect(Array.isArray(result.tableFields)).toBeTruthy();
//     expect(result.tableFields.length).toBeGreaterThan(2);
//     expect(result.userInfoElement.center).toBeTruthy();
//     expect(result.tableSection.sectionCharacteristics).toBeTruthy();
//   });
// });
