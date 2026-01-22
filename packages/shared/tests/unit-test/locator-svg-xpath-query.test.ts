/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getElementInfoByXpath,
  getNodeInfoByXpath,
} from '../../src/extractor/locator';

// Setup a real DOM environment with SVG elements
const setupSVGDOM = () => {
  // Create a table with multiple SVG icons
  document.body.innerHTML = `
    <table>
      <tbody>
        <tr>
          <td id="action-cell">
            <svg width="20" height="20" id="svg1">
              <path d="M10 10 L20 20"/>
            </svg>
            <svg width="20" height="20" id="svg2">
              <path d="M10 10 L20 20"/>
            </svg>
            <svg width="20" height="20" id="svg3">
              <path d="M10 10 L20 20"/>
            </svg>
            <svg width="20" height="20" id="svg4">
              <path d="M10 10 L20 20"/>
            </svg>
          </td>
        </tr>
      </tbody>
    </table>
  `;
};

describe('locator - SVG XPath query', () => {
  beforeEach(() => {
    setupSVGDOM();
  });

  it('should query td element by xpath', () => {
    const xpath = '/html/body/table[1]/tbody[1]/tr[1]/td[1]';
    const node = getNodeInfoByXpath(xpath);

    expect(node).not.toBeNull();
    expect(node?.nodeName.toLowerCase()).toBe('td');
  });

  it('should query svg element by xpath with index', () => {
    // This is the critical test - can we query SVG elements by XPath?
    const xpaths = [
      '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[1]',
      '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[2]',
      '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[3]',
      '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[4]',
    ];

    xpaths.forEach((xpath, index) => {
      const node = getNodeInfoByXpath(xpath);
      console.log(`Querying ${xpath}:`, node?.nodeName, (node as any)?.id);

      expect(node).not.toBeNull();
      expect(node?.nodeName.toLowerCase()).toBe('svg');
      expect((node as any)?.id).toBe(`svg${index + 1}`);
    });
  });

  it('should get node for svg by xpath (without rect info in jsdom)', () => {
    // Note: getElementInfoByXpath requires getBoundingClientRect which jsdom doesn't fully support
    // So we only test getNodeInfoByXpath here
    const xpath = '/html/body/table[1]/tbody[1]/tr[1]/td[1]/svg[4]';
    const node = getNodeInfoByXpath(xpath);

    console.log('Node for svg[4]:', node?.nodeName, (node as any)?.id);

    expect(node).not.toBeNull();
    expect(node?.nodeName.toLowerCase()).toBe('svg');
    expect((node as any)?.id).toBe('svg4');
  });
});
