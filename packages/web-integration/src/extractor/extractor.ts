import {
  generateHash,
  getNodeAttributes,
  getPseudoElementContent,
  logger,
  setDataForNode,
  validTextNodeContent,
  visibleRect,
} from './util';
import { NodeType, TEXT_SIZE_THRESHOLD } from './constants';
import { isButtonElement, isImgElement, isInputElement } from './dom-util';

interface NodeDescriptor {
  node: Node;
  children: NodeDescriptor[];
}

export interface ElementInfo {
  id: string;
  indexId: string;
  nodeHashId: string;
  locator: string | void;
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
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

export function extractTextWithPositionDFS(initNode: Node = container): ElementInfo[] {
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

    collectElementInfo(node);

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < node.childNodes.length; i++) {
      logger('will dfs', node.childNodes[i]);
      dfs(node.childNodes[i], currentNodeDes);
    }
  }

  function collectElementInfo(node: Node) {
    const rect = visibleRect(node);
    if (!rect) {
      logger('Element is not visible', node);
      return;
    }

    if (isInputElement(node)) {
      const attributes = getNodeAttributes(node);
      const nodeHashId = generateHash(attributes.placeholder, rect, attributes);
      const selector = setDataForNode(node, nodeHashId);
      elementInfoArray.push({
        id: nodeHashId,
        indexId: generateId(nodeIndex++),
        nodeHashId,
        locator: selector,
        attributes: {
          ...attributes,
          nodeType: NodeType.INPUT,
        },
        content: attributes.placeholder || '',
        rect,
        center: [Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2)],
      });
      return;
    }

    if (isButtonElement(node)) {
      const attributes = getNodeAttributes(node);
      const pseudo = getPseudoElementContent(node);
      const content = node.innerText || pseudo.before || pseudo.after || '';
      const nodeHashId = generateHash(content, rect, attributes);
      const selector = setDataForNode(node, nodeHashId);
      elementInfoArray.push({
        id: nodeHashId,
        indexId: generateId(nodeIndex++),
        nodeHashId,
        locator: selector,
        attributes: {
          ...attributes,
          nodeType: NodeType.BUTTON,
        },
        content,
        rect,
        center: [Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2)],
      });
      return;
    }

    if (isImgElement(node)) {
      const attributes = getNodeAttributes(node);
      const nodeHashId = generateHash('', rect, attributes);
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
        content: '',
        rect,
        center: [Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2)],
      });
      return;
    }

    //   if (node instanceof HTMLElement && hasOverflowY(node)) {
    //       const rect = visibleRect(node);
    //       if (!rect || rect.height < 100) {
    //           logger('Element is not visible', node);
    //       } else {
    //           const attributes = getNodeAttributes(node);
    //           const selector = setDataForNode(node, nodeIndex);
    //           elementInfoArray.push({
    //               id: nodeIndex++,
    //               nodeType: 'ScrollContainer Node',
    //               locator: selector!,
    //               parentIndex,
    //               attributes,
    //               content: "",
    //               rect,
    //               center: [Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2)],
    //           });
    //       }
    //   }

    const text = validTextNodeContent(node);
    if (text) {
      if (rect.width < TEXT_SIZE_THRESHOLD || rect.height < TEXT_SIZE_THRESHOLD) {
        logger('Element is too small', text);
        return;
      }
      const attributes = getNodeAttributes(node);
      const nodeHashId = generateHash(text, rect, attributes);
      const selector = setDataForNode(node, nodeHashId);
      elementInfoArray.push({
        id: nodeHashId,
        indexId: generateId(nodeIndex++),
        nodeHashId,
        attributes: {
          ...attributes,
          nodeType: NodeType.TEXT,
        },
        locator: selector,
        center: [Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2)],
        // attributes,
        content: text,
        rect,
      });
    }
  }

  dfs(initNode, nodeMapTree);
  return elementInfoArray;
}
