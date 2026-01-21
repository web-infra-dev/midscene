import { beforeEach, describe, expect, it } from 'vitest';
import { getXpathsByPoint } from '../../src/extractor/locator';

// Mock DOM environment for testing
class MockElement {
  nodeName: string;
  nodeType: number;
  namespaceURI?: string;
  parentNode: MockElement | null;
  previousElementSibling: MockElement | null;
  textContent: string;

  constructor(
    nodeName: string,
    textContent = '',
    namespaceURI?: string,
    parentNode: MockElement | null = null,
  ) {
    this.nodeName = nodeName;
    this.nodeType = 1; // ELEMENT_NODE
    this.namespaceURI = namespaceURI;
    this.textContent = textContent;
    this.parentNode = parentNode;
    this.previousElementSibling = null;
  }
}

// Mock SVG element that extends SVGElement
class MockSVGElement extends MockElement {
  constructor(
    nodeName: string,
    textContent = '',
    parentNode: MockElement | null = null,
  ) {
    super(nodeName, textContent, 'http://www.w3.org/2000/svg', parentNode);
  }
}

// Mock global objects needed by locator functions
const setupMockDOM = () => {
  global.Node = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
  } as any;

  // Mock SVGElement for SVG handling
  global.SVGElement = MockSVGElement as any;

  global.document = {
    documentElement: new MockElement('html'),
    body: new MockElement('body'),
    elementFromPoint: () => null,
  } as any;

  global.window = {} as any;
  global.HTMLElement = MockElement as any;
};

describe('locator - multiple SVG icons', () => {
  beforeEach(() => {
    setupMockDOM();
  });

  it('should distinguish between multiple SVG icons in the same parent (user issue)', () => {
    // Simulate the user's scenario: td[34] with multiple svg children
    // The user has: td[34]/svg[1], td[34]/svg[2], td[34]/svg[3], td[34]/svg[4]
    // Clicking on svg[4] should return xpath ending with /svg[4], not just /td[34]

    global.document.elementFromPoint = (x: number, y: number) => {
      if (x === 100 && y === 100) {
        // Simulate clicking on the 4th SVG icon (the edit icon)
        const tr = new MockElement('tr');
        const td = new MockElement('td');

        // Create 4 SVG icons (like in the user's table)
        const svg1 = new MockSVGElement('svg', '');
        const svg2 = new MockSVGElement('svg', '');
        const svg3 = new MockSVGElement('svg', '');
        const svg4 = new MockSVGElement('svg', ''); // The edit icon

        // Create internal path elements for each SVG
        const path4 = new MockSVGElement('path', '');

        // Set up parent chain
        tr.parentNode = global.document.body as any;
        td.parentNode = tr;
        svg1.parentNode = td;
        svg2.parentNode = td;
        svg3.parentNode = td;
        svg4.parentNode = td;
        path4.parentNode = svg4;

        // Set up sibling chain
        svg1.previousElementSibling = null;
        svg2.previousElementSibling = svg1;
        svg3.previousElementSibling = svg2;
        svg4.previousElementSibling = svg3;

        // Return the path inside svg4 (simulating clicking on the edit icon)
        return path4 as any;
      }
      return null;
    };

    const point = { left: 100, top: 100 };
    const xpaths = getXpathsByPoint(point, true);

    expect(xpaths).toBeDefined();
    expect(xpaths).toHaveLength(1);

    // Should include svg[4] to distinguish from other SVG icons
    expect(xpaths?.[0]).toMatch(/svg\[4\]/);

    // Should not include the internal path element
    expect(xpaths?.[0]).not.toMatch(/path/);

    // Should include the td and svg with proper indices
    expect(xpaths?.[0]).toMatch(/\/td\[1\]\/svg\[4\]$/);

    console.log('XPath for svg[4]:', xpaths?.[0]);
  });

  it('should distinguish between different SVG icons in the same cell', () => {
    // Test that we can generate different xpaths for different SVG icons
    global.document.elementFromPoint = (x: number, y: number) => {
      const tr = new MockElement('tr');
      const td = new MockElement('td');

      const svg1 = new MockSVGElement('svg', '');
      const svg2 = new MockSVGElement('svg', '');
      const svg3 = new MockSVGElement('svg', '');

      tr.parentNode = global.document.body as any;
      td.parentNode = tr;
      svg1.parentNode = td;
      svg2.parentNode = td;
      svg3.parentNode = td;

      svg1.previousElementSibling = null;
      svg2.previousElementSibling = svg1;
      svg3.previousElementSibling = svg2;

      // Return different SVG based on coordinates
      if (x === 100) return svg1 as any;
      if (x === 200) return svg2 as any;
      if (x === 300) return svg3 as any;
      return null;
    };

    const xpath1 = getXpathsByPoint({ left: 100, top: 100 }, true);
    const xpath2 = getXpathsByPoint({ left: 200, top: 100 }, true);
    const xpath3 = getXpathsByPoint({ left: 300, top: 100 }, true);

    // All xpaths should be different
    expect(xpath1?.[0]).not.toBe(xpath2?.[0]);
    expect(xpath2?.[0]).not.toBe(xpath3?.[0]);
    expect(xpath1?.[0]).not.toBe(xpath3?.[0]);

    // Each should have the correct index
    expect(xpath1?.[0]).toMatch(/svg\[1\]$/);
    expect(xpath2?.[0]).toMatch(/svg\[2\]$/);
    expect(xpath3?.[0]).toMatch(/svg\[3\]$/);

    console.log('XPath for svg[1]:', xpath1?.[0]);
    console.log('XPath for svg[2]:', xpath2?.[0]);
    console.log('XPath for svg[3]:', xpath3?.[0]);
  });
});
