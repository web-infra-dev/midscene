import type { LocateResultElement } from '../types';

export function isFormElement(node: globalThis.Node) {
  return (
    node instanceof HTMLElement &&
    (node.tagName.toLowerCase() === 'input' ||
      node.tagName.toLowerCase() === 'textarea' ||
      node.tagName.toLowerCase() === 'select' ||
      node.tagName.toLowerCase() === 'option')
  );
}

export function isButtonElement(
  node: globalThis.Node,
): node is globalThis.HTMLButtonElement {
  return node instanceof HTMLElement && node.tagName.toLowerCase() === 'button';
}

export function isAElement(
  node: globalThis.Node,
): node is globalThis.HTMLButtonElement {
  return node instanceof HTMLElement && node.tagName.toLowerCase() === 'a';
}

export function isSvgElement(
  node: globalThis.Node,
): node is globalThis.SVGSVGElement {
  return node instanceof SVGElement;
}

export function isImgElement(
  node: globalThis.Node,
): node is globalThis.HTMLImageElement {
  // check if the node is an image element
  if (!includeBaseElement(node) && node instanceof Element) {
    const computedStyle = window.getComputedStyle(node);
    const backgroundImage = computedStyle.getPropertyValue('background-image');
    if (backgroundImage !== 'none') {
      return true;
    }
  }

  if (isIconfont(node)) {
    return true;
  }

  return (
    (node instanceof HTMLElement && node.tagName.toLowerCase() === 'img') ||
    (node instanceof SVGElement && node.tagName.toLowerCase() === 'svg')
  );
}

function isIconfont(node: globalThis.Node): boolean {
  if (node instanceof Element) {
    const computedStyle = window.getComputedStyle(node);
    const fontFamilyValue = computedStyle.fontFamily || '';
    return fontFamilyValue.toLowerCase().indexOf('iconfont') >= 0;
  }

  return false;
}

export function isNotContainerElement(node: globalThis.Node) {
  return (
    isTextElement(node) ||
    isIconfont(node) ||
    isImgElement(node) ||
    isButtonElement(node) ||
    isAElement(node) ||
    isFormElement(node)
  );
}

export function isTextElement(
  node: globalThis.Node,
): node is globalThis.HTMLTextAreaElement {
  if (node instanceof Element) {
    if (node?.childNodes?.length === 1 && node?.childNodes[0] instanceof Text) {
      return true;
    }
  }

  return node.nodeName?.toLowerCase?.() === '#text' && !isIconfont(node);
}

export function isContainerElement(
  node: globalThis.Node,
): node is globalThis.HTMLElement {
  if (!(node instanceof HTMLElement)) return false;

  // include other base elements
  if (includeBaseElement(node)) {
    return false;
  }

  const computedStyle = window.getComputedStyle(node);
  const backgroundColor = computedStyle.getPropertyValue('background-color');
  if (backgroundColor) {
    return true;
  }

  return false;
}

function includeBaseElement(node: globalThis.Node) {
  if (!(node instanceof HTMLElement)) return false;

  // include text
  if (node.innerText) {
    return true;
  }

  const includeList = [
    'svg',
    'button',
    'input',
    'textarea',
    'select',
    'option',
    'img',
    'a',
  ];

  for (const tagName of includeList) {
    const element = node.querySelectorAll(tagName);
    if (element.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a LocateResultElement from a point.
 * This function creates an expanded rect around the given center point.
 *
 * Note: Center coordinates should be integers for pixel-aligned positioning.
 * If decimal values are provided, they will be used as-is, which may result in
 * non-pixel-aligned rect positions.
 *
 * The rect positioning behavior:
 * - When edgeSize is even: center is at the top-left of the four center pixels
 *   For example, with edgeSize=4 and center=[10, 10]:
 *   □□□□
 *   □■□□  (■ represents the center point at pixel 10)
 *   □□□□
 *   □□□□
 *
 * - When edgeSize is odd: center is at the exact middle pixel
 *   For example, with edgeSize=5 and center=[10, 10]:
 *   □□□□□
 *   □□■□□  (■ represents the center point at pixel 10)
 *   □□□□□
 *
 * @param center - Center point coordinates as [x, y] (should be integers)
 * @param description - Description of the element
 * @param edgeSize - Size to expand around the center point (default: 8)
 * @returns A LocateResultElement with rect, center, and description
 */
export function generateElementByPoint(
  center: [number, number],
  description: string,
  edgeSize = 8,
): LocateResultElement {
  const [centerX, centerY] = center;
  const offset = Math.ceil(edgeSize / 2) - 1;
  const expandedRect = {
    left: Math.max(centerX - offset, 0),
    top: Math.max(centerY - offset, 0),
    width: edgeSize,
    height: edgeSize,
  };

  return {
    rect: expandedRect,
    center: [centerX, centerY] as [number, number],
    description: description || '',
  };
}

/**
 * Generate a LocateResultElement from a rect.
 * This function calculates the center point from the rect and expands the rect by edgeSize.
 *
 * Note: The rect uses inclusive coordinates where:
 * - A rect from [left=10, top=10] with [width=1, height=1] covers exactly 1 pixel
 * - The actual pixel range is [left, left+width) which means width pixels
 *
 * @param sourceRect - The source rect to generate element from (typically contains integer values)
 * @param description - Description of the element
 * @param edgeSize - Size to expand around the center point (default: 8)
 * @returns A LocateResultElement with rect, center (always integers), and description
 */
export function generateElementByRect(
  sourceRect: { left: number; top: number; width: number; height: number },
  description: string,
  edgeSize = 8,
): LocateResultElement {
  /**
   * Calculate center point from rect
   * For width/height calculation: if we have pixels from left to left+width-1 (width pixels total),
   * the center is at left + (width-1)/2
   *
   * - If width/height is even: centerX/Y lands on the top-left pixel of the four center pixels
   * - for example, the width/height is 6
   * □□□□□□
   * □□□□□□
   * □□■□□□
   * □□□□□□
   * □□□□□□
   * □□□□□□
   *
   * - If width/height is odd: centerX/Y lands on the exact middle pixel
   * - for example, the width/height is 5
   * □□□□□
   * □□□□□
   * □□■□□
   * □□□□□
   * □□□□□
   */
  const centerX = sourceRect.left + Math.floor((sourceRect.width - 1) / 2);
  const centerY = sourceRect.top + Math.floor((sourceRect.height - 1) / 2);

  return generateElementByPoint([centerX, centerY], description, edgeSize);
}
