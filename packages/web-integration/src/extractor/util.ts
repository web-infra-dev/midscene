// import { TEXT_MAX_SIZE } from './constants';
import SHA256 from 'js-sha256';

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
  node: HTMLElement | Node,
  nodeHash: string,
): string {
  const taskId = taskIdKey;
  if (!(node instanceof HTMLElement)) {
    return '';
  }
  if (!taskId) {
    console.error('No task id found');
    return '';
  }

  const selector = selectorForValue(nodeHash);
  if (getDebugMode()) {
    node.setAttribute(taskIdKey, nodeHash.toString());
  }
  return selector;
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

function getRect(el: HTMLElement | Node): {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  x: number;
  y: number;
} {
  if (!(el instanceof HTMLElement)) {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect();
  }
  return el.getBoundingClientRect();
}

export function visibleRect(
  el: HTMLElement | Node | null,
): { left: number; top: number; width: number; height: number } | false {
  if (!el) {
    logger(el, 'Element is not in the DOM hierarchy');
    return false;
  }

  if (!(el instanceof HTMLElement) && el.nodeType !== Node.TEXT_NODE) {
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

  const rect = getRect(el);

  if (rect.width === 0 && rect.height === 0) {
    logger(el, 'Element has no size');
    return false;
  }

  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;

  const isPartiallyInViewport =
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewportWidth &&
    rect.top < viewportHeight;

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
      const parentRect = parent.getBoundingClientRect();
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
    return [attr.name, attr.value];
  });

  return Object.fromEntries(attributesList);
}

export function midsceneGenerateHash(content: string, rect: any): string {
  // Combine the input into a string
  const combined = JSON.stringify({ content, rect });
  // Generates the ha-256 hash value
  // @ts-expect-error
  const hashHex = SHA256(combined);
  // Returns the first 10 characters as a short hash
  return hashHex.slice(0, 10);
}

(window as any).midsceneGenerateHash = midsceneGenerateHash;
(window as any).midsceneVisibleRect = visibleRect;
