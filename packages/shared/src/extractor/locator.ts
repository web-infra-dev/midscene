import type { ElementInfo } from '.';
import type { Point } from '../types';
import { isSvgElement } from './dom-util';
import {
  getNodeFromCacheList,
  getRect,
  isElementPartiallyInViewport,
  logger,
} from './util';
import { collectElementInfo } from './web-extractor';

/** Separator for compound XPath across iframes (e.g. "iframePath|>>|/html/body/div") */
const SUB_XPATH_SEPARATOR = '|>>|';

/** Parse the non-standard `zoom` CSS property (Chromium-only) with fallback to 1 */
function parseCSSZoom(style: CSSStyleDeclaration): number {
  return (
    Number.parseFloat(
      (style as CSSStyleDeclaration & { zoom?: string }).zoom ?? '1',
    ) || 1
  );
}

/**
 * Calculate the accumulated offset from an iframe-nested node's document
 * up to the top-level document, accounting for border, padding, and zoom at each level.
 */
function calculateIframeOffset(
  nodeOwnerDoc: Document | null,
  rootDoc: Document | null,
): { left: number; top: number } {
  let leftOffset = 0;
  let topOffset = 0;
  let iterDoc = nodeOwnerDoc;

  while (iterDoc && iterDoc !== rootDoc) {
    try {
      const frameElement = iterDoc.defaultView?.frameElement;
      if (!frameElement) break;

      const rect = (frameElement as Element).getBoundingClientRect();
      const parentWin = iterDoc.defaultView?.parent;

      let borderLeft = 0;
      let borderTop = 0;
      let zoom = 1;
      try {
        if (parentWin) {
          const style = parentWin.getComputedStyle(frameElement as Element);
          borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
          borderTop = Number.parseFloat(style.borderTopWidth) || 0;
          zoom = parseCSSZoom(style);
        }
      } catch {
        // cross-origin iframe style access may fail, use defaults
      }

      leftOffset = leftOffset / zoom + rect.left + borderLeft;
      topOffset = topOffset / zoom + rect.top + borderTop;
      iterDoc = (frameElement as Element).ownerDocument;
    } catch {
      break;
    }
  }

  return { left: leftOffset, top: topOffset };
}

/**
 * Translate a point from the parent window coordinate space into
 * the iframe's local coordinate space.
 */
function translatePointToIframeCoordinates(
  point: { left: number; top: number },
  iframeElement: Element,
  parentWindow: Window,
): { left: number; top: number } {
  const rect = iframeElement.getBoundingClientRect();
  const style = parentWindow.getComputedStyle(iframeElement);
  const clientLeft = iframeElement.clientLeft;
  const clientTop = iframeElement.clientTop;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const zoom = parseCSSZoom(style);

  return {
    left: (point.left - rect.left - clientLeft - paddingLeft) / zoom,
    top: (point.top - rect.top - clientTop - paddingTop) / zoom,
  };
}

const getElementXpathIndex = (element: Element): number => {
  let index = 1;
  let prev = element.previousElementSibling;

  while (prev) {
    if (prev.nodeName.toLowerCase() === element.nodeName.toLowerCase()) {
      index++;
    }
    prev = prev.previousElementSibling;
  }

  return index;
};

const normalizeXpathText = (text: string): string => {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/\s+/g, ' ').trim();
};

const buildCurrentElementXpath = (
  element: Element,
  isOrderSensitive: boolean,
  isLeafElement: boolean,
  limitToCurrentDocument = false,
): string => {
  // Build parent path - inline the buildParentXpath logic
  const parentPath = element.parentNode
    ? getElementXpath(
        element.parentNode,
        isOrderSensitive,
        false,
        limitToCurrentDocument,
      )
    : '';
  const prefix = parentPath ? `${parentPath}/` : '/';
  const tagName = element.nodeName.toLowerCase();
  const textContent = element.textContent?.trim();

  // Check if this is an SVG element (has SVG namespace)
  const isSVGNamespace = element.namespaceURI === 'http://www.w3.org/2000/svg';
  // For SVG elements, we need to use *[name()="tagname"] syntax because
  // XPath's element matching doesn't work with namespaced elements in HTML documents
  const tagSelector = isSVGNamespace ? `*[name()="${tagName}"]` : tagName;

  // Order-sensitive mode: always use index
  if (isOrderSensitive) {
    const index = getElementXpathIndex(element);
    return `${prefix}${tagSelector}[${index}]`;
  }

  // Order-insensitive mode:
  // - Leaf elements: try text first, fallback to index if no text
  // - Non-leaf elements: always use index
  if (isLeafElement && textContent) {
    return `${prefix}${tagSelector}[normalize-space()="${normalizeXpathText(textContent)}"]`;
  }

  // Fallback to index (for non-leaf elements or leaf elements without text)
  const index = getElementXpathIndex(element);
  return `${prefix}${tagSelector}[${index}]`;
};

export const getElementXpath = (
  element: Node,
  isOrderSensitive = false,
  isLeafElement = false,
  limitToCurrentDocument = false,
): string => {
  // process text node
  if (element.nodeType === Node.TEXT_NODE) {
    const parentNode = element.parentNode;
    if (parentNode && parentNode.nodeType === Node.ELEMENT_NODE) {
      const parentXPath = getElementXpath(
        parentNode,
        isOrderSensitive,
        true,
        limitToCurrentDocument,
      );
      const textContent = element.textContent?.trim();
      if (textContent) {
        return `${parentXPath}/text()[normalize-space()="${normalizeXpathText(textContent)}"]`;
      }
      return `${parentXPath}/text()`;
    }
    return '';
  }

  if (element.nodeType !== Node.ELEMENT_NODE) return '';

  const el = element as Element;

  // special element handling (iframe-aware: prefix with frame path when not limitToCurrentDocument)
  try {
    const nodeName = el.nodeName.toLowerCase();
    if (el === el.ownerDocument?.documentElement || nodeName === 'html') {
      if (!limitToCurrentDocument) {
        const frameElement = el.ownerDocument?.defaultView?.frameElement;
        if (frameElement) {
          const framePath = getElementXpath(
            frameElement as Element,
            isOrderSensitive,
            false,
            limitToCurrentDocument,
          );
          return `${framePath}${SUB_XPATH_SEPARATOR}/html`;
        }
      }
      return '/html';
    }
    if (el === el.ownerDocument?.body || nodeName === 'body') {
      if (!limitToCurrentDocument) {
        const frameElement = el.ownerDocument?.defaultView?.frameElement;
        if (frameElement) {
          const framePath = getElementXpath(
            frameElement as Element,
            isOrderSensitive,
            false,
            limitToCurrentDocument,
          );
          return `${framePath}${SUB_XPATH_SEPARATOR}/html/body`;
        }
      }
      return '/html/body';
    }
  } catch (error) {
    logger('[midscene:locator] ownerDocument access failed:', error);
    if (el.nodeName.toLowerCase() === 'html') return '/html';
    if (el.nodeName.toLowerCase() === 'body') return '/html/body';
  }

  if (isSvgElement(el)) {
    const tagName = el.nodeName.toLowerCase();
    if (tagName === 'svg') {
      return buildCurrentElementXpath(
        el,
        isOrderSensitive,
        isLeafElement,
        limitToCurrentDocument,
      );
    }
    let parent = el.parentNode;
    while (parent && parent.nodeType === Node.ELEMENT_NODE) {
      const parentEl = parent as Element;
      if (!isSvgElement(parentEl)) {
        return getElementXpath(
          parentEl,
          isOrderSensitive,
          isLeafElement,
          limitToCurrentDocument,
        );
      }
      const parentTag = parentEl.nodeName.toLowerCase();
      if (parentTag === 'svg') {
        return getElementXpath(
          parentEl,
          isOrderSensitive,
          isLeafElement,
          limitToCurrentDocument,
        );
      }
      parent = parent.parentNode;
    }
    const fallbackParent = el.parentNode;
    if (fallbackParent && fallbackParent.nodeType === Node.ELEMENT_NODE) {
      return getElementXpath(
        fallbackParent as Element,
        isOrderSensitive,
        isLeafElement,
        limitToCurrentDocument,
      );
    }
    return '';
  }

  return buildCurrentElementXpath(
    el,
    isOrderSensitive,
    isLeafElement,
    limitToCurrentDocument,
  );
};

/** Retrieve XPath for a previously cached node by its hash ID.
 *  Returns a local xpath within the node's own document (limitToCurrentDocument=true). */
export function getXpathsById(id: string): string[] | null {
  const node = getNodeFromCacheList(id);
  if (!node) return null;
  const fullXPath = getElementXpath(node, false, true, true);
  return [fullXPath];
}

export function getXpathsByPoint(
  point: Point,
  isOrderSensitive: boolean,
): string[] | null {
  let currentWindow: Window =
    typeof window !== 'undefined' ? window : (undefined as any);
  let currentDocument: Document =
    typeof document !== 'undefined' ? document : (undefined as any);
  let { left, top } = point;
  let depth = 0;
  const MAX_DEPTH = 10;
  let xpathPrefix = '';
  let lastFoundElement: Element | null = null;

  while (depth < MAX_DEPTH) {
    depth++;
    const element = currentDocument.elementFromPoint(left, top);

    if (!element) {
      if (lastFoundElement) {
        const fullXPath = getElementXpath(
          lastFoundElement,
          isOrderSensitive,
          true,
          true,
        );
        return [xpathPrefix + fullXPath];
      }
      return null;
    }

    lastFoundElement = element;

    const tag = element.tagName.toLowerCase();
    if (tag === 'iframe' || tag === 'frame') {
      try {
        const contentWindow = (element as HTMLIFrameElement).contentWindow;
        const contentDocument = (element as HTMLIFrameElement).contentDocument;

        if (contentWindow && contentDocument) {
          const localPoint = translatePointToIframeCoordinates(
            { left, top },
            element,
            currentWindow,
          );
          const currentIframeXpath = getElementXpath(
            element,
            isOrderSensitive,
            false,
            true,
          );
          xpathPrefix += currentIframeXpath + SUB_XPATH_SEPARATOR;
          currentWindow = contentWindow;
          currentDocument = contentDocument;
          left = localPoint.left;
          top = localPoint.top;
          continue;
        }
      } catch (error) {
        logger(
          '[midscene:locator] iframe penetration failed (cross-origin?):',
          error,
        );
      }
    }

    const fullXPath = getElementXpath(element, isOrderSensitive, true, true);
    return [xpathPrefix + fullXPath];
  }

  if (lastFoundElement) {
    const fullXPath = getElementXpath(
      lastFoundElement,
      isOrderSensitive,
      true,
      true,
    );
    return [xpathPrefix + fullXPath];
  }
  return null;
}

export function getNodeInfoByXpath(xpath: string): Node | null {
  const parts = xpath
    .split(SUB_XPATH_SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let currentDocument: Document =
    typeof document !== 'undefined' ? document : (undefined as any);
  let node: Node | null = null;

  for (let i = 0; i < parts.length; i++) {
    const currentXpath = parts[i];
    const xpathResult = currentDocument.evaluate(
      currentXpath,
      currentDocument,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );

    if (xpathResult.snapshotLength !== 1) {
      logger(
        `[midscene:locator] XPath "${currentXpath}" matched ${xpathResult.snapshotLength} elements (expected 1), discarding.`,
      );
      return null;
    }

    node = xpathResult.snapshotItem(0);

    if (i < parts.length - 1) {
      if (
        node &&
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName.toLowerCase() === 'iframe'
      ) {
        try {
          const contentDocument = (node as HTMLIFrameElement).contentDocument;
          if (contentDocument) {
            currentDocument = contentDocument;
          } else {
            logger(
              '[midscene:locator] iframe contentDocument is null (cross-origin?)',
            );
            return null;
          }
        } catch (error) {
          logger(
            '[midscene:locator] iframe contentDocument access failed:',
            error,
          );
          return null;
        }
      } else {
        return null;
      }
    }
  }

  return node;
}

export function getElementInfoByXpath(xpath: string): ElementInfo | null {
  const node = getNodeInfoByXpath(xpath);
  if (!node) return null;

  let targetWindow: Window =
    typeof window !== 'undefined' ? window : (undefined as any);
  let targetDocument: Document =
    typeof document !== 'undefined' ? document : (undefined as any);

  if (node.ownerDocument?.defaultView) {
    targetWindow = node.ownerDocument.defaultView;
    targetDocument = node.ownerDocument;
  }

  const rootDoc = typeof document !== 'undefined' ? document : null;
  const iframeOffset = calculateIframeOffset(
    node.ownerDocument ?? null,
    rootDoc,
  );

  const targetWin = targetWindow as typeof globalThis.window;
  const targetDoc = targetDocument as typeof globalThis.document;
  if (node instanceof (targetWin as any).HTMLElement) {
    const rect = getRect(node, 1, targetWin);
    const isVisible = isElementPartiallyInViewport(
      rect,
      targetWin,
      targetDoc,
      1,
    );
    if (!isVisible) {
      (node as HTMLElement).scrollIntoView({
        behavior: 'instant',
        block: 'center',
      });
    }
  }

  return collectElementInfo(node, targetWin, targetDoc, 1, iframeOffset, true);
}
