'use client';
import { mousePointer } from '@/utils';
import { paramStr, typeStr } from '@midscene/core/agent';

import type {
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskInsightLocate,
  ExecutionTaskPlanning,
  GroupedActionDump,
  LocateResultElement,
  Rect,
  UIContext,
} from '@midscene/core';
import { treeToList } from '@midscene/shared/extractor';

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
}

const stillDuration = 900;
const actionSpinningPointerDuration = 300;
const stillAfterInsightDuration = 300;
const locateDuration = 800;
const actionDuration = 1000;
const clearInsightDuration = 200;

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

const screenshotSequenceFromContext = (context?: UIContext): string[] => {
  if (!context) {
    return [];
  }
  const unique = new Set<string>();
  const ordered: string[] = [];
  const push = (img?: string) => {
    if (!img || unique.has(img)) {
      return;
    }
    unique.add(img);
    ordered.push(img);
  };

  push(context.screenshotBase64);
  (context.screenshotBase64List || []).forEach((img) => {
    push(img);
  });

  return ordered;
};

export const allScriptsFromDump = (
  dump: GroupedActionDump,
): ReplayScriptsInfo | null => {
  // find out the width and height of the screenshot - collect all unique dimensions
  const dimensionsSet = new Set<string>();
  let firstWidth: number | undefined = undefined;
  let firstHeight: number | undefined = undefined;
  let sdkVersion: string | undefined = undefined;

  const modelBriefsSet = new Set<string>();

  dump.executions.forEach((execution) => {
    if (execution.sdkVersion) {
      sdkVersion = execution.sdkVersion;
    }

    execution.tasks.forEach((task) => {
      if (task.uiContext?.size?.width) {
        const w = task.uiContext.size.width;
        const h = task.uiContext.size.height;
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
  dump.executions.forEach((execution) => {
    const scripts = generateAnimationScripts(
      execution,
      -1,
      firstWidth!,
      firstHeight!,
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
              ? `${capitalizeFirstLetter(intent)}/${model_name}(${model_description})`
              : model_name,
          );
        }
      }
    });
  });

  const allScriptsWithoutIntermediateDoneFrame = allScripts.filter(
    (script, index) => {
      if (index !== allScripts.length - 1 && script.title === 'Done') {
        return false;
      }
      return true;
    },
  );

  const modelBriefs: string[] = (() => {
    const list = [...modelBriefsSet];
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
  execution: ExecutionDump | null,
  task: ExecutionTask | number,
  imageWidth: number,
  imageHeight: number,
): AnimationScript[] | null => {
  if (!execution || !execution.tasks.length) return null;
  if (imageWidth === 0 || imageHeight === 0) {
    return null;
  }

  let tasksIncluded: ExecutionTask[] = [];
  if (task === -1) {
    tasksIncluded = execution.tasks;
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

    for (let i = startIndex; i < execution.tasks.length; i++) {
      if (i > startIndex && execution.tasks[i].type === 'Planning') {
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

  const pointerScript = (
    img: string,
    title: string,
    subTitle: string,
  ): AnimationScript => {
    return {
      type: 'pointer',
      img,
      duration: 0,
      title,
      subTitle,
    };
  };

  const scripts: AnimationScript[] = [];
  let insightCameraState: TargetCameraState | undefined = undefined;
  let currentCameraState: TargetCameraState = fullPageCameraState;
  let insightOnTop = false;
  const taskCount = tasksIncluded.length;
  let initSubTitle = '';
  let errorStateFlag = false;
  tasksIncluded.forEach((task, index) => {
    if (errorStateFlag) return;

    if (index === 0) {
      initSubTitle = paramStr(task);
    }

    if (task.type === 'Planning') {
      const planningTask = task as ExecutionTaskPlanning;
      if (planningTask.recorder && planningTask.recorder.length > 0) {
        scripts.push({
          type: 'img',
          img: planningTask.recorder?.[0]?.screenshot,
          camera: index === 0 ? fullPageCameraState : undefined,
          duration: stillDuration,
          title: typeStr(task),
          subTitle: paramStr(task),
          imageWidth: task.uiContext?.size?.width || imageWidth,
          imageHeight: task.uiContext?.size?.height || imageHeight,
        });
      }
    } else if (task.type === 'Insight' && task.subType === 'Locate') {
      const insightTask = task as ExecutionTaskInsightLocate;
      const resultElement = insightTask.output?.element;
      const title = typeStr(task);
      const subTitle = paramStr(task);
      if (resultElement?.rect) {
        insightCameraState = {
          ...cameraStateForRect(resultElement.rect, imageWidth, imageHeight),
          pointerLeft: resultElement.center[0],
          pointerTop: resultElement.center[1],
        };
      }
      const context = insightTask.uiContext;
      const screenshots = screenshotSequenceFromContext(context);
      if (context && screenshots.length) {
        const [primaryScreenshot, ...extraScreenshots] = screenshots;
        const insightDump = insightTask.log?.dump;
        const insightContentLength = context.tree
          ? treeToList(context.tree).length
          : 0;

        // show the original screenshot first
        scripts.push({
          type: 'img',
          img: primaryScreenshot,
          duration: stillAfterInsightDuration,
          title,
          subTitle,
          imageWidth: context.size?.width || imageWidth,
          imageHeight: context.size?.height || imageHeight,
        });

        let cameraState: TargetCameraState | undefined = undefined;
        if (currentCameraState === fullPageCameraState) {
          cameraState = undefined;
        } else if (!insightCameraState) {
          cameraState = undefined;
        } else {
          cameraState = mergeTwoCameraState(
            currentCameraState,
            insightCameraState,
          );
        }

        scripts.push({
          type: 'insight',
          img: primaryScreenshot,
          context: context,
          camera: cameraState,
          highlightElement: insightTask.output?.element || undefined,
          searchArea: insightDump?.taskInfo?.searchArea,
          duration:
            insightContentLength > 20 ? locateDuration : locateDuration * 0.5,
          insightCameraDuration: locateDuration,
          title,
          subTitle,
          imageWidth: context.size?.width || imageWidth,
          imageHeight: context.size?.height || imageHeight,
        });

        scripts.push({
          type: 'sleep',
          duration: stillAfterInsightDuration,
          title,
          subTitle,
        });

        extraScreenshots.forEach((img, idx) => {
          scripts.push({
            type: 'img',
            img,
            duration: stillAfterInsightDuration,
            title,
            subTitle:
              extraScreenshots.length > 1
                ? `${subTitle} (#${idx + 2})`
                : `${subTitle} (#2)`,
            imageWidth: context.size?.width || imageWidth,
            imageHeight: context.size?.height || imageHeight,
          });
        });
        insightOnTop = true;
      }
    } else if (
      task.type === 'Action' &&
      task.subType !== 'FalsyConditionStatement'
    ) {
      const title = typeStr(task);
      const subTitle = paramStr(task);
      scripts.push(pointerScript(mousePointer, title, subTitle));

      currentCameraState = insightCameraState ?? fullPageCameraState;
      scripts.push({
        type: 'img',
        img: task.recorder?.[0]?.screenshot,
        duration: actionDuration,
        camera:
          task.subType === 'Sleep' ? fullPageCameraState : insightCameraState,
        title,
        subTitle,
        imageWidth: task.uiContext?.size?.width || imageWidth,
        imageHeight: task.uiContext?.size?.height || imageHeight,
      });

      if (insightOnTop) {
        scripts.push({
          type: 'clear-insight',
          duration: clearInsightDuration,
          title,
          subTitle,
        });
        insightOnTop = false;
      }

      // if this is the last task, we don't need to wait
      const imgStillDuration = index < taskCount - 1 ? stillDuration : 0;

      if (task.recorder?.[1]?.screenshot) {
        scripts.push({
          type: 'spinning-pointer',
          duration: actionSpinningPointerDuration,
          title,
          subTitle,
        });

        scripts.push(pointerScript(mousePointer, title, subTitle));
        scripts.push({
          type: 'img',
          img: task.recorder?.[1]?.screenshot,
          duration: imgStillDuration,
          title,
          subTitle,
          imageWidth: task.uiContext?.size?.width || imageWidth,
          imageHeight: task.uiContext?.size?.height || imageHeight,
        });
      } else {
        scripts.push({
          type: 'sleep',
          duration: imgStillDuration,
          title,
          subTitle,
        });
      }
    } else {
      // Handle normal tasks
      const title = typeStr(task);
      const subTitle = paramStr(task);
      const screenshot = task.recorder?.[task.recorder.length - 1]?.screenshot;

      if (screenshot) {
        scripts.push({
          type: 'img',
          img: screenshot,
          duration: stillDuration,
          camera: fullPageCameraState,
          title,
          subTitle,
          imageWidth: task.uiContext?.size?.width || imageWidth,
          imageHeight: task.uiContext?.size?.height || imageHeight,
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
      scripts.push({
        type: 'img',
        img:
          task.recorder && task.recorder.length > 0
            ? task.recorder[task.recorder.length - 1].screenshot
            : '',
        camera: fullPageCameraState,
        duration: stillDuration,
        title: errorTitle,
        subTitle: errorSubTitle,
        imageWidth: task.uiContext?.size?.width || imageWidth,
        imageHeight: task.uiContext?.size?.height || imageHeight,
      });
      return;
    }
  });

  // end, back to full page
  if (!errorStateFlag) {
    scripts.push({
      title: 'Done',
      subTitle: initSubTitle,
      type: 'img',
      duration: stillDuration,
      camera: fullPageCameraState,
    });
  }

  // console.log('replay scripts');
  // console.log(scripts, tasksIncluded);

  return scripts;
};
