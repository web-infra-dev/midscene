/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getXpathsByPoint } from '../../src/extractor/locator';

// Test the exact scenario from user's issue
describe('locator - SVG XPath index issue', () => {
  beforeEach(() => {
    // Create a table cell with 4 SVG icons (like the user's scenario)
    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td id="action-cell">
              <svg id="icon1" width="20" height="20"><path d="M10 10"/></svg>
              <svg id="icon2" width="20" height="20"><path d="M10 10"/></svg>
              <svg id="icon3" width="20" height="20"><path d="M10 10"/></svg>
              <svg id="icon4" width="20" height="20"><path d="M10 10"/></svg>
            </td>
          </tr>
        </tbody>
      </table>
    `;
  });

  it('should generate correct xpath index for svg elements', () => {
    // Get all SVG elements
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBe(4);

    // Test XPath for each SVG
    const xpaths = [
      '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[1]',
      '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[2]',
      '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[3]',
      '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[4]',
    ];

    xpaths.forEach((xpath, index) => {
      console.log(`Testing XPath: ${xpath}`);

      // Use document.evaluate to query the element
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );

      console.log(`  Matched: ${result.snapshotLength} element(s)`);

      expect(result.snapshotLength).toBe(1);

      if (result.snapshotLength > 0) {
        const node = result.snapshotItem(0);
        console.log(`  Node id: ${(node as any).id}`);
        expect((node as any).id).toBe(`icon${index + 1}`);
      }
    });
  });

  it('should verify svg index calculation using previousElementSibling', () => {
    const svgs = document.querySelectorAll('svg');

    // Manually calculate index for each SVG using the same logic as getElementXpathIndex
    svgs.forEach((svg, expectedIndex) => {
      let index = 1;
      let prev = svg.previousElementSibling;

      while (prev) {
        if (prev.nodeName.toLowerCase() === svg.nodeName.toLowerCase()) {
          index++;
        }
        prev = prev.previousElementSibling;
      }

      console.log(`SVG id=${(svg as any).id}, calculated index=${index}, expected=${expectedIndex + 1}`);
      expect(index).toBe(expectedIndex + 1);
    });
  });

  it('should test xpath generation and query roundtrip for svg[4]', () => {
    // Simulate clicking on the 4th SVG icon (clicking on the path inside)
    const svg4 = document.getElementById('icon4');
    const path4 = svg4?.querySelector('path');

    expect(svg4).not.toBeNull();
    expect(path4).not.toBeNull();

    // Mock elementFromPoint to return the path inside svg4
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => path4 as any;

    try {
      // Generate XPath by clicking on the path
      const xpaths = getXpathsByPoint({ left: 100, top: 100 }, true);

      console.log('Generated XPath:', xpaths?.[0]);
      expect(xpaths).not.toBeNull();
      expect(xpaths?.[0]).toMatch(/svg\[4\]/);

      // Now try to query back using the generated XPath
      const generatedXpath = xpaths?.[0];
      if (generatedXpath) {
        const result = document.evaluate(
          generatedXpath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );

        console.log(`Query result: ${result.snapshotLength} element(s)`);
        expect(result.snapshotLength).toBe(1);

        const foundNode = result.snapshotItem(0);
        console.log('Found node id:', (foundNode as any)?.id);
        expect(foundNode).toBe(svg4);
      }
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });
});
