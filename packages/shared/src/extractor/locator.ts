import type { ElementInfo } from '.';
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

// Find the first ancestor with an ID
const findFirstAncestorWithId = (element: Element): Element | null => {
  let current = element;

  while (current?.parentElement) {
    if (current.id) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
};

const getElementXPath = (element: Node): string => {
  // deal with text node
  if (element.nodeType === Node.TEXT_NODE) {
    // get parent node xpath
    const parentNode = element.parentNode;
    if (parentNode && parentNode.nodeType === Node.ELEMENT_NODE) {
      const parentXPath = getElementXPath(parentNode);
      return `${parentXPath}`;
    }
    return '';
  }

  if (element.nodeType !== Node.ELEMENT_NODE) return '';

  const el = element as Element;

  // handle html and body tags
  if (el === document.documentElement) {
    return '/html';
  }

  if (el === document.body) {
    return '/html/body';
  }

  // If this element has an ID, return an XPath with the ID
  if (el.id) {
    return `//*[@id="${el.id}"]`;
  }

  const ancestorWithId = findFirstAncestorWithId(el);

  if (ancestorWithId) {
    // Start from the ancestor with ID
    const ancestorPath = `//*[@id="${ancestorWithId.id}"]`;

    // Build the path from the ancestor to this element
    let current: Element | null = el;
    const pathParts: string[] = [];

    while (current && current !== ancestorWithId) {
      const index = getElementIndex(current);
      const tagName = current.nodeName.toLowerCase();
      pathParts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    // Combine the ancestor path with the rest of the path
    return pathParts.length > 0
      ? `${ancestorPath}/${pathParts.join('/')}`
      : ancestorPath;
  }

  // If no parent node, or we need a full path and haven't returned yet,
  // start building the full path
  if (!el.parentNode) {
    return `/${el.nodeName.toLowerCase()}`;
  }

  const index = getElementIndex(el);
  const tagName = el.nodeName.toLowerCase();

  if (el.parentNode) {
    const parentXPath = getElementXPath(el.parentNode);
    return `${parentXPath}/${tagName}[${index}]`;
  }

  return `/${tagName}[${index}]`;
};

function generateXPaths(node: Node | null): string[] {
  if (!node) return [];

  const xPath = getElementXPath(node);

  return [xPath];
}

export function getXpathsById(id: string): string[] | null {
  const node = getNodeFromCacheList(id);

  if (!node) {
    return null;
  }

  return generateXPaths(node);
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
    false,
  );
}
