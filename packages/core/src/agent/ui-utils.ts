import type {
  DetailedLocateParam,
  ExecutionTask,
  ExecutionTaskAction,
  ExecutionTaskInsightAssertion,
  ExecutionTaskInsightLocate,
  ExecutionTaskInsightQuery,
  ExecutionTaskPlanning,
  PullParam,
  ScrollParam,
} from '@/types';

export function typeStr(task: ExecutionTask) {
  // // For Action tasks with subType, show "Action Space / subType"
  // if (task.type === 'Action' && task.subType) {
  //   return `Action Space / ${task.subType}`;
  // }

  // // For all other cases with subType, show "type / subType"
  // if (task.subType) {
  //   return `${task.type} / ${task.subType}`;
  // }

  // No subType, just show type
  return task.subType || task.type;
}

export function locateParamStr(locate?: DetailedLocateParam | string): string {
  if (!locate) {
    return '';
  }

  if (typeof locate === 'string') {
    return locate;
  }

  if (typeof locate === 'object') {
    if (typeof locate.prompt === 'string') {
      return locate.prompt;
    }

    if (typeof locate.prompt === 'object' && locate.prompt.prompt) {
      const prompt = locate.prompt.prompt;
      const images = locate.prompt.images || [];

      if (images.length === 0) return prompt;

      const imagesStr = images
        .map((image) => {
          let url = image.url;
          if (
            url.startsWith('data:image/') ||
            (url.startsWith('data:') && url.includes('base64'))
          ) {
            url = `${url.substring(0, 15)}...`;
          }
          return `[${image.name}](${url})`;
        })
        .join(', ');

      return `${prompt}, ${imagesStr}`;
    }
  }

  return '';
}

export function scrollParamStr(scrollParam?: ScrollParam) {
  if (!scrollParam) {
    return '';
  }
  return `${scrollParam.direction || 'down'}, ${scrollParam.scrollType || 'once'}, ${scrollParam.distance || 'distance-not-set'}`;
}

export function pullParamStr(pullParam?: PullParam) {
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
      locateParamStr((task as ExecutionTaskInsightLocate)?.param) ||
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
    } else if (
      (task as ExecutionTaskAction)?.param &&
      typeof (task as ExecutionTaskAction)?.param === 'object' &&
      Object.keys((task as ExecutionTaskAction)?.param || {}).length > 0
    ) {
      // General parameter handling for actions with custom parameters
      // (e.g., runWdaRequest, runAdbShell)
      value = (task as ExecutionTaskAction)?.param;
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

  if (typeof value === 'string') return value;

  if (typeof value === 'object' && locateParamStr(value as any)) {
    return locateParamStr(value as any);
  }

  return JSON.stringify(value, undefined, 2);
}
