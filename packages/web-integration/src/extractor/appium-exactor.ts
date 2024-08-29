import { DOMParser } from '@xmldom/xmldom';
import { NodeType } from './constants';
import type { ElementInfo } from './extractor';
import { generateId, midsceneGenerateHash } from './util';

// https://github.com/appium/appium/tree/master/packages/universal-xml-plugin
// Definition of NodeDescriptor interface
interface NodeDescriptor {
  node: Node;
  children: NodeDescriptor[];
}

// Retrieve attributes from a node
function getNodeAttributes(node: Node): { [key: string]: string } {
  const attrs: { [key: string]: string } = {};

  // Check if node exists and its type is ELEMENT_NODE
  if (node && node.nodeType === 1) {
    const element = node as Element;

    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attrs[attr.nodeName] = attr.nodeValue ?? '';
    }
  }

  return attrs;
}

// Retrieve rectangle information
function getRect(attributes: { [key: string]: string }): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const x = Math.round(Number.parseFloat(attributes.x ?? '0'));
  const y = Math.round(Number.parseFloat(attributes.y ?? '0'));
  const width = Math.round(Number.parseFloat(attributes.width ?? '0'));
  const height = Math.round(Number.parseFloat(attributes.height ?? '0'));

  return {
    left: Math.max(0, Math.floor(x)),
    top: Math.max(0, Math.floor(y)),
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

// Validate if the node can provide text content
function validTextNodeContent(node: Node): string {
  if (node.nodeType === 3) {
    return node.nodeValue?.trim() || '';
  }
  return '';
}

// New parsePageSource function to extract from Appium's pageSource
export function parsePageSource(pageSource: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(pageSource, 'text/xml');
  return extractTextWithPosition(doc);
}

// Perform DFS traversal and collect element information
export function extractTextWithPosition(initNode: Document): ElementInfo[] {
  const elementInfoArray: ElementInfo[] = [];
  let nodeIndex = 1;

  function dfs(node: Node, parentNode: NodeDescriptor | null = null): void {
    if (!node) {
      return;
    }

    const currentNodeDes: NodeDescriptor = { node, children: [] };
    if (parentNode) {
      parentNode.children.push(currentNodeDes);
    }

    collectElementInfo(node);

    if (node.childNodes && node.childNodes.length > 0) {
      for (let i = 0; i < node.childNodes.length; i++) {
        dfs(node.childNodes[i], currentNodeDes);
      }
    }
  }

  function collectElementInfo(node: Node) {
    const attributes = getNodeAttributes(node);
    const rect = getRect(attributes);
    const nodeHashId = midsceneGenerateHash(attributes.placeholder, rect);
    const text = validTextNodeContent(node);

    let nodeType = NodeType.FORM_ITEM;

    switch (node.nodeName.toUpperCase()) {
      case 'TEXT':
        nodeType = NodeType.TEXT;
        break;
      case 'IMAGE':
        nodeType = NodeType.IMG;
        break;
      case 'BUTTON':
        nodeType = NodeType.BUTTON;
        break;
    }

    const xpath = getXPathForElement(node);

    const elementInfo: ElementInfo = {
      id: nodeHashId,
      indexId: generateId(nodeIndex++),
      nodeHashId,
      locator: xpath,
      attributes: {
        nodeType,
        ...attributes,
      },
      content: text,
      rect,
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      nodeType,
      htmlNode: null,
    };

    elementInfoArray.push(elementInfo);
  }

  const rootNode = initNode;
  const rootDescriptor: NodeDescriptor = { node: rootNode, children: [] };
  dfs(rootNode, rootDescriptor);

  return elementInfoArray;
}

function getXPathForElement(element: Node): string {
  if (element.nodeType !== 1) {
    return '';
  }

  const getIndex = (sib: Node, name: string) => {
    let count = 1;
    for (let cur = sib.previousSibling; cur; cur = cur.previousSibling) {
      if (cur.nodeType === 1 && cur.nodeName === name) {
        count++;
      }
    }
    return count;
  };

  const getPath = (node: Node, path = ''): string => {
    if (node.parentNode) {
      path = getPath(node.parentNode, path);
    }

    if (node.nodeType === 1) {
      const index = getIndex(node, node.nodeName);
      const tagName = node.nodeName.toLowerCase();
      path += `/${tagName}[${index}]`;
    }

    return path;
  };

  return getPath(element);
}
