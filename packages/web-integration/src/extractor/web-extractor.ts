import type { Point } from '@midscene/core';
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
  getNodeAttributes,
  getPseudoElementContent,
  getRect,
  getTopDocument,
  logger,
  midsceneGenerateHash,
  resetNodeHashCacheList,
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

function tagNameOfNode(node: Node): string {
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
  nodePath: string,
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
      nodePath,
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
      nodePath,
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
      nodePath,
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

export function extractTextWithPosition(
  initNode: Node,
  debugMode = false,
): WebElementInfo[] {
  setDebugMode(debugMode);
  resetNodeHashCacheList();
  indexId = 0;
  const elementInfoArray: WebElementInfo[] = [];

  function dfs(
    node: Node,
    nodePath: string,
    currentWindow: typeof window,
    currentDocument: typeof document,
    baseZoom = 1,
    basePoint: Point = { left: 0, top: 0 },
  ): WebElementInfo | null {
    if (!node) {
      return null;
    }

    if (node.nodeType && node.nodeType === 10) {
      // Doctype node
      return null;
    }

    const elementInfo = collectElementInfo(
      node,
      nodePath,
      currentWindow,
      currentDocument,
      baseZoom,
      basePoint,
    );

    if (elementInfo && node instanceof currentWindow.HTMLIFrameElement) {
      if (
        (node as HTMLIFrameElement).contentWindow &&
        (node as HTMLIFrameElement).contentWindow
      ) {
        // other scripts will handle this
        return elementInfo;
      }
    }

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

    const rect = getRect(node, baseZoom, currentWindow);
    for (let i = 0; i < node.childNodes.length; i++) {
      logger('will dfs', node.childNodes[i]);
      dfs(
        node.childNodes[i],
        `${nodePath}-${i}`,
        currentWindow,
        currentDocument,
        rect.zoom,
        basePoint,
      );
    }

    if (!elementInfo) {
      logger('should NOT continue for node', node);
      return null;
    }
    return elementInfo;
  }

  const topDocument = getTopDocument();
  const rootNode = initNode || topDocument;

  dfs(rootNode, '0', window, document, 1, { left: 0, top: 0 });
  if (rootNode === topDocument) {
    // find all the same-origin iframes
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      if (iframe.contentDocument && iframe.contentWindow) {
        const iframeInfo = collectElementInfo(
          iframe,
          `${i}`,
          window,
          document,
          1,
        );
        if (iframeInfo) {
          // it's still in the viewport
          dfs(
            iframe.contentDocument.body,
            `${i}`,
            iframe.contentWindow as any,
            iframe.contentDocument,
            1,
            {
              left: iframeInfo.rect.left,
              top: iframeInfo.rect.top,
            },
          );
        }
      }
    }
  }

  return elementInfoArray;
}
