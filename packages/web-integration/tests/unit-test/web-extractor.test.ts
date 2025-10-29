import { join } from 'node:path';
import { WebPageContextParser } from '@/web-element';
import type { WebElementInfo } from '@/web-element';
import {
  descriptionOfTree,
  traverseTree,
  treeToList,
} from '@midscene/shared/extractor';
import {
  compositeElementInfoImg,
  imageInfoOfBase64,
  saveBase64Image,
} from '@midscene/shared/img';
import { getElementInfosScriptContent } from '@midscene/shared/node';
import { createServer } from 'http-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchPage } from '../ai/web/puppeteer/utils';

const pageDir = join(__dirname, './fixtures/web-extractor');
const pagePath = join(pageDir, 'index.html');

describe(
  'extractor',
  {
    timeout: 90 * 1000,
  },
  () => {
    const port = 8082;
    let localServer: any;

    beforeAll(async () => {
      localServer = await new Promise((resolve, reject) => {
        const server = createServer({
          root: pageDir,
        });
        server.listen(port, '127.0.0.1', () => {
          resolve(server);
        });
        server.server.on('error', reject);
      });
    });

    afterAll(() => {
      if (localServer?.server) {
        localServer.server.close();
      }
    });

    it('basic', async () => {
      const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
        viewport: {
          width: 1080,
          height: 3000,
          deviceScaleFactor: 1,
        },
      });

      const tree = await page.getElementsNodeTree?.();
      const description = await await descriptionOfTree(tree, 200, false, true);
      const screenshotBase64 = await page.screenshotBase64();

      // const { tree, screenshotBase64 } = await WebPageContextParser(page, {});
      const content = treeToList(tree);
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

      const tree = await page.getElementsNodeTree?.();
      const content = treeToList(tree);
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

      const tree = await page.getElementsNodeTree?.();

      const content = treeToList(tree);
      const item = filterTargetElement(content);
      expect(item).toBeDefined();
      // check all the ids are different
      const ids = content.map((item) => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);

      await new Promise((resolve) => setTimeout(resolve, 3000 + 1000));

      const tree2 = await page.getElementsNodeTree?.();
      const content2 = treeToList(tree2);
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
      console.time('total - WebPageContextParser');
      await WebPageContextParser(page, {});
      console.timeEnd('total - WebPageContextParser');
      await reset();
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
      expect(description.split('\n').length).toBeLessThan(100);
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
      expect(description.split('\n').length).toBeGreaterThan(200);
      await reset();
    });

    describe('locator functions integration tests', () => {
      it('getXpathsByPoint should work with order-sensitive and order-insensitive modes', async () => {
        const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
          viewport: {
            width: 1080,
            height: 3000,
            deviceScaleFactor: 1,
          },
        });

        const elementInfosScriptContent = getElementInfosScriptContent();

        // Test clicking on the button element
        const orderSensitiveXpaths = await page.evaluateJavaScript?.(
          `${elementInfosScriptContent}midscene_element_inspector.getXpathsByPoint({left: 100, top: 400}, true)`,
        );

        const orderInsensitiveXpaths = await page.evaluateJavaScript?.(
          `${elementInfosScriptContent}midscene_element_inspector.getXpathsByPoint({left: 100, top: 400}, false)`,
        );

        expect(orderSensitiveXpaths).toBeDefined();
        expect(orderInsensitiveXpaths).toBeDefined();
        expect(orderSensitiveXpaths).toHaveLength(1);
        expect(orderInsensitiveXpaths).toHaveLength(1);

        // Order sensitive should end with [number]
        expect(orderSensitiveXpaths[0]).toMatch(/\[\d+\]$/);

        // Order insensitive should not end with [number] (use text matching or plain tag)
        expect(orderInsensitiveXpaths[0]).not.toMatch(/\[\d+\]$/);

        // Should be different
        expect(orderSensitiveXpaths[0]).not.toBe(orderInsensitiveXpaths[0]);

        await reset();
      });

      it('getElementInfoByXpath should work with text content matching', async () => {
        const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
          viewport: {
            width: 1080,
            height: 3000,
            deviceScaleFactor: 1,
          },
        });

        const elementInfosScriptContent = getElementInfosScriptContent();

        // Test xpath with normalize-space text matching - this may match the text node
        const elementInfo = await page.evaluateJavaScript?.(
          `${elementInfosScriptContent}midscene_element_inspector.getElementInfoByXpath('/html/body/div[2]/div/div/ul/li[1]/span[normalize-space()="English"]')`,
        );

        expect(elementInfo).toBeDefined();
        expect(elementInfo.content).toBe('English');
        // The xpath might match either the span element or its text node
        expect(['SPAN Node', 'TEXT Node']).toContain(elementInfo.nodeType);

        await reset();
      });

      it('getXpathsByPoint should handle elements with special characters', async () => {
        const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
          viewport: {
            width: 1080,
            height: 3000,
            deviceScaleFactor: 1,
          },
        });

        const elementInfosScriptContent = getElementInfosScriptContent();

        // Look for elements with Chinese text or special characters
        const point = { left: 600, top: 500 }; // Adjust coordinates as needed
        const xpaths = await page.evaluateJavaScript?.(
          `${elementInfosScriptContent}midscene_element_inspector.getXpathsByPoint(${JSON.stringify(point)}, false)`,
        );

        expect(xpaths[0]).toMatch(/^\/html/);
        // Should handle special characters in xpath text matching
        if (xpaths[0].includes('normalize-space')) {
          expect(xpaths[0]).toMatch(/normalize-space\(\)="[^"]*"/);
        }

        await reset();
      });

      it('cacheFeatureForRect should work correctly', async () => {
        const { page, reset } = await launchPage(`http://127.0.0.1:${port}`, {
          viewport: {
            width: 1080,
            height: 3000,
            deviceScaleFactor: 1,
          },
        });

        // Target a button element with text content
        // Use coordinates that will hit an actual element with text
        const rect = {
          left: 100,
          top: 400,
          width: 100,
          height: 40,
        };

        // Call cacheFeatureForRect
        const cacheFeature = await page.cacheFeatureForRect?.(rect);

        expect(cacheFeature).toBeDefined();
        const xpaths = (cacheFeature as any)?.xpaths as string[] | undefined;
        expect(xpaths).toBeDefined();
        expect(xpaths?.length).toBeGreaterThan(0);

        const xpath = xpaths?.[0];
        expect(xpath).toMatch(/^\/html/);

        await reset();
      });
    });
  },
);
