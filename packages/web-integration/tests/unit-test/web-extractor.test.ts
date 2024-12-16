import { assert } from 'node:console';
import path, { join } from 'node:path';
import { parseContextFromWebPage } from '@/common/utils';
import { generateExtractData } from '@/debug';
import StaticPage from '@/playground/static-page';
import type { WebElementInfo } from '@/web-element';
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
          height: 3000,
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

    it('keep same id after resize', async () => {
      const { page, reset } = await launchPage(
        `file://${pagePath}?resize-after-3s=1`,
        {
          viewport: {
            width: 1080,
            height: 2000,
          },
        },
      );

      const filterTargetElement = (items: WebElementInfo[]) => {
        return items.find((item) => item.attributes?.id === 'J_resize');
      };

      const { content } = await parseContextFromWebPage(page);
      const item = filterTargetElement(content);
      expect(item).toBeDefined();
      // check all the ids are different
      const ids = content.map((item) => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);

      await new Promise((resolve) => setTimeout(resolve, 3000 + 1000));

      const { content: content2 } = await parseContextFromWebPage(page);
      const item2 = filterTargetElement(content2);
      expect(item2).toBeDefined();
      expect(item2?.id).toBe(item?.id);

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
      expect(info.width).toBe(2160);
      expect(info.height).toBe(4000);
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

    it('profiling', async () => {
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
