import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('SVG XPath Generation Test', () => {
  let resetFn: () => Promise<void>;

  afterEach(async () => {
    if (resetFn) {
      await resetFn();
    }
  });

  it('should generate XPath with name() for SVG elements', async () => {
    const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>SVG XPath Generation Test</title>
</head>
<body>
  <div id="container">
    <svg id="icon1" width="20" height="20"><path d="M10 10"/></svg>
    <svg id="icon2" width="20" height="20"><path d="M10 10"/></svg>
    <svg id="icon3" width="20" height="20"><path d="M10 10"/></svg>
    <svg id="icon4" width="20" height="20"><path d="M10 10"/></svg>
  </div>
</body>
</html>
    `;

    const testHtmlPath = path.join(
      process.cwd(),
      'midscene_run',
      'test-svg-xpath-gen.html',
    );
    fs.mkdirSync(path.dirname(testHtmlPath), { recursive: true });
    fs.writeFileSync(testHtmlPath, testHtml);

    try {
      const { originPage, reset } = await launchPage(`file://${testHtmlPath}`);
      resetFn = reset;

      // Test XPath generation in the page
      const xpathGenResult = await originPage.evaluate(() => {
        // This is the getElementXpath function from locator.ts
        function getElementXpathIndex(element: Element): number {
          let index = 1;
          let prev = element.previousElementSibling;
          while (prev) {
            if (
              prev.nodeName.toLowerCase() === element.nodeName.toLowerCase()
            ) {
              index++;
            }
            prev = prev.previousElementSibling;
          }
          return index;
        }

        function buildCurrentElementXpath(element: Element): string {
          const parentPath = element.parentNode
            ? getElementXpath(element.parentNode as Element)
            : '';
          const prefix = parentPath ? `${parentPath}/` : '/';
          const tagName = element.nodeName.toLowerCase();

          // Check if this is an SVG element
          const isSVGNamespace =
            element.namespaceURI === 'http://www.w3.org/2000/svg';
          const tagSelector = isSVGNamespace
            ? `*[name()="${tagName}"]`
            : tagName;

          const index = getElementXpathIndex(element);
          return `${prefix}${tagSelector}[${index}]`;
        }

        function getElementXpath(element: Node): string {
          if (element.nodeType !== Node.ELEMENT_NODE) return '';
          const el = element as Element;
          if (el === document.documentElement) return '/html';
          if (el === document.body) return '/html/body';
          return buildCurrentElementXpath(el);
        }

        // Get XPath for the 4th SVG
        const svg4 = document.getElementById('icon4');
        if (!svg4) return { error: 'icon4 not found' };

        const xpath = getElementXpath(svg4);

        // Test if the generated XPath can find the element
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );

        return {
          generatedXPath: xpath,
          canQueryBack: result.snapshotLength > 0,
          foundElementId:
            result.snapshotLength > 0
              ? (result.snapshotItem(0) as any)?.id
              : null,
        };
      });

      console.log(
        'XPath generation result:',
        JSON.stringify(xpathGenResult, null, 2),
      );

      expect(xpathGenResult.generatedXPath).toContain('*[name()="svg"]');
      expect(xpathGenResult.canQueryBack).toBe(true);
      expect(xpathGenResult.foundElementId).toBe('icon4');

      fs.unlinkSync(testHtmlPath);
    } catch (error) {
      const testHtmlPath = path.join(
        process.cwd(),
        'midscene_run',
        'test-svg-xpath-gen.html',
      );
      if (fs.existsSync(testHtmlPath)) {
        fs.unlinkSync(testHtmlPath);
      }
      throw error;
    }
  });
});
