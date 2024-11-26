import {
  CONTAINER_MINI_HEIGHT,
  CONTAINER_MINI_WIDTH,
  NodeType,
} from '@midscene/shared/constants';
import type { ElementInfo } from '.';
import {
  isButtonElement,
  isContainerElement,
  isFormElement,
  isImgElement,
  isTextElement,
} from './dom-util';
import {
  getDocument,
  getNodeAttributes,
  getPseudoElementContent,
  getRect,
  logger,
  midsceneGenerateHash,
  resetNodeHashCacheList,
  setDataForNode,
  setDebugMode,
  setFrameId,
  visibleRect,
} from './util';

interface WebElementInfo extends ElementInfo {
  zoom: number;
  screenWidth?: number;
  screenHeight?: number;
}

let indexId = 0;

function collectElementInfo(
  node: Node,
  nodePath: string,
  baseZoom = 1,
): WebElementInfo | null {
  const rect = visibleRect(node, baseZoom);
  logger('collectElementInfo', node, node.nodeName, rect);
  if (
    !rect ||
    rect.width < CONTAINER_MINI_WIDTH ||
    rect.height < CONTAINER_MINI_HEIGHT
  ) {
    logger('Element is not visible', node);
    return null;
  }

  if (isFormElement(node)) {
    const attributes = getNodeAttributes(node);
    const nodeHashId = midsceneGenerateHash(node, attributes.placeholder, rect);
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

    if (
      ((node as HTMLElement).tagName.toLowerCase() === 'input' ||
        (node as HTMLElement).tagName.toLowerCase() === 'textarea') &&
      (node as HTMLInputElement).value
    ) {
      valueContent = (node as HTMLInputElement).value;
    }

    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      nodePath,
      nodeHashId,
      locator: selector,
      nodeType: NodeType.FORM_ITEM,
      indexId: indexId++,
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
      zoom: rect.zoom,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
    };
    return elementInfo;
  }

  if (isButtonElement(node)) {
    const attributes = getNodeAttributes(node);
    const pseudo = getPseudoElementContent(node);
    const content = node.innerText || pseudo.before || pseudo.after || '';
    const nodeHashId = midsceneGenerateHash(node, content, rect);
    const selector = setDataForNode(node, nodeHashId);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
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
      zoom: rect.zoom,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
    };
    return elementInfo;
  }

  if (isImgElement(node)) {
    const attributes = getNodeAttributes(node);
    const nodeHashId = midsceneGenerateHash(node, '', rect);
    const selector = setDataForNode(node, nodeHashId);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
      nodePath,
      nodeHashId,
      locator: selector,
      attributes: {
        ...attributes,
        ...(node.nodeName.toLowerCase() === 'svg'
          ? {
              svgContent: 'true',
            }
          : {}),
        nodeType: NodeType.IMG,
      },
      nodeType: NodeType.IMG,
      content: '',
      rect,
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      zoom: rect.zoom,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
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
    const nodeHashId = midsceneGenerateHash(node, text, rect);
    const selector = setDataForNode(node, nodeHashId, true);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
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
      zoom: rect.zoom,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
    };
    return elementInfo;
  }

  // else, consider as a container
  if (isContainerElement(node)) {
    const attributes = getNodeAttributes(node);
    const nodeHashId = midsceneGenerateHash(node, '', rect);
    const selector = setDataForNode(node, nodeHashId);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      nodePath,
      nodeHashId,
      indexId: indexId++,
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
      zoom: rect.zoom,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
    };
    return elementInfo;
  }
  return null;
}

export function extractTextWithPosition(
  initNode: Node,
  debugMode = false,
  currentFrame = { id: 0, left: 0, top: 0 },
): WebElementInfo[] {
  setDebugMode(debugMode);
  setFrameId(currentFrame.id);
  resetNodeHashCacheList();
  const elementInfoArray: WebElementInfo[] = [];

  function dfs(
    node: Node,
    nodePath: string,
    baseZoom = 1,
  ): WebElementInfo | null {
    if (!node) {
      return null;
    }

    const elementInfo = collectElementInfo(node, nodePath, baseZoom);
    // stop collecting if the node is a Button or Image
    if (
      elementInfo?.nodeType === NodeType.BUTTON ||
      elementInfo?.nodeType === NodeType.IMG ||
      elementInfo?.nodeType === NodeType.TEXT ||
      elementInfo?.nodeType === NodeType.FORM_ITEM ||
      elementInfo?.nodeType === NodeType.CONTAINER
    ) {
      elementInfoArray.push(elementInfo);
      return elementInfo;
    }

    const rect = getRect(node, baseZoom);
    for (let i = 0; i < node.childNodes.length; i++) {
      logger('will dfs', node.childNodes[i]);
      dfs(node.childNodes[i], `${nodePath}-${i}`, rect.zoom);
    }

    if (!elementInfo) {
      logger('should NOT continue for node', node);
      return null;
    }
    return elementInfo;
  }

  dfs(initNode || getDocument(), '0');

  if (currentFrame.left !== 0 || currentFrame.top !== 0) {
    for (let i = 0; i < elementInfoArray.length; i++) {
      elementInfoArray[i].rect.left += currentFrame.left;
      elementInfoArray[i].rect.top += currentFrame.top;
      elementInfoArray[i].center[0] += currentFrame.left;
      elementInfoArray[i].center[1] += currentFrame.top;
      elementInfoArray[i].nodePath =
        `frame${currentFrame.id}-${elementInfoArray[i].nodePath}`;
    }
  }
  return elementInfoArray;
}
