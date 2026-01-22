import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('SVG XPath Debug', () => {
  let resetFn: () => Promise<void>;

  afterEach(async () => {
    if (resetFn) {
      await resetFn();
    }
  });

  it('should debug SVG XPath query', async () => {
    const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>SVG Debug Test</title>
  <style>
    svg {
      width: 24px;
      height: 24px;
      margin: 5px;
      cursor: pointer;
      fill: #1890ff;
    }
  </style>
</head>
<body>
  <h1>SVG Debug</h1>
  <table>
    <tbody>
      <tr>
        <td id="actions">
          <svg id="icon1" viewBox="0 0 1024 1024">
            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448"/>
          </svg>
          <svg id="icon2" viewBox="0 0 1024 1024">
            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448"/>
          </svg>
          <svg id="icon3" viewBox="0 0 1024 1024">
            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448"/>
          </svg>
          <svg id="icon4" viewBox="0 0 1024 1024">
            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448"/>
          </svg>
        </td>
      </tr>
    </tbody>
  </table>
  <div id="result">Not clicked</div>
  <script>
    // Add click handlers
    document.querySelectorAll('svg').forEach((svg, index) => {
      svg.onclick = () => {
        document.getElementById('result').innerText = 'Clicked: icon' + (index + 1);
      };
    });
  </script>
</body>
</html>
    `;

    const testHtmlPath = path.join(
      process.cwd(),
      'midscene_run',
      'test-svg-debug.html',
    );
    fs.mkdirSync(path.dirname(testHtmlPath), { recursive: true });
    fs.writeFileSync(testHtmlPath, testHtml);

    try {
      const { originPage, reset } = await launchPage(`file://${testHtmlPath}`);
      resetFn = reset;

      // Test XPath query directly in the page
      const xpathToTest = '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[4]';

      console.log(`\n=== Testing XPath: ${xpathToTest} ===`);

      // First, let's check what SVG elements exist
      const svgInfo = await originPage.evaluate(() => {
        const svgs = document.querySelectorAll('svg');
        return Array.from(svgs).map((svg, index) => ({
          index: index + 1,
          id: svg.id,
          nodeName: svg.nodeName,
          tagName: svg.tagName,
          namespaceURI: svg.namespaceURI,
        }));
      });
      console.log('SVG elements in page:', JSON.stringify(svgInfo, null, 2));

      // Test different XPath variations
      const xpathVariations = [
        xpathToTest,
        '/html/body/table[1]/tbody[1]/tr[1]/td[1]/*[4]', // Use * instead of svg
        '/html/body/table[1]/tbody[1]/tr[1]/td[1]/*[name()="svg"][4]', // Use name()
        '//svg[@id="icon4"]', // Use ID
      ];

      for (const xpath of xpathVariations) {
        const result = await originPage.evaluate((xp) => {
          const res = document.evaluate(
            xp,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
          );
          return {
            xpath: xp,
            count: res.snapshotLength,
            element:
              res.snapshotLength > 0
                ? {
                    nodeName: res.snapshotItem(0)?.nodeName,
                    id: (res.snapshotItem(0) as any)?.id,
                  }
                : null,
          };
        }, xpath);
        console.log('XPath test:', JSON.stringify(result, null, 2));
      }

      const queryResult = await originPage.evaluate((xpath) => {
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );

        if (result.snapshotLength === 0) {
          return { success: false, message: 'No element found' };
        }

        const node = result.snapshotItem(0);
        if (!node) {
          return { success: false, message: 'Node is null' };
        }

        const svgElement = node as SVGElement;
        const rect = svgElement.getBoundingClientRect();

        return {
          success: true,
          nodeName: svgElement.nodeName,
          id: svgElement.id,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          isVisible: rect.width > 0 && rect.height > 0,
        };
      }, xpathToTest);

      console.log('Query result:', JSON.stringify(queryResult, null, 2));

      expect(queryResult.success).toBe(true);
      expect(queryResult.nodeName).toBe('svg');
      expect(queryResult.id).toBe('icon4');
      expect(queryResult.isVisible).toBe(true);

      // Now test through getElementInfoByXpath
      console.log('\n=== Testing through getElementInfoByXpath ===');

      const elementInfo = await originPage.evaluate((xpath) => {
        // This is the code from locator.ts
        const xpathResult = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );

        if (xpathResult.snapshotLength !== 1) {
          return {
            error: `XPath matched ${xpathResult.snapshotLength} elements`,
          };
        }

        const node = xpathResult.snapshotItem(0);
        if (!node) {
          return { error: 'Node is null' };
        }

        // Check if it's an Element
        if (!(node instanceof Element)) {
          return { error: 'Node is not an Element', nodeType: node.nodeType };
        }

        const element = node as Element;

        // Try to get rect
        try {
          const rect = element.getBoundingClientRect();
          return {
            success: true,
            nodeName: element.nodeName,
            id: (element as any).id,
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          };
        } catch (error: any) {
          return {
            error: 'Failed to get rect',
            message: error.message,
          };
        }
      }, xpathToTest);

      console.log('ElementInfo result:', JSON.stringify(elementInfo, null, 2));

      fs.unlinkSync(testHtmlPath);
    } catch (error) {
      const testHtmlPath = path.join(
        process.cwd(),
        'midscene_run',
        'test-svg-debug.html',
      );
      if (fs.existsSync(testHtmlPath)) {
        fs.unlinkSync(testHtmlPath);
      }
      throw error;
    }
  });
});
