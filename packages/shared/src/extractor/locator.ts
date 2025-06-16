import type { ElementInfo } from '.';
import { isButtonElement, isFormElement } from './dom-util';
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

// Get the index of a text node among its siblings of the same type
const getTextNodeIndex = (textNode: Node): number => {
  let index = 1;
  let current = textNode.previousSibling;

  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      index++;
    }
    current = current.previousSibling;
  }

  return index;
};

// Helper function to create normalize-space condition
const createNormalizeSpaceCondition = (textContent: string): string => {
  return `[normalize-space()="${textContent}"]`;
};

// Helper function to add text content to xpath if applicable
const addTextContentToXPath = (el: Node, baseXPath: string): string => {
  const textContent = el.textContent?.trim();
  if (textContent && (isButtonElement(el) || isFormElement(el))) {
    // add text content for leaf elements before text node
    return `${baseXPath}${createNormalizeSpaceCondition(textContent)}`;
  }
  return baseXPath;
};

const getElementXPath = (element: Node): string => {
  // deal with text node
  if (element.nodeType === Node.TEXT_NODE) {
    // get parent node xpath
    const parentNode = element.parentNode;
    if (parentNode && parentNode.nodeType === Node.ELEMENT_NODE) {
      const parentXPath = getElementXPath(parentNode);
      const textIndex = getTextNodeIndex(element);
      const textContent = element.textContent?.trim();

      // If we have text content, include it in the xpath for better matching
      if (textContent) {
        return `${parentXPath}/text()[${textIndex}]${createNormalizeSpaceCondition(textContent)}`;
      }
      return `${parentXPath}/text()[${textIndex}]`;
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

  const index = getElementIndex(el);
  const tagName = el.nodeName.toLowerCase();

  // If no parent node, return just the tag name
  if (!el.parentNode) {
    const baseXPath = `/${tagName}`;
    return addTextContentToXPath(el, baseXPath);
  }

  const parentXPath = getElementXPath(el.parentNode);
  const baseXPath = `${parentXPath}/${tagName}[${index}]`;
  return addTextContentToXPath(el, baseXPath);
};

function generateXPaths(node: Node | null): string[] {
  if (!node) return [];

  const fullXPath = getElementXPath(node);

  return [fullXPath];
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

  return collectElementInfo(node, window, document, 1, {
    left: 0,
    top: 0,
  });
}
