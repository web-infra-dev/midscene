'use client';
import { mousePointer } from '@/utils';
import { paramStr, typeStr } from '@midscene/core/agent';

import type {
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskPlanning,
  GroupedActionDump,
  IExecutionDump,
  IGroupedActionDump,
  LocateResultElement,
  Rect,
  UIContext,
} from '@midscene/core';

// Local type definition for Planning Locate task
interface ExecutionTaskPlanningLocate extends ExecutionTask {
  type: 'Planning';
  subType: 'Locate';
  output?: {
    element: LocateResultElement | null;
  };
  uiContext?: UIContext;
  log?: any;
}

export interface CameraState {
  left: number;
  top: number;
  width: number;
  pointerLeft: number;
  pointerTop: number;
}

export type TargetCameraState = Omit<
  CameraState,
  'pointerLeft' | 'pointerTop'
> &
  Partial<Pick<CameraState, 'pointerLeft' | 'pointerTop'>>;

export interface AnimationScript {
  type:
    | 'img'
    | 'insight'
    | 'clear-insight'
    | 'pointer'
    | 'spinning-pointer'
    | 'sleep';
  img?: string;
  camera?: TargetCameraState;
  context?: UIContext;
  highlightElement?: LocateResultElement;
  searchArea?: Rect;
  duration: number;
  insightCameraDuration?: number;
  title?: string;
  subTitle?: string;
  imageWidth?: number;
  imageHeight?: number;
  taskId?: string; // ID of the associated ExecutionTask for playback synchronization
}

const stillDuration = 900;
const actionSpinningPointerDuration = 300;
const stillAfterInsightDuration = 300;
const locateDuration = 800;
const actionDuration = 500;
const clearInsightDuration = 200;
const lastFrameDuration = 200;

// fit rect to camera
export const cameraStateForRect = (
  rect: Rect,
  imageWidth: number,
  imageHeight: number,
): TargetCameraState => {
  const canvasRatio = imageWidth / imageHeight;
  const rectRatio = rect.width / rect.height;

  let rectWidthOnPage: number;

  if (rectRatio >= canvasRatio) {
    rectWidthOnPage = rect.width;
  } else {
    rectWidthOnPage = (rect.height / imageHeight) * imageWidth;
  }

  const cameraPaddingRatio =
    rectWidthOnPage > 400 ? 0.1 : rectWidthOnPage > 50 ? 0.2 : 0.3;
  const cameraWidth = Math.min(
    imageWidth,
    rectWidthOnPage + imageWidth * cameraPaddingRatio * 2,
  );
  const cameraHeight = cameraWidth * (imageHeight / imageWidth);

  let left = Math.min(
    rect.left - imageWidth * cameraPaddingRatio,
    imageWidth - cameraWidth,
  );
  left = Math.max(left, 0);

  let top = Math.min(
    rect.top - imageHeight * cameraPaddingRatio,
    imageHeight - cameraHeight,
  );
  top = Math.max(top, 0);

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(cameraWidth),
  };
};

export const mergeTwoCameraState = (
  cameraState1: TargetCameraState,
  cameraState2: TargetCameraState,
): TargetCameraState => {
  const newLeft = Math.min(cameraState1.left, cameraState2.left);
  const newTop = Math.min(cameraState1.top, cameraState2.top);
  const newRight = Math.max(
    cameraState1.left + cameraState1.width,
    cameraState2.left + cameraState2.width,
  );
  const newWidth = newRight - newLeft;
  return {
    left: newLeft,
    top: newTop,
    width: newWidth,
  };
};

export interface ReplayScriptsInfo {
  scripts: AnimationScript[];
  width?: number;
  height?: number;
  sdkVersion?: string;
  modelBriefs: string[];
}

const capitalizeFirstLetter = (str: string) => {
  if (typeof str !== 'string' || str.length === 0) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const allScriptsFromDump = (
  dump:
    | GroupedActionDump
    | IGroupedActionDump
    | ExecutionDump
    | null
    | undefined,
): ReplayScriptsInfo | null => {
  if (!dump) {
    console.warn('[allScriptsFromDump] dump is empty');
    return {
      scripts: [],
      modelBriefs: [],
    };
  }

  const normalizedDump: IGroupedActionDump = Array.isArray(
    (dump as GroupedActionDump).executions,
  )
    ? (dump as GroupedActionDump)
    : {
        sdkVersion: '',
        groupName: 'Execution',
        modelBriefs: [],
        executions: [dump as ExecutionDump],
      };

  // find out the width and height of the screenshot - collect all unique dimensions
  const dimensionsSet = new Set<string>();
  let firstWidth: number | undefined = undefined;
  let firstHeight: number | undefined = undefined;
  const sdkVersion: string | undefined = normalizedDump.sdkVersion;

  const modelBriefsSet = new Set<string>();

  normalizedDump.executions?.filter(Boolean).forEach((execution) => {
    execution.tasks.forEach((task) => {
      if (task.uiContext?.shotSize?.width) {
        const w = task.uiContext.shotSize.width;
        const h = task.uiContext.shotSize.height;
        if (!firstWidth) {
          firstWidth = w;
          firstHeight = h;
        }
        dimensionsSet.add(`${w}x${h}`);
      }
    });
  });

  if (!firstWidth || !firstHeight) {
    console.warn('width or height is missing in dump file');
    return {
      scripts: [],
      sdkVersion,
      modelBriefs: [],
    };
  }

  // Use first dimensions as default for the overall player size
  const allScripts: AnimationScript[] = [];
  const executions = normalizedDump.executions?.filter(Boolean) || [];
  for (let execIndex = 0; execIndex < executions.length; execIndex++) {
    const execution = executions[execIndex];
    const scripts = generateAnimationScripts(
      execution,
      -1,
      firstWidth!,
      firstHeight!,
      execIndex,
    );
    if (scripts) {
      allScripts.push(...scripts);
    }
    execution.tasks.forEach((task) => {
      if (task.usage) {
        const { model_name, model_description, intent } = task.usage;
        if (intent && model_name) {
          modelBriefsSet.add(
            model_description
              ? `${intent}/${model_name}(${model_description})`
              : `${intent}/${model_name}`,
          );
        }
      }
    });
  }

  const allScriptsWithoutIntermediateDoneFrame = allScripts.filter(
    (script, index) => {
      if (index !== allScripts.length - 1 && script.title === 'Done') {
        return false;
      }
      return true;
    },
  );

  const normalizedModelBriefs = normalizedDump.modelBriefs?.length
    ? normalizedDump.modelBriefs
    : [];

  const modelBriefs: string[] = (() => {
    const list = normalizedModelBriefs.length
      ? normalizedModelBriefs
      : [...modelBriefsSet];
    if (!list.length) {
      return list;
    }
    const firstOneInfo = list[0]?.split('/', 2)[1];
    // merge same modelName and modelDescription
    if (
      firstOneInfo &&
      list.slice(1).every((item) => item?.split('/', 2)[1] === firstOneInfo)
    ) {
      return [firstOneInfo];
    }

    return list;
  })();

  return {
    scripts: allScriptsWithoutIntermediateDoneFrame,
    width: firstWidth,
    height: firstHeight,
    sdkVersion,
    modelBriefs,
  };
};

export const generateAnimationScripts = (
  execution: ExecutionDump | IExecutionDump | null,
  task: ExecutionTask | number,
  imageWidth: number,
  imageHeight: number,
  executionIndex = 0,
): AnimationScript[] | null => {
  if (!execution || !execution.tasks.length) return null;
  if (imageWidth === 0 || imageHeight === 0) {
    return null;
  }

  let tasksIncluded: ExecutionTask[] = [];
  let taskStartIndex = 0;
  if (task === -1) {
    tasksIncluded = execution.tasks;
    taskStartIndex = 0;
  } else {
    // find all tasks before next planning task
    const startIndex = execution.tasks.findIndex((t) => t === task);

    if (startIndex === -1) {
      console.error('task not found, cannot generate animation scripts');
      return null;
    }

    if (startIndex === execution.tasks.length - 1) {
      return null;
    }

    taskStartIndex = startIndex;
    for (let i = startIndex; i < execution.tasks.length; i++) {
      if (
        i > startIndex &&
        execution.tasks[i].type === 'Planning' &&
        execution.tasks[i].subType === 'Plan'
      ) {
        break;
      }

      tasksIncluded.push(execution.tasks[i]);
    }
  }

  if (tasksIncluded.length === 0) {
    return null;
  }

  const fullPageCameraState = cameraStateForRect(
    {
      left: 0,
      top: 0,
      width: imageWidth,
      height: imageHeight,
    },
    imageWidth,
    imageHeight,
  );

  // Get taskId from the task object
  const getTaskId = (taskIndex: number): string | undefined => {
    return tasksIncluded[taskIndex]?.taskId;
  };

  const setPointerScript = (
    img: string,
    title: string,
    subTitle: string,
    taskId?: string,
  ): AnimationScript => {
    return {
      type: 'pointer',
      img,
      duration: 0,
      title,
      subTitle,
      taskId,
    };
  };

  const scripts: AnimationScript[] = [];
  let insightCameraState: TargetCameraState | undefined = undefined;
  // let currentCameraState: TargetCameraState = fullPageCameraState;
  let insightOnTop = false;
  let initSubTitle = '';
  let errorStateFlag = false;
  tasksIncluded.forEach((task, index) => {
    const currentTaskId = getTaskId(index);
    // if (errorStateFlag) return;

    if (index === 0) {
      initSubTitle = paramStr(task);
    }

    if (task.type === 'Planning') {
      let locateElements: LocateResultElement[] = [];
      if (task.subType === 'Plan') {
        const planTask = task as ExecutionTaskPlanning;
        const actions = planTask.output?.actions || [];
        if (actions.length > 0) {
          const action = actions[0];
          const knownFields = ['locate', 'start', 'end'];
          if (action.param) {
            knownFields.forEach((field) => {
              if (
                action.param[field] &&
                typeof action.param[field] === 'object' &&
                'center' in (action.param[field] || {})
              ) {
                locateElements.push(action.param[field] as LocateResultElement);
              }
            });
            for (const key in action.param) {
              if (knownFields.includes(key)) {
                continue;
              }
              if (
                typeof action.param[key] === 'object' &&
                'center' in (action.param[key] || {})
              ) {
                locateElements.push(action.param[key] as LocateResultElement);
              }
            }
          }
        }
      } else if (task.subType === 'Locate' && task.output?.element) {
        const locateTask = task as ExecutionTaskPlanningLocate;
        locateElements = [locateTask.output!.element!];
      }

      const title = typeStr(task);
      const subTitle = paramStr(task);
      const context = task.uiContext;
      if (context?.screenshot) {
        // show the original screenshot first
        const width = context.shotSize?.width || imageWidth;
        const height = context.shotSize?.height || imageHeight;
        const screenshotData = (
          context.screenshot as unknown as { base64: string }
        ).base64;
        scripts.push({
          type: 'img',
          img: screenshotData,
          duration: stillAfterInsightDuration,
          title,
          subTitle,
          imageWidth: width,
          imageHeight: height,
          taskId: currentTaskId,
        });

        locateElements.forEach((element) => {
          insightCameraState = {
            ...cameraStateForRect(element.rect, width, height),
            pointerLeft: element.center[0],
            pointerTop: element.center[1],
          };

          const newCameraState: TargetCameraState = insightCameraState;
          // currentCameraState === fullPageCameraState
          //   ? insightCameraState
          //   : mergeTwoCameraState(currentCameraState, insightCameraState);

          // console.log('insightCameraState', insightCameraState);
          // console.log('currentCameraState', currentCameraState);
          // console.log('newCameraState', newCameraState);

          scripts.push({
            type: 'insight',
            img: screenshotData,
            context: context,
            camera: newCameraState,
            highlightElement: element,
            searchArea: task.log?.taskInfo?.searchArea,
            duration: locateDuration * 0.5,
            insightCameraDuration: locateDuration,
            title,
            subTitle: element.description || subTitle,
            imageWidth: context.shotSize?.width || imageWidth,
            imageHeight: context.shotSize?.height || imageHeight,
            taskId: currentTaskId,
          });

          // scripts.push({
          //   type: 'sleep',
          //   duration: stillAfterInsightDuration,
          //   title,
          //   subTitle,
          // });
          insightOnTop = true;
          // currentCameraState = newCameraState;
        });
      }

      const planningTask = task as ExecutionTaskPlanning;
      if (planningTask.recorder && planningTask.recorder.length > 0) {
        const screenshot = planningTask.recorder[0]?.screenshot;
        const screenshotData =
          (screenshot as unknown as { base64: string } | undefined)?.base64 ||
          '';
        scripts.push({
          type: 'img',
          img: screenshotData,
          duration: stillDuration,
          title: typeStr(task),
          subTitle: paramStr(task),
          imageWidth: task.uiContext?.shotSize?.width || imageWidth,
          imageHeight: task.uiContext?.shotSize?.height || imageHeight,
          taskId: currentTaskId,
        });
      }
    } else if (task.type === 'Action Space') {
      const title = typeStr(task);
      const subTitle = paramStr(task);

      scripts.push({
        type: 'spinning-pointer',
        duration: actionSpinningPointerDuration,
        title,
        subTitle,
        taskId: currentTaskId,
      });

      if (insightOnTop) {
        // TODO: fine tune the duration
        scripts.push({
          type: 'clear-insight',
          duration: clearInsightDuration,
          title,
          subTitle,
          taskId: currentTaskId,
        });
        insightOnTop = false;
      }

      scripts.push(
        setPointerScript(mousePointer, title, subTitle, currentTaskId),
      );

      // currentCameraState = insightCameraState ?? fullPageCameraState;
      // const ifLastTask = index === taskCount - 1;
      const screenshot = task.recorder?.[0]?.screenshot;
      const actionScreenshotData =
        (screenshot as unknown as { base64: string } | undefined)?.base64 || '';
      scripts.push({
        type: 'img',
        img: actionScreenshotData,
        duration: actionDuration,
        camera: task.subType === 'Sleep' ? fullPageCameraState : undefined,
        title,
        subTitle,
        imageWidth: task.uiContext?.shotSize?.width || imageWidth,
        imageHeight: task.uiContext?.shotSize?.height || imageHeight,
        taskId: currentTaskId,
      });
    } else {
      // Handle normal tasks
      const title = typeStr(task);
      const subTitle = paramStr(task);
      const screenshot = task.recorder?.[task.recorder.length - 1]?.screenshot;

      if (screenshot) {
        const screenshotData = (screenshot as unknown as { base64: string })
          .base64;
        scripts.push({
          type: 'img',
          img: screenshotData,
          duration: stillDuration,
          camera: fullPageCameraState,
          title,
          subTitle,
          imageWidth: task.uiContext?.shotSize?.width || imageWidth,
          imageHeight: task.uiContext?.shotSize?.height || imageHeight,
          taskId: currentTaskId,
        });
      }
    }
    if (task.status !== 'finished') {
      errorStateFlag = true;
      const errorTitle = typeStr(task);
      const errorMsg = task.errorMessage || 'unknown error';
      const errorSubTitle =
        errorMsg.indexOf('NOT_IMPLEMENTED_AS_DESIGNED') > 0
          ? 'Further actions cannot be performed in the current environment'
          : errorMsg;
      const screenshot = task.recorder?.[task.recorder.length - 1]?.screenshot;
      const errorScreenshotData =
        (screenshot as unknown as { base64: string } | undefined)?.base64 || '';
      scripts.push({
        type: 'img',
        img: errorScreenshotData,
        camera: fullPageCameraState,
        duration: stillDuration,
        title: errorTitle,
        subTitle: errorSubTitle,
        imageWidth: task.uiContext?.shotSize?.width || imageWidth,
        imageHeight: task.uiContext?.shotSize?.height || imageHeight,
        taskId: currentTaskId,
      });
    }
  });

  scripts.push({
    title: 'End',
    subTitle: initSubTitle,
    type: 'img',
    duration: lastFrameDuration,
    camera: fullPageCameraState,
    taskId: undefined, // Explicitly set to undefined to clear the playing state
  });

  return scripts;
};
