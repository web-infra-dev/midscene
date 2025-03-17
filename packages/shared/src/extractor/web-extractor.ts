import type { ElementInfo } from '.';
import {
  CONTAINER_MINI_HEIGHT,
  CONTAINER_MINI_WIDTH,
  NodeType,
} from '../constants/index';
import type { Point } from '../types';
import {
  isButtonElement,
  isContainerElement,
  isFormElement,
  isImgElement,
  isTextElement,
} from './dom-util';
import { descriptionOfTree } from './tree';
import {
  getNodeAttributes,
  getPseudoElementContent,
  getRect,
  getTopDocument,
  logger,
  midsceneGenerateHash,
  setDataForNode,
  setDebugMode,
  visibleRect,
} from './util';

interface WebElementInfo extends ElementInfo {
  zoom: number;
  screenWidth?: number;
  screenHeight?: number;
}

let indexId = 0;

function tagNameOfNode(node: globalThis.Node): string {
  let tagName = '';
  if (node instanceof HTMLElement) {
    tagName = node.tagName.toLowerCase();
  }

  const parentElement = node.parentElement;
  if (parentElement && parentElement instanceof HTMLElement) {
    tagName = parentElement.tagName.toLowerCase();
  }

  return tagName ? `<${tagName}>` : '';
}

function collectElementInfo(
  node: Node,
  currentWindow: typeof window,
  currentDocument: typeof document,
  baseZoom = 1,
  basePoint: Point = { left: 0, top: 0 },
): WebElementInfo | null {
  const rect = visibleRect(node, currentWindow, currentDocument, baseZoom);
  if (
    !rect ||
    rect.width < CONTAINER_MINI_WIDTH ||
    rect.height < CONTAINER_MINI_HEIGHT
  ) {
    return null;
  }
  if (basePoint.left !== 0 || basePoint.top !== 0) {
    rect.left += basePoint.left;
    rect.top += basePoint.top;
  }
  // Skip elements that cover the entire viewport, as they are likely background containers
  // rather than meaningful interactive elements
  if (rect.height >= window.innerHeight && rect.width >= window.innerWidth) {
    return null;
  }

  if (isFormElement(node)) {
    const attributes = getNodeAttributes(node, currentWindow);
    let valueContent =
      attributes.value || attributes.placeholder || node.textContent || '';
    const nodeHashId = midsceneGenerateHash(node, valueContent, rect);
    const selector = setDataForNode(node, nodeHashId, false, currentWindow);
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
      screenWidth: currentWindow.innerWidth,
      screenHeight: currentWindow.innerHeight,
    };
    return elementInfo;
  }

  if (isButtonElement(node)) {
    const attributes = getNodeAttributes(node, currentWindow);
    const pseudo = getPseudoElementContent(node, currentWindow);
    const content = node.innerText || pseudo.before || pseudo.after || '';
    const nodeHashId = midsceneGenerateHash(node, content, rect);
    const selector = setDataForNode(node, nodeHashId, false, currentWindow);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
      nodeHashId,
      nodeType: NodeType.BUTTON,
      locator: selector,
      attributes: {
        ...attributes,
        htmlTagName: tagNameOfNode(node),
        nodeType: NodeType.BUTTON,
      },
      content,
      rect,
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      zoom: rect.zoom,
      screenWidth: currentWindow.innerWidth,
      screenHeight: currentWindow.innerHeight,
    };
    return elementInfo;
  }

  if (isImgElement(node)) {
    const attributes = getNodeAttributes(node, currentWindow);
    const nodeHashId = midsceneGenerateHash(node, '', rect);
    const selector = setDataForNode(node, nodeHashId, false, currentWindow);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
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
        htmlTagName: tagNameOfNode(node),
      },
      nodeType: NodeType.IMG,
      content: '',
      rect,
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      zoom: rect.zoom,
      screenWidth: currentWindow.innerWidth,
      screenHeight: currentWindow.innerHeight,
    };
    return elementInfo;
  }

  if (isTextElement(node)) {
    const text = node.textContent?.trim().replace(/\n+/g, ' ');
    if (!text) {
      return null;
    }
    const attributes = getNodeAttributes(node, currentWindow);
    const attributeKeys = Object.keys(attributes);
    if (!text.trim() && attributeKeys.length === 0) {
      return null;
    }
    const nodeHashId = midsceneGenerateHash(node, text, rect);
    const selector = setDataForNode(node, nodeHashId, true, currentWindow);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
      nodeHashId,
      nodeType: NodeType.TEXT,
      locator: selector,
      attributes: {
        ...attributes,
        nodeType: NodeType.TEXT,
        htmlTagName: tagNameOfNode(node),
      },
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      // attributes,
      content: text,
      rect,
      zoom: rect.zoom,
      screenWidth: currentWindow.innerWidth,
      screenHeight: currentWindow.innerHeight,
    };
    return elementInfo;
  }

  // else, consider as a container
  if (isContainerElement(node)) {
    const attributes = getNodeAttributes(node, currentWindow);
    const nodeHashId = midsceneGenerateHash(node, '', rect);
    const selector = setDataForNode(node, nodeHashId, false, currentWindow);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      nodeHashId,
      indexId: indexId++,
      nodeType: NodeType.CONTAINER,
      locator: selector,
      attributes: {
        ...attributes,
        nodeType: NodeType.CONTAINER,
        htmlTagName: tagNameOfNode(node),
      },
      content: '',
      rect,
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      zoom: rect.zoom,
      screenWidth: currentWindow.innerWidth,
      screenHeight: currentWindow.innerHeight,
    };
    return elementInfo;
  }
  return null;
}

interface WebElementNode {
  node: WebElementInfo | null;
  children: WebElementNode[];
}

// @deprecated
export function extractTextWithPosition(
  initNode: globalThis.Node,
  debugMode = false,
): WebElementInfo[] {
  const elementNode = extractTreeNode(initNode, debugMode);

  // dfs topChildren
  const elementInfoArray: WebElementInfo[] = [];
  function dfsTopChildren(node: WebElementNode) {
    if (node.node) {
      elementInfoArray.push(node.node);
    }
    for (let i = 0; i < node.children.length; i++) {
      dfsTopChildren(node.children[i]);
    }
  }
  dfsTopChildren({ children: elementNode.children, node: elementNode.node });
  return elementInfoArray;
}

export function extractTreeNodeAsString(
  initNode: globalThis.Node,
  debugMode = false,
): string {
  const elementNode = extractTreeNode(initNode, debugMode);
  return descriptionOfTree(elementNode);
}

export function extractTreeNode(
  initNode: globalThis.Node,
  debugMode = false,
): WebElementNode {
  setDebugMode(debugMode);
  indexId = 0;

  const topDocument = getTopDocument();
  const startNode = initNode || topDocument;
  const topChildren: WebElementNode[] = [];

  function dfs(
    node: globalThis.Node,
    currentWindow: typeof globalThis.window,
    currentDocument: typeof globalThis.document,
    baseZoom = 1,
    basePoint: Point = { left: 0, top: 0 },
  ): WebElementNode | null {
    if (!node) {
      return null;
    }

    if (node.nodeType && node.nodeType === 10) {
      // Doctype node
      return null;
    }

    const elementInfo = collectElementInfo(
      node,
      currentWindow,
      currentDocument,
      baseZoom,
      basePoint,
    );

    if (node instanceof currentWindow.HTMLIFrameElement) {
      if (
        (node as HTMLIFrameElement).contentWindow &&
        (node as HTMLIFrameElement).contentWindow
      ) {
        return null;
      }
    }

    const nodeInfo: WebElementNode = {
      node: elementInfo,
      children: [],
    };
    // stop collecting if the node is a Button or Image
    if (
      elementInfo?.nodeType === NodeType.BUTTON ||
      elementInfo?.nodeType === NodeType.IMG ||
      elementInfo?.nodeType === NodeType.TEXT ||
      elementInfo?.nodeType === NodeType.FORM_ITEM ||
      elementInfo?.nodeType === NodeType.CONTAINER
    ) {
      return nodeInfo;
    }

    const rect = getRect(node, baseZoom, currentWindow);
    for (let i = 0; i < node.childNodes.length; i++) {
      logger('will dfs', node.childNodes[i]);
      const childNodeInfo = dfs(
        node.childNodes[i],
        currentWindow,
        currentDocument,
        rect.zoom,
        basePoint,
      );
      if (childNodeInfo) {
        nodeInfo.children.push(childNodeInfo);
      }
    }

    return nodeInfo;
  }

  const rootNodeInfo = dfs(startNode, window, document, 1, {
    left: 0,
    top: 0,
  });
  if (rootNodeInfo) {
    topChildren.push(rootNodeInfo);
  }
  if (startNode === topDocument) {
    // find all the same-origin iframes
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      if (iframe.contentDocument && iframe.contentWindow) {
        const iframeInfo = collectElementInfo(iframe, window, document, 1);
        // when the iframe is in the viewport, we need to collect its children
        if (iframeInfo) {
          const iframeChildren = dfs(
            iframe.contentDocument.body,
            iframe.contentWindow as any,
            iframe.contentDocument,
            1,
            {
              left: iframeInfo.rect.left,
              top: iframeInfo.rect.top,
            },
          );
          if (iframeChildren) {
            topChildren.push(iframeChildren);
          }
        }
      }
    }
  }

  return {
    node: null,
    children: topChildren,
  };
}
