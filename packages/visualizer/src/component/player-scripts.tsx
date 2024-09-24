'use client';
import './player.less';
import { mousePointer, typeStr } from '@/utils';
import type {
  ExecutionDump,
  ExecutionTaskInsightLocate,
  ExecutionTaskPlanning,
  InsightDump,
  Rect,
} from '@midscene/core/.';

export interface CameraState {
  left: number;
  top: number;
  width: number;
  pointer: {
    left: number;
    top: number;
  };
}

export type TargetCameraState = Omit<CameraState, 'pointer'> &
  Partial<Pick<CameraState, 'pointer'>>;

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
  insightDump?: InsightDump;
  duration: number;
  title?: string;
  subTitle?: string;
}

const stillDuration = 1200;
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

  const cameraPaddingRatio = 0.16;
  const cameraWidth = rectWidthOnPage + imageWidth * cameraPaddingRatio * 2;
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
    left,
    top,
    width: cameraWidth,
  };
};

export const generateAnimationScripts = (
  execution: ExecutionDump | null,
  imageWidth: number,
  imageHeight: number,
): AnimationScript[] | null => {
  if (!execution) return null;
  if (imageWidth === 0 || imageHeight === 0) {
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

  const pointerScript = (img: string): AnimationScript => {
    return {
      type: 'pointer',
      img,
      duration: 0,
    };
  };

  if (execution.tasks.length === 1 && execution.tasks[0].subType === 'Query') {
    console.log('query task', execution.tasks[0]);
    return [];
  }
  const scripts: AnimationScript[] = [];
  let insightCameraState: TargetCameraState | undefined = undefined;
  let insightOnTop = false;
  execution.tasks.forEach((task) => {
    if (task.type === 'Planning') {
      const planningTask = task as ExecutionTaskPlanning;
      if (planningTask.recorder && planningTask.recorder.length > 0) {
        scripts.push({
          type: 'img',
          img: planningTask.recorder?.[0]?.screenshot,
          duration: 500,
          title: typeStr(task),
          subTitle: planningTask.param?.userPrompt,
        });
      }
    } else if (task.type === 'Insight' && task.subType === 'Locate') {
      const insightTask = task as ExecutionTaskInsightLocate;
      const resultElement = insightTask.output?.element;
      if (resultElement?.rect) {
        insightCameraState = {
          ...cameraStateForRect(resultElement.rect, imageWidth, imageHeight),
          pointer: {
            left: resultElement.center[0],
            top: resultElement.center[1],
          },
        };
      }
      if (insightTask.log?.dump) {
        const insightDump = insightTask.log.dump;
        if (!insightDump?.context?.screenshotBase64) {
          throw new Error('insight dump is required');
        }
        const insightContentLength = insightDump.context.content.length;
        scripts.push({
          type: 'insight',
          img: insightDump.context.screenshotBase64,
          insightDump: insightDump,
          duration:
            insightContentLength > 20 ? locateDuration : locateDuration * 0.5,
          title: typeStr(task),
          subTitle: insightTask.param?.prompt,
        });

        scripts.push({
          type: 'sleep',
          duration: 800,
        });
        insightOnTop = true;
      }
    } else if (task.type === 'Action') {
      scripts.push(pointerScript(mousePointer));

      scripts.push({
        type: 'img',
        img: task.recorder?.[0]?.screenshot,
        duration: actionDuration,
        camera: insightCameraState,
        title: typeStr(task),
        subTitle: task.param?.value || '', // input value
      });

      if (insightOnTop) {
        scripts.push({
          type: 'clear-insight',
          duration: clearInsightDuration,
        });
        insightOnTop = false;
      }

      if (task.recorder?.[1]?.screenshot) {
        scripts.push({
          type: 'spinning-pointer',
          duration: stillDuration,
        });

        scripts.push(pointerScript(mousePointer));
        scripts.push({
          type: 'img',
          img: task.recorder?.[1]?.screenshot,
          duration: stillDuration,
          // camera: fullPageCameraState,
          title: typeStr(task),
          subTitle: task.param?.value || '', // input value
        });
      } else {
        scripts.push({
          type: 'sleep',
          duration: stillDuration,
        });
      }
    }
  });

  // end, back to full page
  scripts.push({
    type: 'img',
    duration: stillDuration,
    camera: fullPageCameraState,
  });

  scripts.push({
    type: 'sleep',
    duration: stillDuration,
  });
  return scripts;
};
