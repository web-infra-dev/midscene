import path, { join } from 'node:path';
import { parseContextFromWebPage } from '@/common/utils';
import { generateExtractData } from '@/debug';
import StaticPage from '@/playground/static-page';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';
import { launchPage } from '../ai/web/puppeteer/utils';

const pagePath = join(__dirname, './fixtures/web-extractor/index.html');
describe(
  'extractor',
  () => {
    it('basic', async () => {
      const { page, reset } = await launchPage(`file://${pagePath}`, {
        viewport: {
          width: 1080,
          height: 2000,
        },
      });

      const { content } = await parseContextFromWebPage(page);
      await generateExtractData(
        page,
        path.join(__dirname, 'fixtures/web-extractor'),
        {
          disableInputImage: false,
          disableOutputImage: false,
          disableOutputWithoutTextImg: true,
          disableResizeOutputImg: true,
          disableSnapshot: true,
        },
      );

      const list = content.map((item) => {
        return {
          content: item.content,
          attributes: item.attributes,
        };
      });

      expect(list).toMatchSnapshot();
      await reset();
    });

    it('check screenshot size - 1x', async () => {
      const { page, reset } = await launchPage(`file://${pagePath}`, {
        viewport: {
          width: 1080,
          height: 2000,
          deviceScaleFactor: 1,
        },
      });

      const shotBase64 = await page.screenshotBase64();

      const info = await imageInfoOfBase64(shotBase64);
      expect(info.height).toBe(2000);
      expect(info.width).toBe(1080);
      await reset();
    });

    it('check screenshot size - 2x', async () => {
      const { page, reset } = await launchPage(`file://${pagePath}`, {
        viewport: {
          width: 1080,
          height: 2000,
          deviceScaleFactor: 2,
        },
      });

      const shotBase64 = await page.screenshotBase64();

      const info = await imageInfoOfBase64(shotBase64);
      expect(info.width).toBeLessThanOrEqual(1080); // always 1x for screenshot
      expect(info.height).toBeLessThanOrEqual(2000); // always 1x for screenshot
      await reset();
    });

    it('scroll', async () => {
      const { page, reset } = await launchPage(`file://${pagePath}`, {
        viewport: {
          width: 1080,
          height: 200,
        },
      });
      await page.scrollDownOneScreen();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await generateExtractData(
        page,
        path.join(__dirname, 'fixtures/web-extractor/scroll'),
        {
          disableInputImage: false,
          disableOutputImage: false,
          disableOutputWithoutTextImg: true,
          disableResizeOutputImg: true,
          disableSnapshot: true,
        },
      );
      await reset();
    });

    it('profile ', async () => {
      const { page, reset } = await launchPage('https://webinfra.org/about');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.time('total - parseContextFromWebPage');
      await parseContextFromWebPage(page);
      console.timeEnd('total - parseContextFromWebPage');
      await reset();
    });

    it('static page with fixed context', async () => {
      const fakeContext = {
        foo: 'bar',
      };
      const page = new StaticPage(fakeContext as any);

      const context = await parseContextFromWebPage(page);
      expect(context).toBe(fakeContext);
    });
  },
  {
    timeout: 90 * 1000,
  },
);
