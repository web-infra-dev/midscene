/**
 * @vitest-environment jsdom
 *
 * Integration test for iframe-aware XPath locator functions using jsdom.
 * Tests getXpathsByPoint, getNodeInfoByXpath, getElementInfoByXpath with real DOM iframes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getElementXpath,
  getNodeInfoByXpath,
  getXpathsById,
} from '../../src/extractor/locator';
import {
  midsceneGenerateHash,
  setNodeHashCacheListOnWindow,
} from '../../src/extractor/util';

describe('locator - iframe integration (jsdom)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('getNodeInfoByXpath with compound xpath', () => {
    it('should resolve element inside same-origin iframe via compound xpath', () => {
      // Create an iframe with content
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(
        '<html><body><div id="inner-div"><span id="inner-span">Hello from iframe</span></div></body></html>',
      );
      iframeDoc.close();

      // Verify the iframe content is accessible
      const innerSpan = iframeDoc.getElementById('inner-span');
      expect(innerSpan).not.toBeNull();
      expect(innerSpan!.textContent).toBe('Hello from iframe');

      // Build the compound xpath: iframe xpath |>>| inner xpath
      // First get the iframe's xpath in the top document
      const iframeXpath = '/html/body/iframe[1]';
      const innerXpath = '/html/body/div[1]/span[1]';
      const compoundXpath = `${iframeXpath}|>>|${innerXpath}`;

      // Resolve using getNodeInfoByXpath
      const node = getNodeInfoByXpath(compoundXpath);

      expect(node).not.toBeNull();
      expect(node!.nodeName.toLowerCase()).toBe('span');
      expect(node!.textContent).toBe('Hello from iframe');
    });

    it('should resolve element in top document (simple xpath)', () => {
      document.body.innerHTML =
        '<div><button id="top-btn">Top Button</button></div>';

      const node = getNodeInfoByXpath('/html/body/div[1]/button[1]');
      expect(node).not.toBeNull();
      expect((node as Element).id).toBe('top-btn');
    });

    it('should return null when iframe part of compound xpath does not match', () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      iframe.contentDocument!.open();
      iframe.contentDocument!.write(
        '<html><body><span>test</span></body></html>',
      );
      iframe.contentDocument!.close();

      // Wrong iframe index
      const node = getNodeInfoByXpath(
        '/html/body/iframe[99]|>>|/html/body/span[1]',
      );
      expect(node).toBeNull();
    });

    it('should return null when inner part of compound xpath does not match', () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      iframe.contentDocument!.open();
      iframe.contentDocument!.write(
        '<html><body><span>test</span></body></html>',
      );
      iframe.contentDocument!.close();

      const node = getNodeInfoByXpath(
        '/html/body/iframe[1]|>>|/html/body/nonexistent[1]',
      );
      expect(node).toBeNull();
    });

    it('should return null when middle segment is not an iframe element', () => {
      document.body.innerHTML = '<div id="not-iframe">text</div>';

      // /html/body/div[1] is a div, not an iframe - should fail
      const node = getNodeInfoByXpath(
        '/html/body/div[1]|>>|/html/body/span[1]',
      );
      expect(node).toBeNull();
    });

    it('should handle multiple iframes and target correct one', () => {
      // Create two iframes with different content
      const iframe1 = document.createElement('iframe');
      const iframe2 = document.createElement('iframe');
      document.body.appendChild(iframe1);
      document.body.appendChild(iframe2);

      iframe1.contentDocument!.open();
      iframe1.contentDocument!.write(
        '<html><body><p id="p1">First iframe</p></body></html>',
      );
      iframe1.contentDocument!.close();

      iframe2.contentDocument!.open();
      iframe2.contentDocument!.write(
        '<html><body><p id="p2">Second iframe</p></body></html>',
      );
      iframe2.contentDocument!.close();

      // Target second iframe
      const node = getNodeInfoByXpath(
        '/html/body/iframe[2]|>>|/html/body/p[1]',
      );
      expect(node).not.toBeNull();
      expect(node!.textContent).toBe('Second iframe');
    });
  });

  describe('getElementXpath with iframe elements', () => {
    it('should generate compound xpath for element inside iframe (limitToCurrentDocument=false)', () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(
        '<html><body><div><span id="target">Target</span></div></body></html>',
      );
      iframeDoc.close();

      const target = iframeDoc.getElementById('target')!;
      const xpath = getElementXpath(target, true, true, false);

      // Should contain the |>>| separator since element is inside iframe
      expect(xpath.includes('|>>|')).toBe(true);
      expect(xpath).toMatch(/iframe\[1\]/);
      expect(xpath).toMatch(/span\[1\]$/);
    });

    it('should generate local xpath when limitToCurrentDocument=true', () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(
        '<html><body><div><span id="target">Target</span></div></body></html>',
      );
      iframeDoc.close();

      const target = iframeDoc.getElementById('target')!;
      const xpath = getElementXpath(target, true, true, true);

      // Should NOT contain |>>| separator
      expect(xpath.includes('|>>|')).toBe(false);
      expect(xpath).toBe('/html/body/div[1]/span[1]');
    });

    it('should generate plain xpath for top-level elements', () => {
      document.body.innerHTML = '<div><button>Click</button></div>';
      const btn = document.querySelector('button')!;

      const xpath = getElementXpath(btn, true, true, false);
      expect(xpath.includes('|>>|')).toBe(false);
      expect(xpath).toBe('/html/body/div[1]/button[1]');
    });
  });

  describe('roundtrip: getElementXpath → getNodeInfoByXpath', () => {
    it('should roundtrip for element inside iframe', () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(
        '<html><body><ul><li id="item1">First</li><li id="item2">Second</li></ul></body></html>',
      );
      iframeDoc.close();

      const item2 = iframeDoc.getElementById('item2')!;

      // Generate xpath
      const xpath = getElementXpath(item2, true, true, false);
      expect(xpath.includes('|>>|')).toBe(true);

      // Resolve back
      const resolved = getNodeInfoByXpath(xpath);
      expect(resolved).not.toBeNull();
      expect(resolved).toBe(item2);
    });

    it('should roundtrip for top-level element', () => {
      document.body.innerHTML =
        '<div><span id="s1">A</span><span id="s2">B</span></div>';

      const s2 = document.getElementById('s2')!;
      const xpath = getElementXpath(s2, true, true, false);
      const resolved = getNodeInfoByXpath(xpath);

      expect(resolved).toBe(s2);
    });
  });

  describe('node cache integration with iframe', () => {
    it('should cache iframe inner element and retrieve via getXpathsById', () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(
        '<html><body><button id="cached-btn">Cached</button></body></html>',
      );
      iframeDoc.close();

      const btn = iframeDoc.getElementById('cached-btn')!;

      // Cache the node
      setNodeHashCacheListOnWindow();
      const hash = midsceneGenerateHash(btn, 'Cached', {
        left: 10,
        top: 20,
        width: 80,
        height: 30,
      });

      // Retrieve via getXpathsById (uses limitToCurrentDocument=true)
      const xpaths = getXpathsById(hash);
      expect(xpaths).not.toBeNull();
      expect(xpaths).toHaveLength(1);
      // Should be a local xpath (no |>>| since getXpathsById uses limitToCurrentDocument=true)
      expect(xpaths![0].includes('|>>|')).toBe(false);
      expect(xpaths![0]).toMatch(/button/);
    });

    it('should cache and retrieve top-level element', () => {
      document.body.innerHTML = '<div id="top-div">Top</div>';
      const div = document.getElementById('top-div')!;

      setNodeHashCacheListOnWindow();
      const hash = midsceneGenerateHash(div, 'Top', {
        left: 0,
        top: 0,
        width: 100,
        height: 50,
      });

      const xpaths = getXpathsById(hash);
      expect(xpaths).not.toBeNull();
      expect(xpaths![0]).toMatch(/div/);
    });
  });
});
