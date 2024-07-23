// import { test, expect, type Page } from '@playwright/test';
// import Insight, { TextElement, query } from 'midscene';
// import { retrieveElements, retrieveOneElement } from 'midscene/query';

// test.beforeEach(async ({ page }) => {
//   await page.goto('https://todomvc.com/examples/react/dist/');
// });

// const TODO_ITEMS = ['buy some cheese', 'feed the cat', 'book a doctors appointment'];

// interface InputBoxSection {
//   element: TextElement;
//   toggleAllBtn: TextElement;
//   placeholder: string;
//   inputValue: string;
// }

// interface TodoItem {
//   name: string;
//   finished: boolean;
// }

// interface ControlLayerSection {
//   numbersLeft: number;
//   tipElement: TextElement;
//   controlElements: TextElement[];
// }

// // A comprehensive parser for page content
// const parsePage = async (page: Page) => {
//   const insight = await Insight.fromPlaywrightPage(page);
//   const todoListPage = await insight.segment({
//     'input-box': query<InputBoxSection>('an input box to type item and a "toggle-all" button', {
//       element: retrieveOneElement('input box'),
//       toggleAllBtn: retrieveOneElement('toggle all button, if exists'),
//       placeholder: 'placeholder string in the input box, string, if exists',
//       inputValue: 'the value in the input box, string, if exists',
//     }),
//     'todo-list': query<{ todoItems: TodoItem[] }>('a list with todo-data (if exists)', {
//       todoItems: '{name: string, finished: boolean}[]',
//     }),
//     'control-layer': query<ControlLayerSection>('status and control layer of todo (if exists)', {
//       numbersLeft: 'number',
//       tipElement: retrieveOneElement(
//         'the element indicates the number of remaining items, like `xx items left`',
//       ),
//       controlElements: retrieveElements('control elements, used to filter items'),
//     }),
//   });

//   return todoListPage;
// };

// test.describe('New Todo', () => {
//   test('should allow me to add todo items', async ({ page }) => {
//     // add a todo item
//     const todoPage = await parsePage(page);
//     const inputBox = todoPage['input-box'];
//     expect(inputBox).toBeTruthy();

//     await page.mouse.click(...inputBox!.element.center);
//     await page.keyboard.type(TODO_ITEMS[0], { delay: 100 });
//     await page.keyboard.press('Enter');

//     // update page parsing result, and check the interface
//     const todoPage2 = await parsePage(page);
//     expect(todoPage2['input-box'].inputValue).toBeFalsy();
//     expect(todoPage2['input-box'].placeholder).toBeTruthy();
//     expect(todoPage2['todo-list'].todoItems.length).toBe(1);
//     expect(todoPage2['todo-list'].todoItems[0].name).toBe(TODO_ITEMS[0]);

//     // add another item
//     await page.mouse.click(...todoPage2['input-box'].element.center);
//     await page.keyboard.type(TODO_ITEMS[1], { delay: 100 });
//     await page.keyboard.press('Enter');

//     // update page parsing result
//     const todoPage3 = await parsePage(page);
//     const items = todoPage3['todo-list'].todoItems;
//     expect(items.length).toBe(2);
//     expect(items[1].name).toEqual(TODO_ITEMS[1]);
//     expect(items.some((item) => item.finished)).toBeFalsy();
//     expect(todoPage3['control-layer'].numbersLeft).toBe(2);

//     // will mark all as completed
//     const toggleBtn = todoPage3['input-box'].toggleAllBtn;
//     expect(toggleBtn).toBeTruthy();
//     expect(todoPage3['todo-list'].todoItems.filter((item) => item.finished).length).toBe(0);

//     await page.mouse.click(...toggleBtn!.center, { delay: 500 });
//     await page.waitForTimeout(3000);

//     const todoPage4 = await parsePage(page);
//     const allItems = todoPage4['todo-list'].todoItems;
//     expect(allItems.length).toBe(2);
//     expect(allItems.filter((item) => item.finished).length).toBe(allItems.length);
//   });
// });
