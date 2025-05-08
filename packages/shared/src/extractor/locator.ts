import { isTextElement } from './dom-util';
import { getNodeFromCacheList } from './util';

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
  let node = getNodeFromCacheList(id);

  if (!node) {
    return null;
  }

  if (isTextElement(node)) {
    node = node.parentElement;
  }

  return generateXPaths(node);
}
