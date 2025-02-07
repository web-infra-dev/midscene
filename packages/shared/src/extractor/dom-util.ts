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

export function isTextElement(
  node: globalThis.Node,
): node is globalThis.HTMLTextAreaElement {
  return node.nodeName.toLowerCase() === '#text' && !isIconfont(node);
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
  ];

  for (const tagName of includeList) {
    const element = node.querySelectorAll(tagName);
    if (element.length > 0) {
      return true;
    }
  }

  return false;
}
