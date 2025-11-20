import type {
  DetailedLocateParam,
  ExecutionTask,
  ExecutionTaskAction,
  ExecutionTaskInsightAssertion,
  ExecutionTaskInsightQuery,
  ExecutionTaskPlanning,
  ExecutionTaskPlanningLocate,
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
    // Check for nested prompt.prompt (Planning Locate tasks)
    if (
      typeof locate.prompt === 'object' &&
      locate.prompt !== null &&
      locate.prompt.prompt
    ) {
      const prompt = locate.prompt.prompt;
      return prompt;
    }

    // Check for direct prompt string
    if (typeof locate.prompt === 'string') {
      return locate.prompt;
    }

    // Check for description field (Action Space tasks like Tap, Hover)
    if (typeof (locate as any).description === 'string') {
      return (locate as any).description;
    }
  }

  return '';
}

export function scrollParamStr(scrollParam?: ScrollParam) {
  if (!scrollParam) {
    return '';
  }
  return `${scrollParam.direction || 'down'}, ${scrollParam.scrollType || 'singleAction'}, ${scrollParam.distance || 'distance-not-set'}`;
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
    if (task.subType === 'Locate') {
      value = locateParamStr((task as ExecutionTaskPlanningLocate)?.param);
    } else {
      value = (task as ExecutionTaskPlanning)?.param?.userInstruction;
    }
  }

  if (task.type === 'Insight') {
    const insightTask = task as any;
    // For Insight tasks with multimodalPrompt, extract only the demand/assertion text
    if (insightTask?.param?.demand) {
      value = insightTask.param.demand;
    } else if (insightTask?.param?.assertion) {
      value = insightTask.param.assertion;
    } else if (insightTask?.param?.dataDemand) {
      // dataDemand can be a string or an object with demand field
      const dataDemand = insightTask.param.dataDemand;
      value = typeof dataDemand === 'string' ? dataDemand : dataDemand?.demand;
    } else {
      value =
        (task as ExecutionTaskInsightQuery)?.param?.dataDemand ||
        (task as ExecutionTaskInsightAssertion)?.param?.assertion;
    }
  }

  if (task.type === 'Action Space') {
    const locate = (task as ExecutionTaskAction)?.param?.locate;
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
