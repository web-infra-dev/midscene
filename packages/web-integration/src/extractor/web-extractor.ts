import {
  CONTAINER_MINI_HEIGHT,
  CONTAINER_MINI_WIDTH,
  NodeType,
} from '@midscene/shared/constants';
import type { ElementInfo } from '.';
import {
  isButtonElement,
  isFormElement,
  isImgElement,
  isTextElement,
} from './dom-util';
import {
  getDebugMode,
  getDocument,
  getNodeAttributes,
  getPseudoElementContent,
  logger,
  midsceneGenerateHash,
  setDataForNode,
  setDebugMode,
  visibleRect,
} from './util';

function collectElementInfo(node: Node, nodePath: string): ElementInfo | null {
  const rect = visibleRect(node);
  logger('collectElementInfo', node, node.nodeName, rect);
  if (
    !rect ||
    rect.width < CONTAINER_MINI_WIDTH ||
    rect.height < CONTAINER_MINI_HEIGHT
  ) {
    logger('Element is not visible', node);
    return null;
  }

  const debugMode = getDebugMode();
  if (isFormElement(node)) {
    const attributes = getNodeAttributes(node);
    const nodeHashId = midsceneGenerateHash(attributes.placeholder, rect);
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
    const elementInfo: ElementInfo = {
      id: nodeHashId,
      nodePath,
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
    };
    return elementInfo;
  }

  if (isButtonElement(node)) {
    const attributes = getNodeAttributes(node);
    const pseudo = getPseudoElementContent(node);
    const content = node.innerText || pseudo.before || pseudo.after || '';
    const nodeHashId = midsceneGenerateHash(content, rect);
    const selector = setDataForNode(node, nodeHashId);
    const elementInfo: ElementInfo = {
      id: nodeHashId,
      nodePath,
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
    };
    return elementInfo;
  }

  if (isImgElement(node)) {
    const attributes = getNodeAttributes(node);
    const nodeHashId = midsceneGenerateHash('', rect);
    const selector = setDataForNode(node, nodeHashId);
    const elementInfo: ElementInfo = {
      id: nodeHashId,
      nodePath,
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
    };
    return elementInfo;
  }

  if (isTextElement(node)) {
    const text = node.textContent?.trim().replace(/\n+/g, ' ');
    if (!text) {
      return null;
    }
    const attributes = getNodeAttributes(node);
    const attributeKeys = Object.keys(attributes);
    if (!text.trim() && attributeKeys.length === 0) {
      return null;
    }
    const nodeHashId = midsceneGenerateHash(text, rect);
    const selector = setDataForNode(node, nodeHashId);
    const elementInfo: ElementInfo = {
      id: nodeHashId,
      nodePath,
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
    };
    return elementInfo;
  }

  // else, consider as a container
  const attributes = getNodeAttributes(node);
  const nodeHashId = midsceneGenerateHash('', rect);
  const selector = setDataForNode(node, nodeHashId);
  const elementInfo: ElementInfo = {
    id: nodeHashId,
    nodePath,
    nodeHashId,
    nodeType: NodeType.CONTAINER,
    locator: selector,
    attributes: {
      ...attributes,
      nodeType: NodeType.CONTAINER,
    },
    content: '',
    rect,
    center: [
      Math.round(rect.left + rect.width / 2),
      Math.round(rect.top + rect.height / 2),
    ],
    htmlNode: debugMode ? node : null,
  };
  return elementInfo;
}

export function extractTextWithPosition(
  initNode: Node,
  debugMode = false,
): ElementInfo[] {
  setDebugMode(debugMode);
  const elementInfoArray: ElementInfo[] = [];
  function dfs(node: Node, nodePath: string): ElementInfo | null {
    if (!node) {
      return null;
    }

    const elementInfo = collectElementInfo(node, nodePath);
    // stop collecting if the node is a Button
    if (elementInfo?.nodeType === NodeType.BUTTON) {
      return elementInfo;
    }

    /*
      If all of the children of a node are containers, then we call it a **pure container**.
      Otherwise, it is not a pure container.

      If a node is a pure container, and some of its siblings are not pure containers, then we should put this pure container into the elementInfoArray.
    */
    let hasNonContainerChildren = false;
    const childrenPureContainers: ElementInfo[] = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      logger('will dfs', node.childNodes[i]);
      const resultLengthBeforeDfs = elementInfoArray.length;
      const result = dfs(node.childNodes[i], `${nodePath}-${i}`);

      if (!result) continue;

      if (
        result?.nodeType === NodeType.CONTAINER &&
        elementInfoArray.length > resultLengthBeforeDfs
      ) {
        hasNonContainerChildren = true;
        continue;
      }

      if (result?.nodeType === NodeType.CONTAINER) {
        childrenPureContainers.push(result);
      } else {
        hasNonContainerChildren = true;
        elementInfoArray.push(result);
      }
    }

    if (hasNonContainerChildren) {
      elementInfoArray.push(...childrenPureContainers);
    }

    if (!elementInfo) {
      logger('should NOT continue for node', node);
      return null;
    }
    return elementInfo;
  }

  const outerMostElementInfo = dfs(initNode || getDocument(), '0');
  if (outerMostElementInfo && !elementInfoArray.length) {
    elementInfoArray.push(outerMostElementInfo);
  }

  // update all the ids
  for (let i = 0; i < elementInfoArray.length; i++) {
    elementInfoArray[i].indexId = (i + 1).toString();
  }
  return elementInfoArray;
}
