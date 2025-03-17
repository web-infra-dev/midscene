import { generateHashId } from '../utils';
import { extractTextWithPosition } from './web-extractor';

// import { TEXT_MAX_SIZE } from './constants';
const MAX_VALUE_LENGTH = 300;
let debugMode = false;

export function setDebugMode(mode: boolean) {
  debugMode = mode;
}

export function getDebugMode(): boolean {
  return debugMode;
}

export function logger(..._msg: any[]): void {
  if (!debugMode) {
    return;
  }
  console.log(..._msg);
}

// const nodeIndexCounter = 0;

const taskIdKey = '_midscene_retrieve_task_id';
// const nodeDataIdKey = 'data-midscene-task-';
// const nodeIndexKey = '_midscene_retrieve_node_index';

function selectorForValue(val: number | string): string {
  return `[${taskIdKey}='${val}']`;
}

export function setDataForNode(
  node: globalThis.HTMLElement | globalThis.Node,
  nodeHash: string,
  setToParentNode: boolean, // should be false for default
  currentWindow: typeof globalThis.window,
): string {
  const taskId = taskIdKey;
  if (!(node instanceof currentWindow.HTMLElement)) {
    return '';
  }
  if (!taskId) {
    console.error('No task id found');
    return '';
  }

  const selector = selectorForValue(nodeHash);
  if (getDebugMode()) {
    if (setToParentNode) {
      if (node.parentNode instanceof currentWindow.HTMLElement) {
        node.parentNode.setAttribute(taskIdKey, nodeHash.toString());
      }
    } else {
      node.setAttribute(taskIdKey, nodeHash.toString());
    }
  }
  return selector;
}

function isElementPartiallyInViewport(
  rect: ReturnType<typeof getRect>,
  currentWindow: typeof window,
  currentDocument: typeof document,
) {
  const elementHeight = rect.height;
  const elementWidth = rect.width;

  const viewportRect = {
    left: 0,
    top: 0,
    width:
      currentWindow.innerWidth || currentDocument.documentElement.clientWidth,
    height:
      currentWindow.innerHeight || currentDocument.documentElement.clientHeight,
    right:
      currentWindow.innerWidth || currentDocument.documentElement.clientWidth,
    bottom:
      currentWindow.innerHeight || currentDocument.documentElement.clientHeight,
    x: 0,
    y: 0,
    zoom: 1,
  };

  const overlapRect = overlappedRect(rect, viewportRect);
  if (!overlapRect) {
    return false;
  }

  const visibleArea = overlapRect.width * overlapRect.height;
  const totalArea = elementHeight * elementWidth;
  // return visibleArea > 30 * 30 || visibleArea / totalArea >= 2 / 3;
  return visibleArea / totalArea >= 2 / 3;
}

export function getPseudoElementContent(
  element: globalThis.Node,
  currentWindow: typeof globalThis.window,
): {
  before: string;
  after: string;
} {
  if (!(element instanceof currentWindow.HTMLElement)) {
    return { before: '', after: '' };
  }
  const beforeContent = currentWindow
    .getComputedStyle(element, '::before')
    .getPropertyValue('content');
  const afterContent = currentWindow
    .getComputedStyle(element, '::after')
    .getPropertyValue('content');
  return {
    before: beforeContent === 'none' ? '' : beforeContent.replace(/"/g, ''),
    after: afterContent === 'none' ? '' : afterContent.replace(/"/g, ''),
  };
}

export function hasOverflowY(
  element: globalThis.HTMLElement,
  currentWindow: typeof globalThis.window,
): boolean {
  const style = currentWindow.getComputedStyle(element);
  return (
    style.overflowY === 'scroll' ||
    style.overflowY === 'auto' ||
    style.overflowY === 'hidden'
  );
}

export interface ExtractedRect {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  x: number;
  y: number;
  zoom: number;
}

// tell if two rects are overlapped, return the overlapped rect. If not, return null
export function overlappedRect(
  rect1: ExtractedRect,
  rect2: ExtractedRect,
): ExtractedRect | null {
  const left = Math.max(rect1.left, rect2.left);
  const top = Math.max(rect1.top, rect2.top);
  const right = Math.min(rect1.right, rect2.right);
  const bottom = Math.min(rect1.bottom, rect2.bottom);
  if (left < right && top < bottom) {
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
      zoom: 1,
    };
  }
  return null;
}

export function getRect(
  el: globalThis.HTMLElement | globalThis.Node,
  baseZoom: number, // base zoom
  currentWindow: typeof globalThis.window,
): ExtractedRect {
  let originalRect: DOMRect;
  let newZoom = 1;
  if (!(el instanceof currentWindow.HTMLElement)) {
    const range = currentWindow.document.createRange();
    range.selectNodeContents(el);
    originalRect = range.getBoundingClientRect();
  } else {
    originalRect = el.getBoundingClientRect();
    // from Chrome v128, the API would return differently https://docs.google.com/document/d/1AcnDShjT-kEuRaMchZPm5uaIgNZ4OiYtM4JI9qiV8Po/edit
    if (!('currentCSSZoom' in el)) {
      newZoom =
        Number.parseFloat((currentWindow.getComputedStyle(el) as any).zoom) ||
        1;
    }
  }

  const zoom = newZoom * baseZoom;

  return {
    width: originalRect.width * zoom,
    height: originalRect.height * zoom,
    left: originalRect.left * zoom,
    top: originalRect.top * zoom,
    right: originalRect.right * zoom,
    bottom: originalRect.bottom * zoom,
    x: originalRect.x * zoom,
    y: originalRect.y * zoom,
    zoom,
  };
}

const isElementCovered = (
  el: globalThis.HTMLElement | globalThis.Node,
  rect: ExtractedRect,
  currentWindow: typeof globalThis.window,
) => {
  // Gets the center coordinates of the element
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Gets the element above that point
  const topElement = currentWindow.document.elementFromPoint(x, y);
  if (!topElement) {
    return false; // usually because it's outside the screen
  }

  if (topElement === el) {
    return false;
  }
  if (el?.contains(topElement)) {
    return false;
  }

  if ((topElement as HTMLElement)?.contains(el)) {
    return false;
  }

  const rectOfTopElement = getRect(topElement as HTMLElement, 1, currentWindow);

  // get the remaining area of the base element
  const overlapRect = overlappedRect(rect, rectOfTopElement);
  if (!overlapRect) {
    return false;
  }

  // Todo: we should modify the 'box-select' as well to make the indicator more accurate
  // const remainingArea =
  //   rect.width * rect.height - overlapRect.width * overlapRect.height;

  // if (remainingArea > 100) {
  //   return false;
  // }

  logger(el, 'Element is covered by another element', {
    topElement,
    el,
    rect,
    x,
    y,
  });
  return true;
  // Determines if the returned element is the target element itself
  // return el.contains(topElement) || (topElement as HTMLElement).contains(el);
  // return topElement !== el && !el.contains(topElement);
};

export function visibleRect(
  el: globalThis.HTMLElement | globalThis.Node | null,
  currentWindow: typeof globalThis.window,
  currentDocument: typeof globalThis.document,
  baseZoom = 1,
):
  | { left: number; top: number; width: number; height: number; zoom: number }
  | false {
  if (!el) {
    logger(el, 'Element is not in the DOM hierarchy');
    return false;
  }

  if (
    !(el instanceof currentWindow.HTMLElement) &&
    el.nodeType !== Node.TEXT_NODE &&
    el.nodeName.toLowerCase() !== 'svg'
  ) {
    logger(el, 'Element is not in the DOM hierarchy');
    return false;
  }

  if (el instanceof currentWindow.HTMLElement) {
    const style = currentWindow.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      (style.opacity === '0' && el.tagName !== 'INPUT')
    ) {
      logger(el, 'Element is hidden');
      return false;
    }
  }

  const rect = getRect(el, baseZoom, currentWindow);

  if (rect.width === 0 && rect.height === 0) {
    logger(el, 'Element has no size');
    return false;
  }

  // check if the element is covered by another element
  // if the element is zoomed, the coverage check should be done with the original zoom
  if (baseZoom === 1 && isElementCovered(el, rect, currentWindow)) {
    return false;
  }

  const scrollLeft =
    currentWindow.pageXOffset || currentDocument.documentElement.scrollLeft;
  const scrollTop =
    currentWindow.pageYOffset || currentDocument.documentElement.scrollTop;
  const viewportWidth =
    currentWindow.innerWidth || currentDocument.documentElement.clientWidth;
  const viewportHeight =
    currentWindow.innerHeight || currentDocument.documentElement.clientHeight;

  const isPartiallyInViewport = isElementPartiallyInViewport(
    rect,
    currentWindow,
    currentDocument,
  );

  if (!isPartiallyInViewport) {
    logger(el, 'Element is completely outside the viewport', {
      rect,
      viewportHeight,
      viewportWidth,
      scrollTop,
      scrollLeft,
    });
    return false;
  }

  // check if the element is hidden by an ancestor
  let parent: HTMLElement | Node | null = el;
  const parentUntilNonStatic = (currentNode: HTMLElement | Node | null) => {
    // find a parent element that is not static
    let parent = currentNode?.parentElement;
    while (parent) {
      const style = currentWindow.getComputedStyle(parent);
      if (style.position !== 'static') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  };

  while (parent && parent !== currentDocument.body) {
    if (!(parent instanceof currentWindow.HTMLElement)) {
      parent = parent.parentElement;
      continue;
    }
    const parentStyle = currentWindow.getComputedStyle(parent);
    if (parentStyle.overflow === 'hidden') {
      const parentRect = getRect(parent, 1, currentWindow);
      const tolerance = 10;

      if (
        rect.right < parentRect.left - tolerance ||
        rect.left > parentRect.right + tolerance ||
        rect.bottom < parentRect.top - tolerance ||
        rect.top > parentRect.bottom + tolerance
      ) {
        logger(el, 'element is partially or totally hidden by an ancestor', {
          rect,
          parentRect,
        });
        return false;
      }
    }
    // if the parent is a fixed element, stop the search
    if (parentStyle.position === 'fixed' || parentStyle.position === 'sticky') {
      break;
    }

    if (parentStyle.position === 'absolute') {
      parent = parentUntilNonStatic(parent);
    } else {
      parent = parent.parentElement;
    }
  }

  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    zoom: rect.zoom,
  };
}

export function validTextNodeContent(node: globalThis.Node): string | false {
  if (!node) {
    return false;
  }
  if (
    node.nodeType !== Node.ELEMENT_NODE &&
    node.nodeType !== Node.TEXT_NODE &&
    (node as any).nodeName !== '#text'
  ) {
    return false;
  }

  const content = node.textContent || (node as HTMLElement).innerText;
  if (content && !/^\s*$/.test(content)) {
    return content.trim();
  }

  return false;
}

export function getNodeAttributes(
  node: globalThis.HTMLElement | globalThis.Node,
  currentWindow: typeof globalThis.window,
): Record<string, string> {
  if (
    !node ||
    !(node instanceof currentWindow.HTMLElement) ||
    !node.attributes
  ) {
    return {};
  }

  const attributesList = Array.from(node.attributes).map((attr) => {
    if (attr.name === 'class') {
      return [attr.name, `.${attr.value.split(' ').join('.')}`];
    }
    if (!attr.value) {
      return [];
    }

    let value = attr.value;
    if (value.startsWith('data:image')) {
      value = 'image';
    }

    if (value.length > MAX_VALUE_LENGTH) {
      value = `${value.slice(0, MAX_VALUE_LENGTH)}...`;
    }
    return [attr.name, value];
  });

  return Object.fromEntries(attributesList);
}

export function midsceneGenerateHash(
  node: globalThis.Node | null,
  content: string,
  rect: any,
): string {
  const slicedHash = generateHashId(rect, content);

  // Returns the first 10 characters as a short hash
  return slicedHash;
}

export function generateId(numberId: number) {
  //   const letters = 'ABCDEFGHIJKLMNPRSTUVXYZ';
  //   const numbers = '0123456789';
  //   const randomLetter = letters.charAt(Math.floor(Math.random() * letters.length)).toUpperCase();
  // const randomNumber = numbers.charAt(Math.floor(Math.random() * numbers.length));
  // return randomLetter + numberId;
  return `${numberId}`;
}

export function setGenerateHashOnWindow() {
  if (typeof window !== 'undefined') {
    (window as any).midsceneGenerateHash = midsceneGenerateHash;
  }
}

export function setMidsceneVisibleRectOnWindow() {
  if (typeof window !== 'undefined') {
    (window as any).midsceneVisibleRect = visibleRect;
  }
}

export function setExtractTextWithPositionOnWindow() {
  if (typeof window !== 'undefined') {
    (window as any).extractTextWithPosition = extractTextWithPosition;
  }
}

export function getTopDocument(): globalThis.HTMLElement {
  const container: globalThis.HTMLElement = document.body || document;
  return container;
}
