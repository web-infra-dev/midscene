import type { ElementInfo } from '.';
import type { Point } from '../types';
import { getNodeFromCacheList } from './util';
import { getRect, isElementPartiallyInViewport } from './util';
import { collectElementInfo } from './web-extractor';

const getElementIndex = (element: Element): number => {
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

function normalizeText(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/\s+/g, ' ').trim();
}

const getElementXPath = (
  element: Node,
  isOrderSensitive?: boolean,
  isLeafElement?: boolean,
): string => {
  // process text node
  if (element.nodeType === Node.TEXT_NODE) {
    const parentNode = element.parentNode;
    if (parentNode && parentNode.nodeType === Node.ELEMENT_NODE) {
      const parentXPath = getElementXPath(parentNode, true);
      const textContent = element.textContent?.trim();
      if (textContent) {
        return `${parentXPath}/text()[normalize-space()="${normalizeText(textContent)}"]`;
      }
      return `${parentXPath}/text()`;
    }
    return '';
  }

  // process element node
  if (element.nodeType !== Node.ELEMENT_NODE) return '';
  const el = element as Element;

  // special element handling
  if (el === document.documentElement) return '/html';
  if (el === document.body) return '/html/body';

  const isSVG = el.namespaceURI === 'http://www.w3.org/2000/svg';
  const tagName = el.nodeName.toLowerCase();

  // if the element is any SVG element, find the nearest non-SVG ancestor
  if (isSVG) {
    let parent = el.parentNode;
    while (parent && parent.nodeType === Node.ELEMENT_NODE) {
      const parentEl = parent as Element;
      if (parentEl.namespaceURI !== 'http://www.w3.org/2000/svg') {
        return getElementXPath(parent, isOrderSensitive, isLeafElement);
      }
      parent = parent.parentNode;
    }
    // fallback if no non-SVG parent found
    return getElementXPath(el.parentNode!, isOrderSensitive, isLeafElement);
  }

  const textContent = el.textContent?.trim();

  // build parent path
  const buildParentPath = () => {
    if (!el.parentNode) return '';
    return getElementXPath(el.parentNode, true);
  };

  // build current element xpath
  const buildCurrentElement = (useIndex: boolean, useText?: boolean) => {
    const parentPath = buildParentPath();
    const prefix = parentPath ? `${parentPath}/` : '/';

    if (useText && textContent) {
      return `${prefix}${tagName}[normalize-space()="${normalizeText(textContent)}"]`;
    }
    if (useIndex) {
      const index = getElementIndex(el);
      return `${prefix}${tagName}[${index}]`;
    }
    return `${prefix}${tagName}`;
  };

  // decide which format to use
  if (isOrderSensitive) {
    // order sensitive: always use index
    return buildCurrentElement(true);
  }

  if (isLeafElement) {
    // leaf element: use text matching first, otherwise use index
    return buildCurrentElement(false, true);
  }

  // non-leaf element: use index
  return buildCurrentElement(true);
};

function generateXPaths(
  node: Node | null,
  isOrderSensitive?: boolean,
): string[] {
  if (!node) return [];

  const fullXPath = getElementXPath(node, isOrderSensitive, true);

  return [fullXPath];
}

export function getXpathsById(id: string): string[] | null {
  const node = getNodeFromCacheList(id);

  if (!node) {
    return null;
  }

  return generateXPaths(node);
}

export function getXpathsByPoint(
  point: Point,
  isOrderSensitive: boolean,
): string[] | null {
  const element = document.elementFromPoint(point.left, point.top);

  if (!element) {
    return null;
  }

  return generateXPaths(element, isOrderSensitive);
}

export function getNodeInfoByXpath(xpath: string): Node | null {
  const xpathResult = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  );

  if (xpathResult.snapshotLength !== 1) {
    return null;
  }

  const node = xpathResult.snapshotItem(0);

  return node;
}

export function getElementInfoByXpath(xpath: string): ElementInfo | null {
  const node = getNodeInfoByXpath(xpath);

  if (!node) {
    return null;
  }

  if (node instanceof HTMLElement) {
    // only when the element is not completely in the viewport, call scrollIntoView
    const rect = getRect(node, 1, window);
    const isVisible = isElementPartiallyInViewport(rect, window, document, 1);

    if (!isVisible) {
      node.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }

  return collectElementInfo(
    node,
    window,
    document,
    1,
    {
      left: 0,
      top: 0,
    },
    true,
  );
}
