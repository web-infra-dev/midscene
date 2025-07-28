import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getElementInfoByXpath,
  getNodeInfoByXpath,
  getXpathsById,
  getXpathsByPoint,
} from '../../src/extractor/locator';

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

// Mock global objects needed by locator functions
const setupMockDOM = () => {
  global.Node = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
  } as any;

  // Mock XPathResult constants
  global.XPathResult = {
    ORDERED_NODE_SNAPSHOT_TYPE: 7,
  } as any;

  global.document = {
    documentElement: new MockElement('html'),
    body: new MockElement('body'),
    elementFromPoint: (x: number, y: number) => {
      // Return a mock button element for testing
      if (x === 100 && y === 200) {
        const button = new MockElement('button', 'Click Me');
        const div = new MockElement('div');
        button.parentNode = div;
        div.parentNode = global.document.body as any;
        return button as any;
      }
      // Return null for out-of-bounds points
      return null;
    },
    evaluate: (xpath: string) => {
      // Mock XPath evaluation
      const mockResult = {
        snapshotLength: 0,
        snapshotItem: (index: number) => null,
      };

      // Mock some common xpath patterns
      if (xpath === '/html/body/button[1]') {
        const button = new MockElement('button', 'Test Button');
        mockResult.snapshotLength = 1;
        mockResult.snapshotItem = (index: number) =>
          index === 0 ? (button as any) : null;
      } else if (
        xpath === '/html/body/div[1]/span[normalize-space()="Test Text"]'
      ) {
        const span = new MockElement('span', 'Test Text');
        mockResult.snapshotLength = 1;
        mockResult.snapshotItem = (index: number) =>
          index === 0 ? (span as any) : null;
      } else if (xpath === '/invalid/xpath') {
        mockResult.snapshotLength = 0;
      }

      return mockResult;
    },
  } as any;

  // Mock window with cache list for getNodeFromCacheList
  global.window = {
    midsceneNodeHashCacheList: [],
    HTMLElement: MockElement,
  } as any;

  // For getElementInfoByXpath tests, we'll focus on the main logic
  // and skip the complex DOM manipulation parts

  global.HTMLElement = MockElement as any;
};

describe('locator', () => {
  beforeEach(() => {
    setupMockDOM();
  });

  describe('getXpathsByPoint', () => {
    it('should test basic xpath generation logic', () => {
      // Test with a valid point that should return a button
      const point = { left: 100, top: 200 };

      // Test order-sensitive mode
      const orderSensitiveXpaths = getXpathsByPoint(point, true);
      expect(orderSensitiveXpaths).toBeDefined();
      expect(orderSensitiveXpaths).toHaveLength(1);
      expect(typeof orderSensitiveXpaths?.[0]).toBe('string');
      expect(orderSensitiveXpaths?.[0]).toMatch(/button/);
      expect(orderSensitiveXpaths?.[0]).toMatch(
        /\/html\/body\/div\[1\]\/button\[1\]/,
      );

      // Test order-insensitive mode
      const orderInsensitiveXpaths = getXpathsByPoint(point, false);
      expect(orderInsensitiveXpaths).toBeDefined();
      expect(orderInsensitiveXpaths).toHaveLength(1);
      expect(typeof orderInsensitiveXpaths?.[0]).toBe('string');
      expect(orderInsensitiveXpaths?.[0]).toMatch(/button/);
      expect(orderInsensitiveXpaths?.[0]).toMatch(
        /\/html\/body\/div\[1\]\/button\[normalize-space\(\)="Click Me"\]/,
      );

      // The two modes should generate different xpaths
      expect(orderSensitiveXpaths?.[0]).not.toBe(orderInsensitiveXpaths?.[0]);
      console.log('orderInsensitiveXpaths?.[0]: ', orderInsensitiveXpaths?.[0]);
      console.log('orderSensitiveXpaths?.[0]: ', orderSensitiveXpaths?.[0]);
    });

    it('should return null for invalid points', () => {
      // Test with an invalid point
      const invalidPoint = { left: 2000, top: 2000 };
      const result = getXpathsByPoint(invalidPoint, true);

      expect(result).toBeNull();
    });

    it('should handle SVG elements correctly', () => {
      // Mock an SVG element
      global.document.elementFromPoint = (x: number, y: number) => {
        if (x === 300 && y === 400) {
          const path = new MockElement(
            'path',
            '',
            'http://www.w3.org/2000/svg',
          );
          const svg = new MockElement('svg', '', 'http://www.w3.org/2000/svg');
          const button = new MockElement('button', 'Icon Button');

          path.parentNode = svg;
          svg.parentNode = button;
          button.parentNode = global.document.body as any;

          return path as any;
        }
        return null;
      };

      const point = { left: 300, top: 400 };
      const xpaths = getXpathsByPoint(point, true);

      expect(xpaths).toBeDefined();
      expect(xpaths).toHaveLength(1);
      // Should return the xpath of the button (non-SVG parent), not the path element
      expect(xpaths?.[0]).toMatch(/button/);
      expect(xpaths?.[0]).not.toMatch(/path/);
      expect(xpaths?.[0]).not.toMatch(/svg/);
    });
  });

  describe('xpath format validation', () => {
    it('should generate proper xpath format for order-sensitive mode', () => {
      const point = { left: 100, top: 200 };
      const xpaths = getXpathsByPoint(point, true);

      expect(xpaths?.[0]).toMatch(/^\/html/); // Should start with /html
      expect(xpaths?.[0]).toMatch(/\[\d+\]$/); // Should end with [number] for order-sensitive
    });

    it('should generate proper xpath format for order-insensitive mode', () => {
      const point = { left: 100, top: 200 };
      const xpaths = getXpathsByPoint(point, false);

      expect(xpaths?.[0]).toMatch(/^\/html/); // Should start with /html
      expect(xpaths?.[0]).not.toMatch(/\[\d+\]$/); // Should NOT end with [number] for order-insensitive

      // For elements with text content, should use normalize-space or plain tag name
      expect(xpaths?.[0]).toMatch(/normalize-space\(\)=".*"|button$/);
    });
  });

  describe('getXpathsById', () => {
    beforeEach(() => {
      // Clear the window cache before each test
      (global.window as any).midsceneNodeHashCacheList = [];
    });

    it('should return xpaths for valid cached node id', () => {
      // Setup: Add a mock element to the cache
      const mockButton = new MockElement('button', 'Cached Button');
      const mockDiv = new MockElement('div');
      mockButton.parentNode = mockDiv;
      mockDiv.parentNode = global.document.body as any;

      // Add to window cache
      (global.window as any).midsceneNodeHashCacheList.push({
        node: mockButton,
        id: 'test-id-123',
      });

      const result = getXpathsById('test-id-123');

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result?.[0]).toMatch(/button/);
      expect(result?.[0]).toMatch(/^\/html/);
    });

    it('should return null for non-existent id', () => {
      const result = getXpathsById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should return null for empty cache', () => {
      const result = getXpathsById('any-id');

      expect(result).toBeNull();
    });

    it('should handle different element types', () => {
      // Test with different element types
      const mockSpan = new MockElement('span', 'Test Span');
      const mockInput = new MockElement('input');

      mockSpan.parentNode = global.document.body as any;
      mockInput.parentNode = global.document.body as any;

      // Add to window cache
      (global.window as any).midsceneNodeHashCacheList.push(
        { node: mockSpan, id: 'span-id' },
        { node: mockInput, id: 'input-id' },
      );

      const spanResult = getXpathsById('span-id');
      const inputResult = getXpathsById('input-id');

      expect(spanResult?.[0]).toMatch(/span/);
      expect(inputResult?.[0]).toMatch(/input/);
    });
  });

  describe('getNodeInfoByXpath', () => {
    it('should return node for valid xpath', () => {
      const result = getNodeInfoByXpath('/html/body/button[1]');

      expect(result).toBeDefined();
      expect((result as any).nodeName).toBe('button');
      expect((result as any).textContent).toBe('Test Button');
    });

    it('should return node for xpath with text matching', () => {
      const result = getNodeInfoByXpath(
        '/html/body/div[1]/span[normalize-space()="Test Text"]',
      );

      expect(result).toBeDefined();
      expect((result as any).nodeName).toBe('span');
      expect((result as any).textContent).toBe('Test Text');
    });

    it('should return null for invalid xpath', () => {
      const result = getNodeInfoByXpath('/invalid/xpath');

      expect(result).toBeNull();
    });

    it('should return null for xpath with no matches', () => {
      const result = getNodeInfoByXpath('/html/body/nonexistent[1]');

      expect(result).toBeNull();
    });

    it('should return null for xpath with multiple matches', () => {
      // Mock multiple matches scenario
      const originalEvaluate = global.document.evaluate;
      global.document.evaluate = () => ({
        snapshotLength: 2, // Multiple matches
        snapshotItem: () => new MockElement('div', 'Multiple') as any,
      });

      const result = getNodeInfoByXpath('/html/body/div');

      expect(result).toBeNull();

      // Restore original mock
      global.document.evaluate = originalEvaluate;
    });
  });

  describe('getElementInfoByXpath', () => {
    it('should return null for invalid xpath', () => {
      const result = getElementInfoByXpath('/invalid/xpath');

      expect(result).toBeNull();
    });

    it('should return null when getNodeInfoByXpath returns null', () => {
      const result = getElementInfoByXpath('/html/body/nonexistent[1]');

      expect(result).toBeNull();
    });
  });
});
