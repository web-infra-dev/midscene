import { NodeType, TEXT_SIZE_THRESHOLD } from './constants';
import {
  isButtonElement,
  isFormElement,
  isImgElement,
  isTextElement,
} from './dom-util';
import {
  generateHash,
  getNodeAttributes,
  getPseudoElementContent,
  logger,
  setDataForNode,
  setDebugMode,
  visibleRect,
} from './util';

interface NodeDescriptor {
  node: Node;
  children: NodeDescriptor[];
}

export interface ElementInfo {
  id: string;
  indexId: string;
  nodeHashId: string;
  locator: string;
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
  nodeType: NodeType;
  htmlNode: Node | null;
  content: string;
  rect: { left: number; top: number; width: number; height: number };
  center: [number, number];
}

const container: HTMLElement = document.body;

function generateId(numberId: number) {
  //   const letters = 'ABCDEFGHIJKLMNPRSTUVXYZ';
  //   const numbers = '0123456789';
  //   const randomLetter = letters.charAt(Math.floor(Math.random() * letters.length)).toUpperCase();
  // const randomNumber = numbers.charAt(Math.floor(Math.random() * numbers.length));
  // return randomLetter + numberId;
  return `${numberId}`;
}

export function extractTextWithPosition(
  initNode: Node = container,
  debugMode = false,
): ElementInfo[] {
  setDebugMode(debugMode);
  const elementInfoArray: ElementInfo[] = [];
  const nodeMapTree: NodeDescriptor = { node: initNode, children: [] };
  let nodeIndex = 1;

  function dfs(node: Node, parentNode: NodeDescriptor | null = null): void {
    if (!node) {
      return;
    }

    const currentNodeDes: NodeDescriptor = { node, children: [] };
    if (parentNode?.children) {
      parentNode.children.push(currentNodeDes);
    }

    const shouldContinue = collectElementInfo(node);
    if (!shouldContinue) {
      logger('should NOT continue for node', node);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < node.childNodes.length; i++) {
      logger('will dfs', node.childNodes[i]);
      dfs(node.childNodes[i], currentNodeDes);
    }
  }

  function collectElementInfo(node: Node) {
    const rect = visibleRect(node);
    logger('collectElementInfo', node, node.nodeName, rect);
    if (!rect) {
      logger('Element is not visible', node);
      return true;
    }

    if (isFormElement(node)) {
      const attributes = getNodeAttributes(node);
      const nodeHashId = generateHash(attributes.placeholder, rect);
      const selector = setDataForNode(node, nodeHashId);
      let valueContent =
        attributes.value || attributes.placeholder || node.textContent || '';
      const tagName = (node as HTMLElement).tagName.toLowerCase();
      if ((node as HTMLElement).tagName.toLowerCase() === 'select') {
        // Get the selected option using the selectedIndex property
        const selectedOption = (node as HTMLSelectElement).options[
          (node as HTMLSelectElement).selectedIndex
        ];

        // Retrieve the text content of the selected option
        valueContent = selectedOption.textContent || '';
      }
      elementInfoArray.push({
        id: nodeHashId,
        indexId: generateId(nodeIndex++),
        nodeHashId,
        locator: selector,
        nodeType: NodeType.FORM_ITEM,
        attributes: {
          ...attributes,
          htmlTagName: `<${tagName}>`,
          nodeType: NodeType.FORM_ITEM,
        },
        content: valueContent.trim(),
        rect,
        center: [
          Math.round(rect.left + rect.width / 2),
          Math.round(rect.top + rect.height / 2),
        ],
        htmlNode: debugMode ? node : null,
      });
      if (tagName === 'label') return true;
      return;
    }

    if (isButtonElement(node)) {
      const attributes = getNodeAttributes(node);
      const pseudo = getPseudoElementContent(node);
      const content = node.innerText || pseudo.before || pseudo.after || '';
      const nodeHashId = generateHash(content, rect);
      const selector = setDataForNode(node, nodeHashId);
      elementInfoArray.push({
        id: nodeHashId,
        indexId: generateId(nodeIndex++),
        nodeHashId,
        nodeType: NodeType.BUTTON,
        locator: selector,
        attributes: {
          ...attributes,
          nodeType: NodeType.BUTTON,
        },
        content,
        rect,
        center: [
          Math.round(rect.left + rect.width / 2),
          Math.round(rect.top + rect.height / 2),
        ],
        htmlNode: debugMode ? node : null,
      });
      return;
    }

    if (isImgElement(node)) {
      const attributes = getNodeAttributes(node);
      const nodeHashId = generateHash('', rect);
      const selector = setDataForNode(node, nodeHashId);
      elementInfoArray.push({
        id: nodeHashId,
        indexId: generateId(nodeIndex++),
        nodeHashId,
        locator: selector,
        attributes: {
          ...attributes,
          nodeType: NodeType.IMG,
        },
        nodeType: NodeType.IMG,
        content: '',
        rect,
        center: [
          Math.round(rect.left + rect.width / 2),
          Math.round(rect.top + rect.height / 2),
        ],
        htmlNode: debugMode ? node : null,
      });
      return;
    }

    if (isTextElement(node)) {
      const text = node.textContent?.trim().replace(/\n+/g, ' ');
      if (!text) {
        return;
      }
      const attributes = getNodeAttributes(node);
      const attributeKeys = Object.keys(attributes);
      if (!text.trim() && attributeKeys.length === 0) {
        return;
      }
      const nodeHashId = generateHash(text, rect);
      const selector = setDataForNode(node, nodeHashId);
      elementInfoArray.push({
        id: nodeHashId,
        indexId: generateId(nodeIndex++),
        nodeHashId,
        nodeType: NodeType.TEXT,
        locator: selector,
        attributes: {
          ...attributes,
          nodeType: NodeType.TEXT,
        },
        center: [
          Math.round(rect.left + rect.width / 2),
          Math.round(rect.top + rect.height / 2),
        ],
        // attributes,
        content: text,
        rect,
        htmlNode: debugMode ? node : null,
      });
      return;
    }

    return true;
  }

  dfs(initNode, nodeMapTree);
  return elementInfoArray;
}
