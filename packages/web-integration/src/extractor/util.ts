import SHA256 from 'js-sha256';
import { extractTextWithPosition } from './web-extractor';

// import { TEXT_MAX_SIZE } from './constants';
let debugMode = false;
let frameId = 0;

export function setDebugMode(mode: boolean) {
  debugMode = mode;
}

export function getDebugMode(): boolean {
  return debugMode;
}

export function getFrameId(): number {
  return frameId;
}

export function setFrameId(id: number) {
  frameId = id;
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
  node: HTMLElement | Node,
  nodeHash: string,
  setToParentNode = false,
): string {
  const taskId = taskIdKey;
  if (!(node instanceof Element)) {
    return '';
  }
  if (!taskId) {
    console.error('No task id found');
    return '';
  }

  const selector = selectorForValue(nodeHash);
  if (getDebugMode()) {
    if (setToParentNode) {
      if (node.parentNode instanceof HTMLElement) {
        node.parentNode.setAttribute(taskIdKey, nodeHash.toString());
      }
    } else {
      node.setAttribute(taskIdKey, nodeHash.toString());
    }
  }
  return selector;
}

function isElementPartiallyInViewport(rect: ReturnType<typeof getRect>) {
  const elementHeight = rect.height;
  const elementWidth = rect.width;

  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth;

  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
  );
  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
  );

  const visibleArea = visibleHeight * visibleWidth;
  const totalArea = elementHeight * elementWidth;

  return visibleArea / totalArea >= 2 / 3;
}

export function getPseudoElementContent(element: Node): {
  before: string;
  after: string;
} {
  if (!(element instanceof HTMLElement)) {
    return { before: '', after: '' };
  }
  const beforeContent = window
    .getComputedStyle(element, '::before')
    .getPropertyValue('content');
  const afterContent = window
    .getComputedStyle(element, '::after')
    .getPropertyValue('content');
  return {
    before: beforeContent === 'none' ? '' : beforeContent.replace(/"/g, ''),
    after: afterContent === 'none' ? '' : afterContent.replace(/"/g, ''),
  };
}

export function hasOverflowY(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
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

export function getRect(el: HTMLElement | Node, baseZoom = 1): ExtractedRect {
  let originalRect: DOMRect;
  let newZoom = 1;
  if (!(el instanceof HTMLElement)) {
    const range = document.createRange();
    range.selectNodeContents(el);
    originalRect = range.getBoundingClientRect();
  } else {
    originalRect = el.getBoundingClientRect();
    // from Chrome v128, the API would return differently https://docs.google.com/document/d/1AcnDShjT-kEuRaMchZPm5uaIgNZ4OiYtM4JI9qiV8Po/edit
    if (!('currentCSSZoom' in el)) {
      newZoom = Number.parseFloat(window.getComputedStyle(el).zoom) || 1;
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

const isElementCovered = (el: HTMLElement | Node, rect: ExtractedRect) => {
  // Gets the center coordinates of the element
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Gets the element above that point
  const topElement = document.elementFromPoint(x, y);
  if (topElement === el) {
    return false;
  }
  if (el?.contains(topElement)) {
    return false;
  }
  if ((topElement as HTMLElement)?.contains(el)) {
    return false;
  }

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
  el: HTMLElement | Node | null,
  baseZoom = 1,
):
  | { left: number; top: number; width: number; height: number; zoom: number }
  | false {
  if (!el) {
    logger(el, 'Element is not in the DOM hierarchy');
    return false;
  }

  if (
    !(el instanceof HTMLElement) &&
    el.nodeType !== Node.TEXT_NODE &&
    el.nodeName.toLowerCase() !== 'svg'
  ) {
    logger(el, 'Element is not in the DOM hierarchy');
    return false;
  }

  if (el instanceof HTMLElement) {
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      (style.opacity === '0' && el.tagName !== 'INPUT')
    ) {
      logger(el, 'Element is hidden');
      return false;
    }
  }

  const rect = getRect(el, baseZoom);

  if (rect.width === 0 && rect.height === 0) {
    logger(el, 'Element has no size');
    return false;
  }

  // check if the element is covered by another element
  // if the element is zoomed, the coverage check should be done with the original zoom
  if (baseZoom === 1 && isElementCovered(el, rect)) {
    return false;
  }

  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;

  const isPartiallyInViewport = isElementPartiallyInViewport(rect);

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

  let parent: HTMLElement | Node | null = el;
  while (parent && parent !== document.body) {
    if (!(parent instanceof HTMLElement)) {
      parent = parent.parentElement;
      continue;
    }
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.overflow === 'hidden') {
      const parentRect = getRect(parent, 1);
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
    parent = parent.parentElement;
  }

  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    zoom: rect.zoom,
  };
}

export function validTextNodeContent(node: Node): string | false {
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

  // const everyChildNodeIsText = Array.from(node.childNodes).every((child) => {
  //   const tagName = ((child as HTMLElement).tagName || '').toLowerCase();
  //   if (
  //     tagName === 'script' ||
  //     tagName === 'style' ||
  //     tagName === 'link' ||
  //     tagName !== '#text'
  //   ) {
  //     return false;
  //   }
  //   return true;
  // });

  // if (!everyChildNodeIsText) {
  //   return false;
  // }

  const content = node.textContent || (node as HTMLElement).innerText;
  if (content && !/^\s*$/.test(content)) {
    return content.trim();
  }

  return false;
}

export function getNodeAttributes(
  node: HTMLElement | Node,
): Record<string, string> {
  if (!node || !(node instanceof HTMLElement) || !node.attributes) {
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
      value = `${value.split('base64,')[0]}...`;
    }

    const maxLength = 50;
    if (value.length > maxLength) {
      value = `${value.slice(0, maxLength)}...`;
    }
    return [attr.name, value];
  });

  return Object.fromEntries(attributesList);
}

export function midsceneGenerateHash(content: string, rect: any): string {
  // Combine the input into a string
  const combined = JSON.stringify({
    content,
    rect,
    _midscene_frame_id: getFrameId(),
  });
  // Generates the ha-256 hash value
  // @ts-expect-error
  const hashHex = SHA256(combined);
  // Returns the first 10 characters as a short hash
  return hashHex.slice(0, 10);
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

export function getDocument(): HTMLElement {
  const container: HTMLElement = document.body || document;
  return container;
}
