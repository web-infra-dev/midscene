const script = `
(function () {
  const TEXT_SIZE_THRESHOLD = 9;
  const taskIdKey = '_midscene_retrieve_task_id';
  const nodeDataIdKey = 'data-midscene-task-';
  const nodeIndexKey = '_midscene_retrieve_node_index';

  function dataKey() {
    return nodeDataIdKey + window[taskIdKey];
  }

  function selectorForValue(val) {
    return "[" + dataKey() + "='" + val + "']";
  }

  function setDataForNode(node) {
    const taskId = window[taskIdKey];
    if (!taskId) {
      console.error('Error: Task ID not found.');
      return null;
    }

    const dataValue = window[nodeIndexKey];
    window[nodeIndexKey] += 1;

    const selector = selectorForValue(dataValue);
    node.setAttribute(dataKey(), dataValue);
    return selector;
  }

  function visibleRect(el) {
    if (!el) {
      console.warn('Warning: Element not found in DOM hierarchy.');
      return false;
    }

    if (!(el instanceof Element)) {
      el = el.parentElement;
      if (!el) {
        console.warn('Warning: Parent element not found.');
        return false;
      }
    }

    const style = window.getComputedStyle(el);
    if (['none', 'hidden'].includes(style.display) || style.visibility === 'hidden' || style.opacity === '0') {
      console.warn('Warning: Element is hidden.');
      return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      console.warn('Warning: Element has no size.');
      return false;
    }

    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    const isInViewport =
      rect.top >= 0 + scrollTop &&
      rect.left >= 0 + scrollLeft &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + scrollTop &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth) + scrollLeft;

    if (!isInViewport) {
      console.warn('Warning: Element is not in the viewport.');
      return false;
    }

    let parent = el;
    while (parent && parent !== document.body) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.overflow === 'hidden') {
        const parentRect = parent.getBoundingClientRect();
        const tolerance = 10;
        if (
          rect.top < parentRect.top - tolerance ||
          rect.left < parentRect.left - tolerance ||
          rect.bottom > parentRect.bottom + tolerance ||
          rect.right > parentRect.right + tolerance
        ) {
          console.warn('Warning: Element is clipped by an ancestor.', parent);
          return false;
        }
      }
      parent = parent.parentElement;
    }

    return {
      rect: {
        left: Math.round(rect.left - scrollLeft),
        top: Math.round(rect.top - scrollTop),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      node: el,
    };
  }

  function validTextNodeContent(node) {
    if (!node) {
      return false;
    }

    if (node.nodeType === Node.COMMENT_NODE) {
      return false;
    }

    if (node.tagName === 'INPUT') {
      return node.value || node.placeholder || false;
    }

    const everyChildIsText = Array.from(node.childNodes).every((child) => child.nodeType === Node.TEXT_NODE);
    if (!everyChildIsText) {
      return false;
    }

    const content = node.textContent || node.innerText;
    return content && !/^\\s*$/.test(content) ? content.trim() : false;
  }

  function extractTextWithPosition(initNode) {
    const textInfoArray = [];
    window[taskIdKey] = window[taskIdKey] ? window[taskIdKey] + 1 : 1;
    window[nodeIndexKey] = 0;

    function dfs(node) {
      if (!node) return;

      const text = validTextNodeContent(node);
      if (text) {
        const answerRect = visibleRect(node);
        if (!answerRect) {
          console.warn('Warning: Element is not visible', node);
          return;
        }

        const { rect } = answerRect;
        if (rect.width < TEXT_SIZE_THRESHOLD || rect.height < TEXT_SIZE_THRESHOLD) {
          console.warn('Warning: Element is too small.', text);
          return;
        }

        const actualNode = answerRect.node;
        const selector = setDataForNode(actualNode);

        textInfoArray.push({
          locator: selector,
          content: text,
          rect,
          center: [
            Math.round(rect.left + rect.width / 2),
            Math.round(rect.top + rect.height / 2),
          ],
        });

        return;
      }

      for (let i = 0; i < node.childNodes.length; i++) {
        dfs(node.childNodes[i]);
      }
    }

    dfs(initNode);
    return textInfoArray;
  }

  window.extractTextWithPosition = extractTextWithPosition;
  window.ifNodeIsValid = validTextNodeContent;

  const container =
    typeof window.get_all_text_container === 'undefined'
      ? document.body
      : window.get_all_text_container;

  try {
    return extractTextWithPosition(container);
  } catch (error) {
    console.error('Error extracting text:', error);
  }
})();
`;

export default script;
