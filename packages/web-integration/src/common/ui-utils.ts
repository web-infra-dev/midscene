import type {
  DetailedLocateParam,
  ExecutionTask,
  ExecutionTaskAction,
  ExecutionTaskInsightAssertion,
  ExecutionTaskInsightLocate,
  ExecutionTaskInsightQuery,
  ExecutionTaskPlanning,
  PlanningActionParamScroll,
} from '@midscene/core';

export function typeStr(task: ExecutionTask) {
  return task.subType && task.subType !== 'Plan'
    ? `${task.type} / ${task.subType || ''}`
    : task.type;
}

export function getKeyCommands(
  value: string | string[],
): Array<{ key: string; command?: string }> {
  // Ensure value is an array of keys
  const keys = Array.isArray(value) ? value : [value];

  // Process each key to attach a corresponding command if needed, based on the presence of 'Meta' or 'Control' in the keys array.
  // ref: https://github.com/puppeteer/puppeteer/pull/9357/files#diff-32cf475237b000f980eb214a0a823e45a902bddb7d2426d677cae96397aa0ae4R94
  return keys.reduce((acc: Array<{ key: string; command?: string }>, k) => {
    const includeMeta = keys.includes('Meta') || keys.includes('Control');
    if (includeMeta && (k === 'a' || k === 'A')) {
      return acc.concat([{ key: k, command: 'SelectAll' }]);
    }
    if (includeMeta && (k === 'c' || k === 'C')) {
      return acc.concat([{ key: k, command: 'Copy' }]);
    }
    if (includeMeta && (k === 'v' || k === 'V')) {
      return acc.concat([{ key: k, command: 'Paste' }]);
    }
    return acc.concat([{ key: k }]);
  }, []);
}

export function locateParamStr(locate?: DetailedLocateParam) {
  if (!locate) {
    return '';
  }

  if (typeof locate === 'string') {
    return locate;
  }

  return locate.prompt;
}

export function scrollParamStr(scrollParam?: PlanningActionParamScroll) {
  if (!scrollParam) {
    return '';
  }
  return `${scrollParam.direction || 'down'}, ${scrollParam.scrollType || 'once'}, ${scrollParam.distance || 'distance-not-set'}`;
}

export function taskTitleStr(
  type:
    | 'Tap'
    | 'Hover'
    | 'Input'
    | 'RightClick'
    | 'KeyboardPress'
    | 'Scroll'
    | 'ImgTap'
    | 'Action'
    | 'Query'
    | 'Assert'
    | 'WaitFor'
    | 'Locate'
    | 'Boolean'
    | 'Number'
    | 'String',
  prompt: string,
) {
  if (prompt) {
    return `${type} - ${prompt}`;
  }
  return type;
}

export function paramStr(task: ExecutionTask) {
  let value: string | undefined | object;
  if (task.type === 'Planning') {
    value = (task as ExecutionTaskPlanning)?.param?.userInstruction;
  }

  if (task.type === 'Insight') {
    value =
      (task as ExecutionTaskInsightLocate)?.param?.prompt ||
      (task as ExecutionTaskInsightLocate)?.param?.id ||
      (task as ExecutionTaskInsightQuery)?.param?.dataDemand ||
      (task as ExecutionTaskInsightAssertion)?.param?.assertion;
  }

  if (task.type === 'Action') {
    const locate = (task as ExecutionTaskAction)?.locate;
    const locateStr = locate ? locateParamStr(locate) : '';

    value = task.thought || '';
    if (typeof (task as ExecutionTaskAction)?.param?.timeMs === 'number') {
      value = `${(task as ExecutionTaskAction)?.param?.timeMs}ms`;
    } else if (
      typeof (task as ExecutionTaskAction)?.param?.scrollType === 'string'
    ) {
      value = scrollParamStr((task as ExecutionTaskAction)?.param);
    } else if (
      typeof (task as ExecutionTaskAction)?.param?.value !== 'undefined'
    ) {
      value = (task as ExecutionTaskAction)?.param?.value;
    }

    if (locateStr) {
      if (value) {
        value = `${locateStr} - ${value}`;
      } else {
        value = locateStr;
      }
    }
  }

  if (typeof value === 'undefined') return '';
  return typeof value === 'string'
    ? value
    : JSON.stringify(value, undefined, 2);
}

export const limitOpenNewTabScript = `
if (!window.__MIDSCENE_NEW_TAB_INTERCEPTOR_INITIALIZED__) {
  window.__MIDSCENE_NEW_TAB_INTERCEPTOR_INITIALIZED__ = true;

  // Intercept the window.open method (only once)
  window.open = function(url) {
    console.log('Blocked window.open:', url);
    window.location.href = url;
    return null;
  };

  // Block all a tag clicks with target="_blank" (only once)
  document.addEventListener('click', function(e) {
    const target = e.target.closest('a');
    if (target && target.target === '_blank') {
      e.preventDefault();
      console.log('Blocked new tab:', target.href);
      window.location.href = target.href;
      target.removeAttribute('target');
    }
  }, true);
}
`;
