// /* eslint-disable max-lines-per-function */
// import { describe, expect, it, vi  } from 'vitest';
// import { getFixture, launch } from 'tests/utils';
// import { describeUserPage, systemPromptToExtract, splitElementResponse, ifElementTypeResponse, systemPromptToFindElement, promptsOfSectionQuery, extractSectionQuery } from '@/insight/prompt/util';
// import { BasicSectionQuery, getSection } from '@/index';
// import { getElement } from '@/query';
// import { parseContextFromPuppeteerBrowser } from '@/puppeteer';

// vi.setConfig({
//   testTimeout: 180 * 1000,
// });

// describe('prompts', () => {
//   const sectionQuery1: BasicSectionQuery[] = [];
//   const sectionQuery2: BasicSectionQuery[] = [
//     { name: 'title' },
//     { name: 'list', description: 'list of todo' },
//   ];
//   const sectionQuery3: BasicSectionQuery[] =  [
//     {description: 'domestic news'},
//   ];
//   const sectionQuery4: BasicSectionQuery[] = [
//     { name: 'title' },
//     { name: 'list', description: 'list of todo' },
//     { name: 'control' },
//   ];
//   it('describe constraints', () => {
//     expect(promptsOfSectionQuery(sectionQuery1)).toMatchSnapshot();
//     expect(promptsOfSectionQuery(sectionQuery2)).toMatchSnapshot();
//     expect(promptsOfSectionQuery(sectionQuery3)).toMatchSnapshot();
//     expect(promptsOfSectionQuery(sectionQuery4)).toMatchSnapshot();
//   });

//   it('system prompt for finding element', () => {
//     const prompt = systemPromptToFindElement('guess who am i', false);
//     expect(prompt).toMatchSnapshot();
//     const multiPrompt = systemPromptToFindElement('guess who am i', true);
//     expect(multiPrompt).toMatchSnapshot();
//   });

//   it('system prompt for extract, wo/ section', () => {
//     const prompt = systemPromptToExtract('help me to find out');
//     expect(prompt).toMatchSnapshot();
    
//     const prompt2 = systemPromptToExtract({foo: 'tell me the color of sea'});
//     expect(prompt2).toMatchSnapshot();
//   });
  
//   it('system prompt for extract, w/ section', () => {
//     const prompt = systemPromptToExtract('find something', sectionQuery1);
//     expect(prompt).toMatchSnapshot();

//     const prompt2 = systemPromptToExtract('find something', sectionQuery2);
//     expect(prompt2).toMatchSnapshot();

//     const prompt3 = systemPromptToExtract('find something', sectionQuery3);
//     expect(prompt3).toMatchSnapshot();

//     const prompt4 = systemPromptToExtract('find something', sectionQuery4);
//     expect(prompt4).toMatchSnapshot();
//   });

//   it('describe user page', async () => {
//     const localPage = getFixture('simple.html');
//     const browser = await launch(`file://${localPage}`);
//     const context = await parseContextFromPuppeteerBrowser(browser);
//     const { description, elementById } = await describeUserPage(context);
//     const descriptionTextToAssert = description.replace(/\d/g, 'N');
//     expect(descriptionTextToAssert).toMatchSnapshot();
//     const item0 = elementById('0');
//     expect(item0.content).toEqual('Data Record');

//     expect(elementById('1')).toBeTruthy();
//     expect(elementById('2')).toBeTruthy();
//     expect(elementById('10')).toBeTruthy();
//   });

//   it('prompt to check github', () => {
//     expect({
//       section: getSection('section to check the status of issue'),
//       status: 'string, like normal',
//       statusElement: getElement('element indicates the status', {multi: true}),
//     }).toMatchSnapshot();
//   })
// });

// describe('elements', () => {
//   it('one or more elements', () => {
//     const prompt = getElement('some element like this');
//     expect(prompt).toMatchSnapshot();

//     const prompt2 = getElement('some element like this');
//     expect(prompt2).toMatchSnapshot();
//   });

//   it('split answer', () => {
//     const answer1 = 'LOCATE_ONE_ELEMENT/id_123';
//     expect(splitElementResponse(answer1)).toMatchSnapshot();

//     const answer2 = 'LOCATE_ONE_ELEMENT/';
//     expect(splitElementResponse(answer2)).toBeNull();

//     const answer3 = 'LOCATE_ONE_OR_MORE_ELEMENTS/123,456,abdccc';
//     expect(splitElementResponse(answer3)).toMatchSnapshot();

//     const answer4 = 'LOCATE_ONE_OR_MORE_ELEMENTS/';
//     expect(splitElementResponse(answer4)).toEqual([]);

//     expect(ifElementTypeResponse(answer1)).toBeTruthy();
//     expect(ifElementTypeResponse(answer2)).toBeTruthy();
//     expect(ifElementTypeResponse('some other')).toBeFalsy();
//   });
// });

// describe('section', () => {
//   it('retrieve', () => {
//     const queryString = 'get something for me';
//     const prompt = getSection(queryString);
//     expect(prompt).toMatchSnapshot();

//     const extracted = extractSectionQuery(prompt);
//     expect(extracted).toBe(queryString);
//   });

//   it('extract', () => {
//     const answer = extractSectionQuery('i want a section');
//     expect(answer).toBe(false);
//   });
// });
