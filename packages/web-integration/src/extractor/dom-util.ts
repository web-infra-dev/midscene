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
  return (
    (node instanceof HTMLElement && node.tagName.toLowerCase() === 'img') ||
    (node instanceof SVGElement && node.tagName.toLowerCase() === 'svg')
  );
}

export function isTextElement(node: Node): node is HTMLTextAreaElement {
  return node.nodeName.toLowerCase() === '#text';
}
