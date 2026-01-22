import type { ElementInfo } from '.';
import type { Point } from '../types';
import { isSvgElement } from './dom-util';
import { getRect, isElementPartiallyInViewport } from './util';
import { collectElementInfo } from './web-extractor';

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
): string => {
  // Build parent path - inline the buildParentXpath logic
  const parentPath = element.parentNode
    ? getElementXpath(element.parentNode, isOrderSensitive)
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
): string => {
  // process text node
  if (element.nodeType === Node.TEXT_NODE) {
    const parentNode = element.parentNode;
    if (parentNode && parentNode.nodeType === Node.ELEMENT_NODE) {
      // For text nodes, treat parent as leaf element to enable text matching
      const parentXPath = getElementXpath(parentNode, isOrderSensitive, true);
      const textContent = element.textContent?.trim();
      if (textContent) {
        return `${parentXPath}/text()[normalize-space()="${normalizeXpathText(textContent)}"]`;
      }
      return `${parentXPath}/text()`;
    }
    return '';
  }

  // process element node
  if (element.nodeType !== Node.ELEMENT_NODE) return '';

  // process element node - at this point, element should be an Element
  const el = element as Element;

  // special element handling
  if (el === document.documentElement) return '/html';
  if (el === document.body) return '/html/body';

  // if the element is any SVG element, handle based on tag type
  if (isSvgElement(el)) {
    const tagName = el.nodeName.toLowerCase();

    // For top-level <svg> tag, include it in the path to distinguish between multiple SVG icons
    // This is important when there are multiple SVG elements under the same parent (e.g., td[34]/svg[1], td[34]/svg[2])
    if (tagName === 'svg') {
      // Include the <svg> tag with its index in the XPath
      return buildCurrentElementXpath(el, isOrderSensitive, isLeafElement);
    }

    // For SVG child elements (path, circle, rect, etc.), skip to the nearest <svg> ancestor
    // These internal elements are usually decorative and can change frequently
    let parent = el.parentNode;
    while (parent && parent.nodeType === Node.ELEMENT_NODE) {
      const parentEl = parent as Element;
      if (isSvgElement(parentEl)) {
        const parentTag = parentEl.nodeName.toLowerCase();
        if (parentTag === 'svg') {
          // Found the <svg> container, return its path
          return getElementXpath(parentEl, isOrderSensitive, isLeafElement);
        }
      } else {
        // Found a non-SVG ancestor, return its path
        return getElementXpath(parentEl, isOrderSensitive, isLeafElement);
      }
      parent = parent.parentNode;
    }
    // fallback if no suitable parent found
    const fallbackParent = el.parentNode;
    if (fallbackParent && fallbackParent.nodeType === Node.ELEMENT_NODE) {
      return getElementXpath(
        fallbackParent as Element,
        isOrderSensitive,
        isLeafElement,
      );
    }
    return '';
  }

  // decide which format to use
  return buildCurrentElementXpath(el, isOrderSensitive, isLeafElement);
};

export function getXpathsByPoint(
  point: Point,
  isOrderSensitive: boolean,
): string[] | null {
  const element = document.elementFromPoint(point.left, point.top);

  if (!element) {
    return null;
  }

  const fullXPath = getElementXpath(element, isOrderSensitive, true);
  return [fullXPath];
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
    console.warn(
      `[midscene:warning] Received XPath "${xpath}" but it matched ${xpathResult.snapshotLength} elements. Discarding this result.`,
    );
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

  // Check if the node is an element that can be scrolled into view
  // This includes both HTMLElement and SVGElement
  if (node instanceof Element) {
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
