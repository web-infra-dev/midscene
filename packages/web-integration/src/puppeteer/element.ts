// import { Page } from 'puppeteer';
// import { BaseElement, Rect } from '@/types';

// export class Element implements BaseElement {
//   id: string;

//   attributes: Record<string,string>;

//   nodeType: string;

//   content: string;

//   locator: string;

//   rect: Rect;

//   center: [number, number];

//   page: Page;

//   constructor(options: {
//     id: string, attributes: Record<string, string>, nodeType: string, content: string, rect: Rect, page: Page, locator: string
//   }) {
//     this.id = options.id;
//     this.attributes = options.attributes;
//     this.nodeType = options.nodeType;
//     this.content = options.content;
//     this.rect = options.rect;
//     this.center = [Math.floor(options.rect.left + options.rect.width / 2), Math.floor(options.rect.top + options.rect.height / 2)];
//     this.page = options.page;
//     this.locator = options.locator;
//   }

//   async tap() {
//     await this.page.mouse.click(this.center[0], this.center[1]);
//   }

//   async hover() {
//     console.log('hover');
//   }

//   async type(text: string) {
//     await this.page.keyboard.type(text, { delay: 100 });
//   }

//   async press(key: string) {
//     await this.page.keyboard.press(key as any, { delay: 100 });
//   }
// }
