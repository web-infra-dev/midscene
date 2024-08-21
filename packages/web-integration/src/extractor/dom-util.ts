export function isInputElement(node: Node): node is HTMLInputElement {
  return (
    node instanceof HTMLElement &&
    (node.tagName.toLowerCase() === 'input' ||
      node.tagName.toLowerCase() === 'textarea')
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
