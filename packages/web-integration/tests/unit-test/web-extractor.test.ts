import { join } from 'node:path';
import { parseContextFromWebPage } from '@/common/utils';
import StaticPage from '@/playground/static-page';
import type { WebElementInfo } from '@/web-element';
import { traverseTree } from '@midscene/shared/extractor';
import { getElementInfosScriptContent } from '@midscene/shared/fs';
import {
  compositeElementInfoImg,
  imageInfoOfBase64,
  saveBase64Image,
} from '@midscene/shared/img';
import { createServer } from 'http-server';
import { beforeAll, describe, expect, it } from 'vitest';
import { launchPage } from '../ai/web/puppeteer/utils';

const pageDir = join(__dirname, './fixtures/web-extractor');
const pagePath = join(pageDir, 'index.html');

describe(
  'extractor',
  () => {
    const port = 8082;
    beforeAll(async () => {
      const localServer = await new Promise((resolve, reject) => {
        const server = createServer({
          root: pageDir,
        });
        server.listen(port, '127.0.0.1', () => {
          resolve(server);
        });
      });

      return () => {
        (localServer as any).server.close();
      };
    });

    it('basic', async () => {
      const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
        viewport: {
          width: 1080,
          height: 3000,
          deviceScaleFactor: 1,
        },
      });

      const { content, tree, screenshotBase64 } =
        await parseContextFromWebPage(page);

      const markedImg = await compositeElementInfoImg({
        inputImgBase64: await page.screenshotBase64(),
        elementsPositionInfo: content,
      });

      await saveBase64Image({
        base64Data: screenshotBase64,
        outputPath: join(pageDir, 'input.png'),
      });
      await saveBase64Image({
        base64Data: markedImg,
        outputPath: join(pageDir, 'output.png'),
      });

      const list = content.map((item) => {
        return {
          content: item.content,
          attributes: item.attributes,
        };
      });

      expect(list).toMatchSnapshot();

      const simplifiedTree = traverseTree(tree!, (node) => {
        return {
          content: node.content,
          indexId: node.indexId,
          attributes: node.attributes,
        } as any;
      });
      expect(simplifiedTree).toMatchSnapshot();
      await reset();
    });

    it('merge children rects of button', async () => {
      const { page, reset } = await launchPage(
        `http://127.0.0.1:${port}/merge-rects.html`,
        {
          viewport: {
            width: 1080,
            height: 3000,
            deviceScaleFactor: 1,
          },
        },
      );

      const { content } = await parseContextFromWebPage(page);

      // Merge children rects of html element
      expect(content[0].rect.width).toBeGreaterThan(25);
      expect(content[0].rect.height).toBeGreaterThan(25);

      // Won't merge rects of text node
      expect(content[1].rect).toEqual({
        left: 8,
        top: 108,
        width: 20,
        height: 20,
        zoom: 1,
        isVisible: true,
      });

      await reset();
    });

    it.skip('keep same id after resize', async () => {
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

    it('profiling', async () => {
      const { page, reset } = await launchPage('https://www.bytedance.com');
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

    it('getElementInfoByXpath from text node by evaluateJavaScript', async () => {
      const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
        viewport: {
          width: 1080,
          height: 3000,
          deviceScaleFactor: 1,
        },
      });
      const elementInfosScriptContent = getElementInfosScriptContent();
      const element = await page.evaluateJavaScript?.(
        `${elementInfosScriptContent}midscene_element_inspector.getElementInfoByXpath('/html/body/div[2]/div/div/ul/li[1]/span/text()[1]')`,
      );
      expect(element.content).toBe('English');
      expect(element.nodeType).toBe('TEXT Node');
      expect(element.attributes).toMatchSnapshot();
      await reset();
    });

    it('getElementInfoByXpath from button node by evaluateJavaScript', async () => {
      const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
        viewport: {
          width: 1080,
          height: 3000,
          deviceScaleFactor: 1,
        },
      });

      const elementInfosScriptContent = getElementInfosScriptContent();
      const element = await page.evaluateJavaScript?.(
        `${elementInfosScriptContent}midscene_element_inspector.getElementInfoByXpath('/html/body/button')`,
      );
      expect(element.nodeType).toBe('BUTTON Node');
      expect(element.attributes).toMatchSnapshot();
      await reset();
    });

    it('getElementInfoByXpath from non form/button/image/text/a/container node by evaluateJavaScript', async () => {
      const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
        viewport: {
          width: 1080,
          height: 3000,
          deviceScaleFactor: 1,
        },
      });

      const elementInfosScriptContent = getElementInfosScriptContent();
      const element = await page.evaluateJavaScript?.(
        `${elementInfosScriptContent}midscene_element_inspector.getElementInfoByXpath('/html/body/div[3]/div')`,
      );
      expect(element).toBe(null);
      await reset();
    });

    it('descriptionOfTree with visibleOnly true', async () => {
      const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
        viewport: {
          width: 1080,
          height: 100,
          deviceScaleFactor: 1,
        },
      });

      const elementInfosScriptContent = getElementInfosScriptContent();
      const description = await page.evaluateJavaScript?.(
        `${elementInfosScriptContent}midscene_element_inspector.webExtractNodeTreeAsString(document, true)`,
      );
      expect(description).not.toContain('This should be collected');
      expect(description).toMatchSnapshot();
      await reset();
    });

    it('descriptionOfTree with visibleOnly false', async () => {
      const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
        viewport: {
          width: 1080,
          height: 100,
          deviceScaleFactor: 1,
        },
      });

      const elementInfosScriptContent = getElementInfosScriptContent();
      const description = await page.evaluateJavaScript?.(
        `${elementInfosScriptContent}midscene_element_inspector.webExtractNodeTreeAsString(document, false)`,
      );
      expect(description).toContain('This should be collected');
      expect(description).toMatchSnapshot();
      await reset();
    });
  },
  {
    timeout: 90 * 1000,
  },
);
