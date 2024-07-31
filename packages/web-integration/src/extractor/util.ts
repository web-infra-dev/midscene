// import { TEXT_MAX_SIZE } from './constants';
// @ts-expect-error
import SHA256 from 'js-sha256';

export function logger(..._msg: any[]): void {
  // console.log(...msg);
}

// const nodeIndexCounter = 0;

const taskIdKey = '_midscene_retrieve_task_id';
// const nodeDataIdKey = 'data-midscene-task-';
// const nodeIndexKey = '_midscene_retrieve_node_index';

function selectorForValue(val: number | string): string {
  return `[${taskIdKey}='${val}']`;
}

export function setDataForNode(node: HTMLElement | Node, nodeHash: string): string {
  const taskId = taskIdKey;
  if (!(node instanceof HTMLElement)) {
    return '';
  }
  if (!taskId) {
    console.error('No task id found');
    return '';
  }

  const selector = selectorForValue(nodeHash);
  node.setAttribute(taskIdKey, nodeHash.toString());
  return selector;
}

export function getPseudoElementContent(element: Node): { before: string; after: string } {
  if (!(element instanceof HTMLElement)) {
    return { before: '', after: '' };
  }
  const beforeContent = window.getComputedStyle(element, '::before').getPropertyValue('content');
  const afterContent = window.getComputedStyle(element, '::after').getPropertyValue('content');
  return {
    before: beforeContent === 'none' ? '' : beforeContent.replace(/"/g, ''),
    after: afterContent === 'none' ? '' : afterContent.replace(/"/g, ''),
  };
}

export function hasOverflowY(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.overflowY === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'hidden';
}

export function visibleRect(
  el: HTMLElement | Node | null,
): { left: number; top: number; width: number; height: number } | false {
  if (!el) {
    logger('Element is not in the DOM hierarchy');
    return false;
  }

  if (!(el instanceof HTMLElement)) {
    logger('Element is not in the DOM hierarchy');
    return false;
  }

  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    (style.opacity === '0' && el.tagName !== 'INPUT')
  ) {
    logger('Element is hidden');
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    logger('Element has no size');
    return false;
  }

  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const isInViewport =
    rect.top >= 0 + scrollTop &&
    rect.left >= 0 + scrollLeft &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + scrollTop &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) + scrollLeft;

  if (!isInViewport) {
    logger('Element is not in the viewport');
    logger(rect, window.innerHeight, window.innerWidth, scrollTop, scrollLeft);
    return false;
  }

  let parent: HTMLElement | null = el;
  while (parent && parent !== document.body) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.overflow === 'hidden') {
      const parentRect = parent.getBoundingClientRect();
      const tolerance = 10;
      if (
        rect.top < parentRect.top - tolerance ||
        rect.left < parentRect.left - tolerance ||
        rect.bottom > parentRect.bottom + tolerance ||
        rect.right > parentRect.right + tolerance
      ) {
        logger('Element is clipped by an ancestor', parent, rect, parentRect);
        return false;
      }
    }
    parent = parent.parentElement;
  }

  return {
    left: Math.round(rect.left - scrollLeft),
    top: Math.round(rect.top - scrollTop),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function validTextNodeContent(node: Node): string | false {
  if (!node) {
    return false;
  }
  console.log('node', node);
  if (node.nodeType === Node.COMMENT_NODE) {
    return false;
  }

  const everyChildNodeIsText = Array.from(node.childNodes).findIndex(
    (child) => child.nodeType === Node.TEXT_NODE,
  );

  if (everyChildNodeIsText === -1) {
    return false;
  }

  const content = node.textContent || (node as HTMLElement).innerText;
  if (content && !/^\s*$/.test(content)) {
    return content.trim();
  }

  return false;
}

export function getNodeAttributes(node: HTMLElement | Node): Record<string, string> {
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

export function generateHash(content: string, rect: any, attributes: any): string {
  // Combine the input into a string
  const combined = JSON.stringify({ content, rect, attributes });
  // Generates the ha-256 hash value
  const hashHex = SHA256(combined);
  // Returns the first 10 characters as a short hash
  return hashHex.slice(0, 10);
}
