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
  textContent: string;
  parentNode: MockElement | null;
  previousElementSibling: MockElement | null;

  constructor(tagName: string, textContent = '', nodeType = 1) {
    this.nodeName = tagName.toUpperCase();
    this.nodeType = nodeType;
    this.textContent = textContent;
    this.parentNode = null;
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
    evaluate: vi.fn(),
    elementFromPoint: vi.fn(),
  } as any;

  global.console = {
    warn: vi.fn(),
  } as any;

  // Reset cache
  global.window = {
    midsceneNodeHashCacheList: [],
  } as any;
};

describe('XPath Error Handling', () => {
  beforeEach(() => {
    setupMockDOM();
    vi.clearAllMocks();
  });

  describe('getNodeInfoByXpath', () => {
    it('should handle malformed XPath expressions gracefully', () => {
      // Mock document.evaluate to throw an error (like a malformed XPath)
      (global.document.evaluate as any).mockImplementation(() => {
        throw new Error('Invalid XPath expression');
      });

      const result = getNodeInfoByXpath('//invalid[xpath][');

      expect(result).toBeNull();
      expect(global.console.warn).toHaveBeenCalledWith(
        'XPath evaluation failed:',
        expect.any(Error),
      );
    });

    it('should return null when document.evaluate succeeds but returns no matches', () => {
      // Mock document.evaluate to return empty result
      (global.document.evaluate as any).mockReturnValue({
        snapshotLength: 0,
        snapshotItem: () => null,
      });

      const result = getNodeInfoByXpath('/html/body/nonexistent');

      expect(result).toBeNull();
      expect(global.console.warn).not.toHaveBeenCalled();
    });

    it('should return null when document.evaluate returns multiple matches', () => {
      // Mock document.evaluate to return multiple results
      (global.document.evaluate as any).mockReturnValue({
        snapshotLength: 2,
        snapshotItem: () => new MockElement('div'),
      });

      const result = getNodeInfoByXpath('/html/body/div');

      expect(result).toBeNull();
      expect(global.console.warn).not.toHaveBeenCalled();
    });

    it('should return node when document.evaluate returns exactly one match', () => {
      const mockElement = new MockElement('div', 'Test');
      // Mock document.evaluate to return single result
      (global.document.evaluate as any).mockReturnValue({
        snapshotLength: 1,
        snapshotItem: () => mockElement,
      });

      const result = getNodeInfoByXpath('/html/body/div[1]');

      expect(result).toBe(mockElement);
      expect(global.console.warn).not.toHaveBeenCalled();
    });
  });

  describe('getXpathsByPoint', () => {
    it('should handle errors in document.elementFromPoint gracefully', () => {
      // Mock document.elementFromPoint to throw an error
      (global.document.elementFromPoint as any).mockImplementation(() => {
        throw new Error('elementFromPoint failed');
      });

      const result = getXpathsByPoint({ left: 100, top: 200 }, true);

      expect(result).toBeNull();
      expect(global.console.warn).toHaveBeenCalledWith(
        'XPath generation by point failed:',
        expect.any(Error),
      );
    });

    it('should return null when document.elementFromPoint returns null', () => {
      // Mock document.elementFromPoint to return null
      (global.document.elementFromPoint as any).mockReturnValue(null);

      const result = getXpathsByPoint({ left: 100, top: 200 }, true);

      expect(result).toBeNull();
      expect(global.console.warn).not.toHaveBeenCalled();
    });
  });

  describe('getXpathsById', () => {
    it('should return null when node is not found in cache', () => {
      const result = getXpathsById('nonexistent-id');

      expect(result).toBeNull();
      expect(global.console.warn).not.toHaveBeenCalled();
    });
  });

  describe('getElementInfoByXpath', () => {
    it('should handle xpath evaluation errors in getNodeInfoByXpath', () => {
      // Mock document.evaluate to throw an error
      (global.document.evaluate as any).mockImplementation(() => {
        throw new Error('XPath evaluation failed');
      });

      const result = getElementInfoByXpath('//invalid[xpath][');

      expect(result).toBeNull();
      expect(global.console.warn).toHaveBeenCalledWith(
        'XPath evaluation failed:',
        expect.any(Error),
      );
    });
  });
});
