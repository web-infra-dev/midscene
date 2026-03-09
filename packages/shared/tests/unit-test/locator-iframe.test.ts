import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getElementXpath,
  getNodeInfoByXpath,
  getXpathsById,
  getXpathsByPoint,
} from '../../src/extractor/locator';

// ── Mock helpers ──────────────────────────────────────────────────────

class MockElement {
  nodeName: string;
  nodeType = 1; // ELEMENT_NODE
  namespaceURI?: string;
  parentNode: MockElement | null;
  previousElementSibling: MockElement | null = null;
  textContent: string;
  ownerDocument: any = null;
  tagName: string;
  clientLeft = 0;
  clientTop = 0;

  constructor(
    nodeName: string,
    textContent = '',
    namespaceURI?: string,
    parentNode: MockElement | null = null,
  ) {
    this.nodeName = nodeName;
    this.tagName = nodeName.toUpperCase();
    this.namespaceURI = namespaceURI;
    this.textContent = textContent;
    this.parentNode = parentNode;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
}

class MockIframeElement extends MockElement {
  contentWindow: any = null;
  contentDocument: any = null;

  constructor(parentNode: MockElement | null = null) {
    super('iframe', '', undefined, parentNode);
  }

  getBoundingClientRect() {
    return {
      left: 10,
      top: 20,
      right: 310,
      bottom: 220,
      width: 300,
      height: 200,
    };
  }
}

// ── Setup ─────────────────────────────────────────────────────────────

/**
 * Build a mock DOM that looks like:
 *
 *   <html>                        (top-level document)
 *     <body>
 *       <div>
 *         <iframe>                 (contentDocument = iframeDoc)
 *           <html>
 *             <body>
 *               <span>Inside</span>
 *             </body>
 *           </html>
 *         </iframe>
 *       </div>
 *       <button>Top Button</button>
 *     </body>
 *   </html>
 */
function setupIframeMockDOM() {
  global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 } as any;
  global.XPathResult = { ORDERED_NODE_SNAPSHOT_TYPE: 7 } as any;
  global.SVGElement = class {} as any;
  global.HTMLElement = MockElement as any;

  // ── iframe inner document ──
  const iframeHtml = new MockElement('html');
  const iframeBody = new MockElement('body');
  iframeBody.parentNode = iframeHtml;

  const innerSpan = new MockElement('span', 'Inside');
  innerSpan.parentNode = iframeBody;

  const iframeDoc: any = {
    documentElement: iframeHtml,
    body: iframeBody,
    elementFromPoint: (x: number, y: number) => {
      // any point inside iframe returns the span
      return innerSpan as any;
    },
    evaluate: (xpath: string) => {
      const result = { snapshotLength: 0, snapshotItem: () => null as any };
      if (xpath === '/html/body/span[1]') {
        result.snapshotLength = 1;
        result.snapshotItem = () => innerSpan as any;
      } else if (xpath === '/html/body/span[normalize-space()="Inside"]') {
        result.snapshotLength = 1;
        result.snapshotItem = () => innerSpan as any;
      }
      return result;
    },
  };

  const iframeWindow: any = {
    getComputedStyle: () => ({
      paddingLeft: '0',
      paddingTop: '0',
      zoom: '1',
      borderLeftWidth: '0',
      borderTopWidth: '0',
    }),
    frameElement: null as any, // will be set below
    parent: null as any, // will be set below
  };

  iframeHtml.ownerDocument = iframeDoc;
  iframeBody.ownerDocument = iframeDoc;
  innerSpan.ownerDocument = iframeDoc;
  iframeDoc.defaultView = iframeWindow;

  // ── top-level document ──
  const topHtml = new MockElement('html');
  const topBody = new MockElement('body');
  topBody.parentNode = topHtml;

  const div = new MockElement('div');
  div.parentNode = topBody;

  const iframe = new MockIframeElement(div);
  iframe.contentDocument = iframeDoc;
  iframe.contentWindow = iframeWindow;
  iframeWindow.frameElement = iframe;

  const topButton = new MockElement('button', 'Top Button');
  topButton.parentNode = topBody;

  const topDoc: any = {
    documentElement: topHtml,
    body: topBody,
    elementFromPoint: (x: number, y: number) => {
      if (x === 50 && y === 50) return iframe as any; // hit iframe
      if (x === 500 && y === 500) return topButton as any; // hit top button
      return null;
    },
    evaluate: (xpath: string) => {
      const result = { snapshotLength: 0, snapshotItem: () => null as any };
      if (xpath === '/html/body/div[1]/iframe[1]') {
        result.snapshotLength = 1;
        result.snapshotItem = () => iframe as any;
      } else if (xpath === '/html/body/button[1]') {
        result.snapshotLength = 1;
        result.snapshotItem = () => topButton as any;
      }
      return result;
    },
  };

  topHtml.ownerDocument = topDoc;
  topBody.ownerDocument = topDoc;
  div.ownerDocument = topDoc;
  iframe.ownerDocument = topDoc;
  topButton.ownerDocument = topDoc;

  iframeWindow.parent = {
    getComputedStyle: () => ({
      paddingLeft: '0',
      paddingTop: '0',
      zoom: '1',
      borderLeftWidth: '0',
      borderTopWidth: '0',
    }),
  };

  global.document = topDoc;
  global.window = {
    getComputedStyle: () => ({
      paddingLeft: '0',
      paddingTop: '0',
      zoom: '1',
      borderLeftWidth: '0',
      borderTopWidth: '0',
    }),
  } as any;

  return { topDoc, iframeDoc, iframe, innerSpan, topButton, div };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('locator - iframe support', () => {
  beforeEach(() => {
    setupIframeMockDOM();
  });

  describe('getXpathsByPoint', () => {
    it('should penetrate iframe and return compound xpath with |>>| separator', () => {
      // Point (50,50) hits the iframe → should drill into iframeDoc
      const result = getXpathsByPoint({ left: 50, top: 50 }, true);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].includes('|>>|')).toBe(true);
      // Left part should be the iframe xpath inside top document
      expect(result![0]).toMatch(/iframe\[1\]/);
      // Right part should be the element inside iframe
      expect(result![0]).toMatch(/span\[1\]/);
    });

    it('should return plain xpath when element is not inside iframe', () => {
      const result = getXpathsByPoint({ left: 500, top: 500 }, true);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].includes('|>>|')).toBe(false);
      expect(result![0]).toMatch(/button\[1\]/);
    });

    it('should return null for out-of-bounds point', () => {
      const result = getXpathsByPoint({ left: 9999, top: 9999 }, true);
      expect(result).toBeNull();
    });

    it('should use text matching for order-insensitive mode inside iframe', () => {
      const result = getXpathsByPoint({ left: 50, top: 50 }, false);

      expect(result).not.toBeNull();
      expect(result![0].includes('|>>|')).toBe(true);
      expect(result![0]).toMatch(/normalize-space\(\)="Inside"/);
    });

    it('should fall back gracefully when iframe contentDocument is null (cross-origin)', () => {
      // Override: make iframe's contentDocument null
      const { iframe } = setupIframeMockDOM();
      iframe.contentDocument = null;

      // elementFromPoint returns the iframe itself, but cannot drill in
      const result = getXpathsByPoint({ left: 50, top: 50 }, true);

      expect(result).not.toBeNull();
      // Should return xpath for the iframe element itself
      expect(result![0]).toMatch(/iframe/);
      expect(result![0].includes('|>>|')).toBe(false);
    });
  });

  describe('getNodeInfoByXpath', () => {
    it('should resolve compound xpath across iframe boundary', () => {
      const compoundXpath = '/html/body/div[1]/iframe[1]|>>|/html/body/span[1]';
      const node = getNodeInfoByXpath(compoundXpath);

      expect(node).not.toBeNull();
      expect((node as any).nodeName).toBe('span');
      expect((node as any).textContent).toBe('Inside');
    });

    it('should resolve simple xpath in top document', () => {
      const node = getNodeInfoByXpath('/html/body/button[1]');

      expect(node).not.toBeNull();
      expect((node as any).nodeName).toBe('button');
      expect((node as any).textContent).toBe('Top Button');
    });

    it('should return null when iframe xpath part does not match', () => {
      const node = getNodeInfoByXpath(
        '/html/body/div[1]/iframe[99]|>>|/html/body/span[1]',
      );
      expect(node).toBeNull();
    });

    it('should return null when inner xpath does not match', () => {
      const node = getNodeInfoByXpath(
        '/html/body/div[1]/iframe[1]|>>|/html/body/nonexistent[1]',
      );
      expect(node).toBeNull();
    });

    it('should return null when middle segment is not an iframe', () => {
      const node = getNodeInfoByXpath(
        '/html/body/button[1]|>>|/html/body/span[1]',
      );
      // button is not an iframe, so traversal should fail
      expect(node).toBeNull();
    });

    it('should return null for empty xpath', () => {
      expect(getNodeInfoByXpath('')).toBeNull();
    });
  });

  describe('getElementXpath with limitToCurrentDocument', () => {
    it('should stop at document boundary when limitToCurrentDocument is true', () => {
      const { innerSpan } = setupIframeMockDOM();
      // With limitToCurrentDocument=true, should NOT traverse up through iframe
      const xpath = getElementXpath(innerSpan as any, true, true, true);

      expect(xpath.includes('|>>|')).toBe(false);
      expect(xpath).toMatch(/^\/html\/body\/span\[1\]$/);
    });

    it('should traverse iframe boundary when limitToCurrentDocument is false', () => {
      const { innerSpan } = setupIframeMockDOM();
      const xpath = getElementXpath(innerSpan as any, true, true, false);

      expect(xpath.includes('|>>|')).toBe(true);
      expect(xpath).toMatch(/iframe/);
      expect(xpath).toMatch(/span\[1\]$/);
    });
  });
});

describe('locator - nested iframe', () => {
  it('should handle nested iframes (2 levels deep)', () => {
    global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 } as any;
    global.XPathResult = { ORDERED_NODE_SNAPSHOT_TYPE: 7 } as any;
    global.SVGElement = class {} as any;
    global.HTMLElement = MockElement as any;

    // ── inner-most document (level 2) ──
    const innerHtml = new MockElement('html');
    const innerBody = new MockElement('body');
    innerBody.parentNode = innerHtml;
    const deepBtn = new MockElement('button', 'Deep');
    deepBtn.parentNode = innerBody;

    const innerDoc: any = {
      documentElement: innerHtml,
      body: innerBody,
      elementFromPoint: () => deepBtn as any,
      evaluate: (xpath: string) => {
        const r = { snapshotLength: 0, snapshotItem: () => null as any };
        if (xpath === '/html/body/button[1]') {
          r.snapshotLength = 1;
          r.snapshotItem = () => deepBtn as any;
        }
        return r;
      },
    };
    const innerWin: any = {
      getComputedStyle: () => ({
        paddingLeft: '0',
        paddingTop: '0',
        zoom: '1',
        borderLeftWidth: '0',
        borderTopWidth: '0',
      }),
      frameElement: null as any,
      parent: null as any,
    };
    innerHtml.ownerDocument = innerDoc;
    innerBody.ownerDocument = innerDoc;
    deepBtn.ownerDocument = innerDoc;
    innerDoc.defaultView = innerWin;

    // ── middle document (level 1) ──
    const midHtml = new MockElement('html');
    const midBody = new MockElement('body');
    midBody.parentNode = midHtml;
    const innerIframe = new MockIframeElement(midBody);
    innerIframe.contentDocument = innerDoc;
    innerIframe.contentWindow = innerWin;
    innerWin.frameElement = innerIframe;

    const midDoc: any = {
      documentElement: midHtml,
      body: midBody,
      elementFromPoint: () => innerIframe as any,
      evaluate: (xpath: string) => {
        const r = { snapshotLength: 0, snapshotItem: () => null as any };
        if (xpath === '/html/body/iframe[1]') {
          r.snapshotLength = 1;
          r.snapshotItem = () => innerIframe as any;
        }
        return r;
      },
    };
    const midWin: any = {
      getComputedStyle: () => ({
        paddingLeft: '0',
        paddingTop: '0',
        zoom: '1',
        borderLeftWidth: '0',
        borderTopWidth: '0',
      }),
      frameElement: null as any,
      parent: null as any,
    };
    midHtml.ownerDocument = midDoc;
    midBody.ownerDocument = midDoc;
    innerIframe.ownerDocument = midDoc;
    midDoc.defaultView = midWin;
    innerWin.parent = midWin;

    // ── top document ──
    const topHtml = new MockElement('html');
    const topBody = new MockElement('body');
    topBody.parentNode = topHtml;
    const outerIframe = new MockIframeElement(topBody);
    outerIframe.contentDocument = midDoc;
    outerIframe.contentWindow = midWin;
    midWin.frameElement = outerIframe;

    const topDoc: any = {
      documentElement: topHtml,
      body: topBody,
      elementFromPoint: () => outerIframe as any,
      evaluate: (xpath: string) => {
        const r = { snapshotLength: 0, snapshotItem: () => null as any };
        if (xpath === '/html/body/iframe[1]') {
          r.snapshotLength = 1;
          r.snapshotItem = () => outerIframe as any;
        }
        return r;
      },
    };
    topHtml.ownerDocument = topDoc;
    topBody.ownerDocument = topDoc;
    outerIframe.ownerDocument = topDoc;
    midWin.parent = {
      getComputedStyle: () => ({
        paddingLeft: '0',
        paddingTop: '0',
        zoom: '1',
        borderLeftWidth: '0',
        borderTopWidth: '0',
      }),
    };

    global.document = topDoc;
    global.window = {
      getComputedStyle: () => ({
        paddingLeft: '0',
        paddingTop: '0',
        zoom: '1',
        borderLeftWidth: '0',
        borderTopWidth: '0',
      }),
    } as any;

    // ── getXpathsByPoint should produce 2 separators ──
    const result = getXpathsByPoint({ left: 50, top: 50 }, true);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);

    const parts = result![0].split('|>>|');
    expect(parts).toHaveLength(3); // top iframe | mid iframe | deep button

    expect(parts[0]).toMatch(/iframe\[1\]/);
    expect(parts[1]).toMatch(/iframe\[1\]/);
    expect(parts[2]).toMatch(/button\[1\]/);

    // ── getNodeInfoByXpath should resolve all 3 parts ──
    const node = getNodeInfoByXpath(result![0]);
    expect(node).not.toBeNull();
    expect((node as any).nodeName).toBe('button');
    expect((node as any).textContent).toBe('Deep');
  });
});
