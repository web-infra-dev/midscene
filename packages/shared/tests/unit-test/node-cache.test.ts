import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getXpathsById } from '../../src/extractor/locator';
import {
  getNodeFromCacheList,
  midsceneGenerateHash,
  setNodeHashCacheListOnWindow,
  setNodeToCacheList,
} from '../../src/extractor/util';

describe('node cache', () => {
  beforeEach(() => {
    global.window = {} as any;
    global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 } as any;
    global.SVGElement = class {} as any;
    global.XPathResult = { ORDERED_NODE_SNAPSHOT_TYPE: 7 } as any;
    (global.window as any).midsceneNodeHashCache = undefined;
  });

  afterEach(() => {
    (global.window as any).midsceneNodeHashCache = undefined;
  });

  describe('setNodeHashCacheListOnWindow', () => {
    it('should initialize an empty Map on window', () => {
      setNodeHashCacheListOnWindow();
      const cache = (window as any).midsceneNodeHashCache;
      expect(cache).toBeInstanceOf(Map);
      expect(cache.size).toBe(0);
    });

    it('should reset existing cache when called again', () => {
      setNodeHashCacheListOnWindow();
      setNodeToCacheList({ nodeName: 'div' } as any, 'x');
      setNodeHashCacheListOnWindow();
      expect((window as any).midsceneNodeHashCache.size).toBe(0);
    });
  });

  describe('setNodeToCacheList / getNodeFromCacheList', () => {
    it('should cache a node and retrieve it by id', () => {
      setNodeHashCacheListOnWindow();
      const mockNode = { nodeName: 'div' } as any;
      setNodeToCacheList(mockNode, 'abc123');

      const found = getNodeFromCacheList('abc123');
      expect(found).toBe(mockNode);
    });

    it('should return undefined for unknown id', () => {
      setNodeHashCacheListOnWindow();
      expect(getNodeFromCacheList('nonexistent')).toBeUndefined();
    });

    it('should not duplicate entries with same id', () => {
      setNodeHashCacheListOnWindow();
      const node1 = { nodeName: 'span' } as any;
      const node2 = { nodeName: 'div' } as any;

      setNodeToCacheList(node1, 'dup-id');
      setNodeToCacheList(node2, 'dup-id');

      // First one wins
      expect(getNodeFromCacheList('dup-id')).toBe(node1);
      // Map should have exactly 1 entry for this id
      const cache = (window as any).midsceneNodeHashCache as Map<string, any>;
      expect(cache.get('dup-id')).toBe(node1);
    });

    it('should not cache when cache is not initialized', () => {
      // Do NOT call setNodeHashCacheListOnWindow
      const mockNode = { nodeName: 'p' } as any;
      setNodeToCacheList(mockNode, 'no-init');

      expect(getNodeFromCacheList('no-init')).toBeUndefined();
    });

    it('should auto-initialize cache via midsceneGenerateHash', () => {
      // midsceneGenerateHash auto-initializes the cache
      const mockNode = { nodeName: 'p' } as any;
      midsceneGenerateHash(mockNode, 'content', {
        left: 0,
        top: 0,
        width: 10,
        height: 10,
      });

      // The node should be cached via the generated hash
      expect(
        getNodeFromCacheList(
          midsceneGenerateHash(null, 'content', {
            left: 0,
            top: 0,
            width: 10,
            height: 10,
          }),
        ),
      ).toBe(mockNode);
    });

    it('should evict oldest entry when cache exceeds max size', () => {
      setNodeHashCacheListOnWindow();

      // Fill cache beyond the limit (NODE_CACHE_MAX_SIZE = 2000)
      for (let i = 0; i < 2001; i++) {
        setNodeToCacheList({ nodeName: `node-${i}` } as any, `id-${i}`);
      }

      // First entry should have been evicted
      expect(getNodeFromCacheList('id-0')).toBeUndefined();
      // Last entry should still exist
      expect(getNodeFromCacheList('id-2000')).toBeDefined();
    });
  });

  describe('midsceneGenerateHash', () => {
    it('should cache the node when generating a hash', () => {
      const mockNode = { nodeName: 'button' } as any;
      const hash = midsceneGenerateHash(mockNode, 'click me', {
        left: 10,
        top: 20,
        width: 100,
        height: 40,
      });

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);

      const found = getNodeFromCacheList(hash);
      expect(found).toBe(mockNode);
    });

    it('should not crash when node is null', () => {
      const hash = midsceneGenerateHash(null, 'text', {
        left: 0,
        top: 0,
        width: 50,
        height: 50,
      });
      expect(typeof hash).toBe('string');
    });

    it('should produce same hash for same content+rect', () => {
      const rect = { left: 1, top: 2, width: 3, height: 4 };
      const h1 = midsceneGenerateHash(null, 'same', rect);
      const h2 = midsceneGenerateHash(null, 'same', rect);
      expect(h1).toBe(h2);
    });

    it('should produce different hashes for different content', () => {
      const rect = { left: 1, top: 2, width: 3, height: 4 };
      const h1 = midsceneGenerateHash(null, 'aaa', rect);
      const h2 = midsceneGenerateHash(null, 'bbb', rect);
      expect(h1).not.toBe(h2);
    });
  });

  describe('getXpathsById', () => {
    it('should return xpath for a cached node', () => {
      const mockBody = {
        nodeName: 'body',
        nodeType: 1,
        tagName: 'BODY',
        ownerDocument: null as any,
        parentNode: null as any,
        previousElementSibling: null,
        textContent: '',
      };
      const mockHtml = {
        nodeName: 'html',
        nodeType: 1,
        tagName: 'HTML',
        ownerDocument: null as any,
        parentNode: null,
        previousElementSibling: null,
        textContent: '',
      };
      const mockDoc = {
        documentElement: mockHtml,
        body: mockBody,
      };
      mockHtml.ownerDocument = mockDoc;
      mockBody.ownerDocument = mockDoc;
      mockBody.parentNode = mockHtml;

      const mockSpan = {
        nodeName: 'span',
        nodeType: 1,
        tagName: 'SPAN',
        parentNode: mockBody,
        previousElementSibling: null,
        textContent: 'Hello',
        ownerDocument: mockDoc,
        namespaceURI: undefined,
      };

      global.document = mockDoc as any;

      setNodeHashCacheListOnWindow();
      setNodeToCacheList(mockSpan as any, 'cached-hash');

      const result = getXpathsById('cached-hash');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toMatch(/span/);
      expect(result![0]).toMatch(/normalize-space\(\)="Hello"/);
    });

    it('should return null for uncached id', () => {
      setNodeHashCacheListOnWindow();
      const result = getXpathsById('not-cached');
      expect(result).toBeNull();
    });
  });
});
