import type {
  AndroidPullParam,
  DetailedLocateParam,
  ExecutionTask,
  ExecutionTaskAction,
  ExecutionTaskInsightAssertion,
  ExecutionTaskInsightLocate,
  ExecutionTaskInsightQuery,
  ExecutionTaskPlanning,
  ScrollParam,
} from '@/index';

export function typeStr(task: ExecutionTask) {
  return task.subType && task.subType !== 'Plan'
    ? `${task.type} / ${task.subType || ''}`
    : task.type;
}

export function locateParamStr(locate?: DetailedLocateParam) {
  if (!locate) {
    return '';
  }

  if (typeof locate === 'string') {
    return locate;
  }

  if (typeof locate.prompt === 'string') {
    return locate.prompt;
  }

  if (typeof locate.prompt === 'object' && locate.prompt.prompt) {
    return locate.prompt.prompt;
  }

  return '';
}

export function scrollParamStr(scrollParam?: ScrollParam) {
  if (!scrollParam) {
    return '';
  }
  return `${scrollParam.direction || 'down'}, ${scrollParam.scrollType || 'once'}, ${scrollParam.distance || 'distance-not-set'}`;
}

export function pullParamStr(pullParam?: AndroidPullParam) {
  if (!pullParam) {
    return '';
  }
  const parts: string[] = [];
  parts.push(`direction: ${pullParam.direction || 'down'}`);
  if (pullParam.distance) {
    parts.push(`distance: ${pullParam.distance}`);
  }
  if (pullParam.duration) {
    parts.push(`duration: ${pullParam.duration}ms`);
  }
  return parts.join(', ');
}

export function taskTitleStr(
  type:
    | 'Tap'
    | 'Hover'
    | 'Input'
    | 'RightClick'
    | 'KeyboardPress'
    | 'Scroll'
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
      typeof (task as ExecutionTaskAction)?.param?.direction === 'string' &&
      (task as ExecutionTaskAction)?.subType === 'AndroidPull'
    ) {
      value = pullParamStr((task as ExecutionTaskAction)?.param);
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
