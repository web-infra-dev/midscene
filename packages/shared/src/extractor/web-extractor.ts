import {
  CONTAINER_MINI_HEIGHT,
  CONTAINER_MINI_WIDTH,
  NodeType,
} from '../constants/index';
import type { WebElementInfo } from '../types';
import type { Point } from '../types';
import {
  isAElement,
  isButtonElement,
  isContainerElement,
  isFormElement,
  isImgElement,
  isTextElement,
} from './dom-util';
import { descriptionOfTree } from './tree';
import {
  elementRect,
  getNodeAttributes,
  getPseudoElementContent,
  getRect,
  getTopDocument,
  logger,
  midsceneGenerateHash,
  setDebugMode,
} from './util';

let indexId = 0;

function tagNameOfNode(node: globalThis.Node): string {
  let tagName = '';
  if (node instanceof HTMLElement) {
    tagName = node.tagName?.toLowerCase();
  } else {
    const parentElement = node.parentElement;
    if (parentElement && parentElement instanceof HTMLElement) {
      tagName = parentElement.tagName?.toLowerCase();
    }
  }

  return tagName ? `<${tagName}>` : '';
}

export function collectElementInfo(
  node: Node,
  currentWindow: typeof window,
  currentDocument: typeof document,
  baseZoom = 1,
  basePoint: Point = { left: 0, top: 0 },
  isContainer = false, // if true, the element will be considered as a container
): WebElementInfo | null | any {
  const rect = elementRect(node, currentWindow, currentDocument, baseZoom);

  if (!rect) {
    return null;
  }

  if (
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
    const tagName = (node as HTMLElement).tagName.toLowerCase();
    if ((node as HTMLElement).tagName.toLowerCase() === 'select') {
      // Get the selected option using the selectedIndex property
      const selectedOption = (node as HTMLSelectElement).options[
        (node as HTMLSelectElement).selectedIndex
      ];

      // Retrieve the text content of the selected option
      valueContent = selectedOption?.textContent || '';
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
      isVisible: rect.isVisible,
    };
    return elementInfo;
  }

  if (isButtonElement(node)) {
    const rect = mergeElementAndChildrenRects(
      node,
      currentWindow,
      currentDocument,
      baseZoom,
    );
    if (!rect) {
      return null;
    }
    const attributes = getNodeAttributes(node, currentWindow);
    const pseudo = getPseudoElementContent(node, currentWindow);
    const content = node.innerText || pseudo.before || pseudo.after || '';
    const nodeHashId = midsceneGenerateHash(node, content, rect);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
      nodeHashId,
      nodeType: NodeType.BUTTON,
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
      isVisible: rect.isVisible,
    };
    return elementInfo;
  }

  if (isImgElement(node)) {
    const attributes = getNodeAttributes(node, currentWindow);
    const nodeHashId = midsceneGenerateHash(node, '', rect);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
      nodeHashId,
      attributes: {
        ...attributes,
        ...(node.nodeName?.toLowerCase() === 'svg'
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
      isVisible: rect.isVisible,
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
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
      nodeHashId,
      nodeType: NodeType.TEXT,
      attributes: {
        ...attributes,
        nodeType: NodeType.TEXT,
        htmlTagName: tagNameOfNode(node),
      },
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      content: text,
      rect,
      zoom: rect.zoom,
      isVisible: rect.isVisible,
    };
    return elementInfo;
  }

  if (isAElement(node)) {
    const attributes = getNodeAttributes(node, currentWindow);
    const pseudo = getPseudoElementContent(node, currentWindow);
    const content = node.innerText || pseudo.before || pseudo.after || '';
    const nodeHashId = midsceneGenerateHash(node, content, rect);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      indexId: indexId++,
      nodeHashId,
      nodeType: NodeType.A,
      attributes: {
        ...attributes,
        htmlTagName: tagNameOfNode(node),
        nodeType: NodeType.A,
      },
      content,
      rect,
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      zoom: rect.zoom,
      isVisible: rect.isVisible,
    };
    return elementInfo;
  }

  // else, consider as a container
  if (isContainerElement(node) || isContainer) {
    const attributes = getNodeAttributes(node, currentWindow);
    const nodeHashId = midsceneGenerateHash(node, '', rect);
    const elementInfo: WebElementInfo = {
      id: nodeHashId,
      nodeHashId,
      indexId: indexId++,
      nodeType: NodeType.CONTAINER,
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
      isVisible: rect.isVisible,
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
  visibleOnly = false,
  debugMode = false,
): string {
  const elementNode = extractTreeNode(initNode, debugMode);
  return descriptionOfTree(elementNode, undefined, false, visibleOnly);
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
  ): WebElementNode | WebElementNode[] | null {
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
    // stop collecting if the node is a Button/Image/Text/FormItem/Container
    if (
      elementInfo?.nodeType === NodeType.BUTTON ||
      elementInfo?.nodeType === NodeType.IMG ||
      elementInfo?.nodeType === NodeType.TEXT ||
      elementInfo?.nodeType === NodeType.FORM_ITEM ||
      elementInfo?.nodeType === NodeType.CONTAINER // TODO: need return the container node?
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
      if (Array.isArray(childNodeInfo)) {
        // if the recursive return is an array, expand and merge it into children
        nodeInfo.children.push(...childNodeInfo);
      } else if (childNodeInfo) {
        nodeInfo.children.push(childNodeInfo);
      }
    }

    // if nodeInfo.node is null
    if (nodeInfo.node === null) {
      if (nodeInfo.children.length === 0) {
        return null;
      }
      // promote children to the upper layer
      return nodeInfo.children;
    }

    return nodeInfo;
  }

  const rootNodeInfo = dfs(startNode, window, document, 1, {
    left: 0,
    top: 0,
  });
  if (Array.isArray(rootNodeInfo)) {
    topChildren.push(...rootNodeInfo);
  } else if (rootNodeInfo) {
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
          if (Array.isArray(iframeChildren)) {
            topChildren.push(...iframeChildren);
          } else if (iframeChildren) {
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

export function mergeElementAndChildrenRects(
  node: Node,
  currentWindow: typeof window,
  currentDocument: typeof document,
  baseZoom = 1,
) {
  const selfRect = elementRect(node, currentWindow, currentDocument, baseZoom);
  if (!selfRect) return null;

  let minLeft = selfRect.left;
  let minTop = selfRect.top;
  let maxRight = selfRect.left + selfRect.width;
  let maxBottom = selfRect.top + selfRect.height;

  function traverse(child: Node) {
    for (let i = 0; i < child.childNodes.length; i++) {
      const sub = child.childNodes[i];
      if (sub.nodeType === 1) {
        const rect = elementRect(sub, currentWindow, currentDocument, baseZoom);
        if (rect) {
          minLeft = Math.min(minLeft, rect.left);
          minTop = Math.min(minTop, rect.top);
          maxRight = Math.max(maxRight, rect.left + rect.width);
          maxBottom = Math.max(maxBottom, rect.top + rect.height);
        }
        traverse(sub);
      }
    }
  }
  traverse(node);

  return {
    ...selfRect,
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}
