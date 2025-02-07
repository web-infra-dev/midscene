import type { BaseElement, ElementTreeNode } from '../types';

export function truncateText(
  text: string | number | object | undefined,
  maxLength = 150,
) {
  if (typeof text === 'undefined') {
    return '';
  }

  if (typeof text === 'object') {
    text = JSON.stringify(text);
  }

  if (typeof text === 'number') {
    return text.toString();
  }

  if (typeof text === 'string' && text.length > maxLength) {
    return `${text.slice(0, maxLength)}...`;
  }

  if (typeof text === 'string') {
    return text.trim();
  }

  return '';
}

export function trimAttributes(
  attributes: Record<string, any>,
  truncateTextLength?: number,
) {
  const tailorAttributes = Object.keys(attributes).reduce(
    (res, currentKey: string) => {
      const attributeVal = (attributes as any)[currentKey];
      if (
        currentKey === 'style' ||
        currentKey === 'src' ||
        currentKey === 'htmlTagName' ||
        currentKey === 'nodeType'
      ) {
        return res;
      }

      res[currentKey] = truncateText(attributeVal, truncateTextLength);
      return res;
    },
    {} as BaseElement['attributes'],
  );
  return tailorAttributes;
}

const nodeSizeThreshold = 4;
export function descriptionOfTree<
  ElementType extends BaseElement = BaseElement,
>(
  tree: ElementTreeNode<ElementType>,
  truncateTextLength?: number,
  filterNonTextContent = false,
) {
  const attributesString = (kv: Record<string, any>) => {
    return Object.entries(kv)
      .map(
        ([key, value]) => `${key}="${truncateText(value, truncateTextLength)}"`,
      )
      .join(' ');
  };

  function buildContentTree(
    node: ElementTreeNode<ElementType>,
    indent = 0,
  ): string {
    let before = '';
    let contentWithIndent = '';
    let after = '';
    let emptyNode = true;
    const indentStr = '  '.repeat(indent);

    let children = '';
    for (let i = 0; i < (node.children || []).length; i++) {
      const childContent = buildContentTree(node.children[i], indent + 1);
      if (childContent) {
        children += `\n${childContent}`;
      }
    }

    if (
      node.node &&
      node.node.rect.width > nodeSizeThreshold &&
      node.node.rect.height > nodeSizeThreshold &&
      (!filterNonTextContent || (filterNonTextContent && node.node.content))
    ) {
      emptyNode = false;
      let nodeTypeString: string;
      if (node.node.attributes?.htmlTagName) {
        nodeTypeString = node.node.attributes.htmlTagName.replace(/[<>]/g, '');
      } else {
        nodeTypeString = node.node.attributes.nodeType
          .replace(/\sNode$/, '')
          .toLowerCase();
      }
      const markerId = node.node.indexId;
      const markerIdString = markerId ? `markerId="${markerId}"` : '';
      const rectAttribute = node.node.rect
        ? {
            left: node.node.rect.left,
            top: node.node.rect.top,
            width: node.node.rect.width,
            height: node.node.rect.height,
          }
        : {};
      before = `<${nodeTypeString} id="${node.node.id}" ${markerIdString} ${attributesString(trimAttributes(node.node.attributes || {}, truncateTextLength))} ${attributesString(rectAttribute)}>`;
      const content = truncateText(node.node.content, truncateTextLength);
      contentWithIndent = content ? `\n${indentStr}  ${content}` : '';
      after = `</${nodeTypeString}>`;
    } else if (!filterNonTextContent) {
      if (!children.trim().startsWith('<>')) {
        before = '<>';
        contentWithIndent = '';
        after = '</>';
      }
    }

    if (emptyNode && !children.trim()) {
      return '';
    }

    const result = `${indentStr}${before}${contentWithIndent}${children}\n${indentStr}${after}`;
    if (result.trim()) {
      return result;
    }
    return '';
  }

  const result = buildContentTree(tree);
  return result.replace(/^\s*\n/gm, '');
}

export function treeToList<T extends BaseElement>(
  tree: ElementTreeNode<T>,
): T[] {
  const result: T[] = [];
  function dfs(node: ElementTreeNode<T>) {
    if (node.node) {
      result.push(node.node);
    }
    for (const child of node.children) {
      dfs(child);
    }
  }
  dfs(tree);
  return result;
}

export function traverseTree<
  T extends BaseElement,
  ReturnNodeType extends BaseElement,
>(
  tree: ElementTreeNode<T>,
  onNode: (node: T) => ReturnNodeType,
): ElementTreeNode<ReturnNodeType> {
  function dfs(node: ElementTreeNode<T>) {
    if (node.node) {
      node.node = onNode(node.node) as any;
    }
    for (const child of node.children) {
      dfs(child);
    }
  }
  dfs(tree);
  return tree as any;
}
