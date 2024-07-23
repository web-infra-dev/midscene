/* eslint-disable */
(function () {
  const TEXT_SIZE_THRESHOLD = 9;
  const taskIdKey = '_midscene_retrieve_task_id';
  const nodeDataIdKey = 'data-midscene-task-';
  const nodeIndexKey = '_midscene_retrieve_node_index';

  function dataKey() {
    return nodeDataIdKey + window[taskIdKey];
  }

  function selectorForValue(val) {
    return `[${dataKey()}='${val}']`;
  }

  function setDataForNode(node) {
    const taskId = window[taskIdKey];
    const dataValue = window[nodeIndexKey];
    window[nodeIndexKey] += 1;
    if (!taskId) {
      console.error('No task id found');
      return;
    }

    const selector = selectorForValue(dataValue);
    node.setAttribute(dataKey(), dataValue);
    return selector;
  }

  function visibleRect(el) {
    // Check if the element is in the DOM hierarchy
    if (!el) {
      console.log('Element is not in the DOM hierarchy');
      return false;
    }

    // If 'el' is not an instance of Element, find the nearest parent Element
    if (!(el instanceof Element)) {
      el = el.parentElement;
      if (!el) {
        console.log('Element is not in the DOM hierarchy');
        return false;
      }
    }

    // Check if the computed display property is "none"
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      console.log('Element is hidden');
      return false;
    }

    // It seems that the value might be wrong if an external monitor is connected ?
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      console.log('Element has no size');
      return false;
    }

    // Check if the element is hidden via clipping or scrolling.
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    const isInViewport =
      rect.top >= 0 + scrollTop &&
      rect.left >= 0 + scrollLeft &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + scrollTop &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth) + scrollLeft;

    if (!isInViewport) {
      console.log('Element is not in the viewport');
      console.log(rect, window.innerHeight, window.innerWidth, scrollTop, scrollLeft);
      return false;
    }

    // Check for overflow:hidden on the element's ancestors
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
          console.log('Element is clipped by an ancestor', parent, rect, parentRect);
          return false;
        }
      }
      parent = parent.parentElement;
    }

    // Return the rect object if the element is visible
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

    // if this is an <input />
    if (node.tagName === 'INPUT') {
      // return its value or placeholder
      return node.value || node.placeholder;
    }

    const everyChildNodeIsText = Array.from(node.childNodes).every(
      (child) => child.nodeType === Node.TEXT_NODE,
    );
    if (!everyChildNodeIsText) {
      return false;
    }

    const content = node.textContent || node.innerText;
    if (content && !/^\\s*$/.test(content)) {
      return content.trim();
    }

    return false;
  }

  function extractTextWithPositionDFS(initNode) {
    const textInfoArray = [];
    window[taskIdKey] = window[taskIdKey] ? window[taskIdKey] + 1 : 1;
    window[nodeIndexKey] = 0;

    function dfs(node) {
      if (!node) {
        return;
      }

      const text = validTextNodeContent(node);
      if (text) {
        const answerRect = visibleRect(node);

        // console.log('id is', id);
        // check if the text is visible
        if (!answerRect) {
          console.log('Element is not visible', node);
          return;
        }
        const { rect } = answerRect;

        if (rect.width < TEXT_SIZE_THRESHOLD || rect.height < TEXT_SIZE_THRESHOLD) {
          console.log('Element is too small', text);
          return;
        }

        const actualNode = answerRect.node;
        const selector = setDataForNode(actualNode);

        // console.log('will push', text, rect);
        textInfoArray.push({
          locator: selector,
          content: text,
          rect,
          center: [Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2)],
        });

        // should stop searching if the text is found
        return;
      }

      for (let i = 0; i < node.childNodes.length; i++) {
        console.log('will dfs', node.childNodes[i]);
        dfs(node.childNodes[i]);
      }

      return false;
    }

    dfs(initNode);
    return textInfoArray;
  }

  window.extractTextWithPositionDFS = extractTextWithPositionDFS;
  window.ifNodeIsValid = validTextNodeContent;
  const container =
    typeof window.get_all_text_container === 'undefined' ? document.body : window.get_all_text_container;
  return extractTextWithPositionDFS(container);
})();
