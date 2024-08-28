export function isFormElement(node: Node) {
  return (
    node instanceof HTMLElement &&
    (node.tagName.toLowerCase() === 'input' ||
      node.tagName.toLowerCase() === 'textarea' ||
      node.tagName.toLowerCase() === 'label' ||
      node.tagName.toLowerCase() === 'select' ||
      node.tagName.toLowerCase() === 'option')
  );
}

export function isButtonElement(node: Node): node is HTMLButtonElement {
  return node instanceof HTMLElement && node.tagName.toLowerCase() === 'button';
}

export function isImgElement(node: Node): node is HTMLImageElement {
  return node instanceof HTMLElement && node.tagName.toLowerCase() === 'img';
}

export function isTextElement(node: Node): node is HTMLTextAreaElement {
  return node.nodeName.toLowerCase() === '#text';
}

export function isWidgetElement(node: Node): node is HTMLElement {
  return (
    node instanceof HTMLElement &&
    (node.hasAttribute('aria-label') ||
      node.hasAttribute('aria-controls') ||
      node.hasAttribute('aria-labelledby'))
  );
}
