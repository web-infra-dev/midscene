import type { ElementInfo } from './';
import { NodeType } from './constants';
import { generateId, midsceneGenerateHash } from './util';

// https://github.com/appium/appium/tree/master/packages/universal-xml-plugin
// Definition of NodeDescriptor interface
interface NodeDescriptor {
  node: globalThis.Node;
  children: NodeDescriptor[];
}

// Retrieve attributes from a node
function getNodeAttributes(node: globalThis.Node): { [key: string]: string } {
  const attrs: { [key: string]: string } = {};

  // Check if node exists and its type is ELEMENT_NODE
  if (node && node.nodeType === 1) {
    const element = node as globalThis.Element;

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

  const buildAttributePart = (elem: Element): string => {
    const attributes = ['id', 'resource-id', 'content-desc', 'class'];
    for (const attr of attributes) {
      if (elem.hasAttribute(attr)) {
        const value = elem.getAttribute(attr);
        if (value && value.trim() !== '') {
          return `[@${attr}="${value}"]`;
        }
      }
    }
    return '';
  };

  const getPath = (node: Node, path = ''): string => {
    if (node.parentNode) {
      path = getPath(node.parentNode, path);
    }

    if (node.nodeType === 1) {
      const elem = node as Element;
      const tagName = elem.nodeName.toLowerCase();
      let part = `/${tagName}`;

      const attributePart = buildAttributePart(elem);

      // 如果找到有意义的属性，则添加属性部分
      if (attributePart) {
        part += attributePart;
      } else {
        // 如果没有有意义的属性，则添加索引
        const index = getIndex(node, node.nodeName);
        if (index > 1) {
          part += `[${index}]`;
        }
      }

      path += part;
    }

    return path;
  };

  return getPath(element);
}

// Perform DFS traversal and collect element information
export function extractTextWithPosition(
  initNode: globalThis.Document,
): ElementInfo[] {
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
    const nodeHashId = midsceneGenerateHash(null, attributes.placeholder, rect);
    const text = validTextNodeContent(node);

    let nodeType;

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
      case 'SEARCHINPUT':
      case 'TEXTINPUT':
      case 'INPUT':
        nodeType = NodeType.FORM_ITEM;
        break;
      case 'NAV':
      case 'LIST':
      case 'CELL':
        nodeType = NodeType.CONTAINER;
        break;
      default:
        if (
          attributes.id === 'android:id/input' ||
          attributes.id === 'android:id/inputArea'
        ) {
          nodeType = NodeType.FORM_ITEM;
        } else {
          nodeType = NodeType.CONTAINER;
        }
        break;
    }

    const xpath = getXPathForElement(node);
    const elementInfo: ElementInfo = {
      id: nodeHashId,
      indexId: nodeIndex++,
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
    };

    if (elementInfo.nodeType !== NodeType.CONTAINER) {
      elementInfoArray.push(elementInfo);
    }
  }

  const rootNode = initNode;
  const rootDescriptor: NodeDescriptor = { node: rootNode, children: [] };
  dfs(rootNode, rootDescriptor);

  return elementInfoArray;
}
