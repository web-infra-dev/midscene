'use client';
import 'pixi.js/unsafe-eval';
import * as PIXI from 'pixi.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import './player.less';
import { mouseLoading, mousePointer } from '@/utils';
import {
  CaretRightOutlined,
  DownloadOutlined,
  ExportOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { QuestionCircleOutlined } from '@ant-design/icons';
import type { BaseElement, LocateResultElement, Rect } from '@midscene/core';
import { treeToList } from '@midscene/shared/extractor';
import { Dropdown, Spin, Switch, Tooltip } from 'antd';
import GlobalPerspectiveIcon from '../icons/global-perspective.svg';
import SettingIcon from '../icons/player-setting.svg';
import { rectMarkForItem } from './blackboard';
import { getTextureFromCache, loadTexture } from './pixi-loader';
import type {
  AnimationScript,
  CameraState,
  TargetCameraState,
} from './replay-scripts';

const canvasPaddingLeft = 0;
const canvasPaddingTop = 0;

const cubicBezier = (
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number => {
  const t2 = 1 - t;
  return (
    p0 * t2 * t2 * t2 +
    3 * p1 * t * t2 * t2 +
    3 * p2 * t * t * t2 +
    p3 * t * t * t
  );
};

const cubicImage = (t: number): number => {
  // return cubicBezier(t, 0, 0.69, 0.43, 1);
  return linear(t);
};

const cubicInsightElement = (t: number): number => {
  return cubicBezier(t, 0, 0.5, 0.5, 1);
};

const cubicMouse = (t: number): number => {
  return linear(t);
};

const linear = (t: number): number => {
  return t;
};

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

type FrameFn = (callback: (current: number) => void) => void;

const ERROR_FRAME_CANCEL = 'frame cancel (this is an error on purpose)';
const frameKit = (): {
  frame: FrameFn;
  cancel: () => void;
  timeout: (callback: () => void, ms: number) => void;
} => {
  let cancelFlag = false;

  return {
    frame: (callback: (current: number) => void) => {
      if (cancelFlag) {
        throw new Error(ERROR_FRAME_CANCEL);
      }
      requestAnimationFrame(() => {
        if (cancelFlag) {
          throw new Error(ERROR_FRAME_CANCEL);
        }
        callback(performance.now());
      });
    },
    timeout: (callback: () => void, ms: number) => {
      if (cancelFlag) {
        throw new Error(ERROR_FRAME_CANCEL);
      }
      setTimeout(() => {
        if (cancelFlag) {
          throw new Error(ERROR_FRAME_CANCEL);
        }
        callback();
      }, ms);
    },
    cancel: () => {
      // console.log('set frame cancel (this is an error on purpose)');
      cancelFlag = true;
    },
  };
};

const singleElementFadeInDuration = 80;
const LAYER_ORDER_IMG = 0;
const LAYER_ORDER_INSIGHT = 1;
const LAYER_ORDER_POINTER = 2;
const LAYER_ORDER_SPINNING_POINTER = 3;

const downloadReport = (content: string): void => {
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'midscene_report.html';
  a.click();
};

class RecordingSession {
  canvas: HTMLCanvasElement;
  mediaRecorder: MediaRecorder | null = null;
  chunks: BlobPart[];
  recording = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.chunks = [];
  }

  start() {
    const stream = this.canvas.captureStream(60); // 60fps
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm',
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder = mediaRecorder;
    this.recording = true;
    return this.mediaRecorder.start();
  }

  stop() {
    if (!this.recording || !this.mediaRecorder) {
      console.warn('not recording');
      return;
    }

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'midscene_replay.webm';
      a.click();
      URL.revokeObjectURL(url);
    };
    this.mediaRecorder?.stop();
    this.recording = false;
    this.mediaRecorder = null;
  }
}

export function Player(props?: {
  replayScripts?: AnimationScript[];
  imageWidth?: number;
  imageHeight?: number;
  reportFileContent?: string | null;
  key?: string | number;
  fitMode?: 'width' | 'height'; // 'width': width adaptive, 'height': height adaptive, default to 'height'
  disableAutoZoom?: boolean; // disable auto zoom when playing, default to false
}) {
  const [titleText, setTitleText] = useState('');
  const [subTitleText, setSubTitleText] = useState('');
  const [disableAutoZoom, setDisableAutoZoom] = useState(
    props?.disableAutoZoom || false,
  );

  // Update state when prop changes
  useEffect(() => {
    if (props?.disableAutoZoom !== undefined) {
      setDisableAutoZoom(props.disableAutoZoom);
    }
  }, [props?.disableAutoZoom]);

  const scripts = props?.replayScripts;
  const imageWidth = props?.imageWidth || 1920;
  const imageHeight = props?.imageHeight || 1080;
  const fitMode = props?.fitMode || 'height'; // default to height adaptive
  const currentImg = useRef<string | null>(scripts?.[0]?.img || null);

  const divContainerRef = useRef<HTMLDivElement>(null);
  const app = useMemo<PIXI.Application>(() => new PIXI.Application(), []);

  const pointerSprite = useRef<PIXI.Sprite | null>(null);
  const spinningPointerSprite = useRef<PIXI.Sprite | null>(null);

  const [replayMark, setReplayMark] = useState(0);
  const triggerReplay = () => {
    setReplayMark(Date.now());
  };

  const windowContentContainer = useMemo(() => {
    const container = new PIXI.Container();
    return container;
  }, []);
  const insightMarkContainer = useMemo(() => {
    const container = new PIXI.Container();
    container.zIndex = LAYER_ORDER_INSIGHT;
    return container;
  }, []);

  const basicCameraState = {
    left: 0,
    top: 0,
    width: imageWidth,
    pointerLeft: Math.round(imageWidth / 2),
    pointerTop: Math.round(imageHeight / 2),
  };

  // -1: not started, 0: running, 1: finished
  const [animationProgress, setAnimationProgress] = useState(-1);
  const cancelFlag = useRef(false);

  useEffect(() => {
    cancelFlag.current = false;
    return () => {
      cancelFlag.current = true;
    };
  }, []);

  const cameraState = useRef<CameraState>({ ...basicCameraState });

  const repaintImage = async (): Promise<void> => {
    const imgToUpdate = currentImg.current;
    if (!imgToUpdate) {
      console.warn('no image to update');
      return;
    }
    if (!getTextureFromCache(imgToUpdate)) {
      console.warn('image not loaded', imgToUpdate);
      await loadTexture(imgToUpdate!);
    }
    const texture = getTextureFromCache(imgToUpdate);
    if (!texture) {
      throw new Error('texture not found');
    }
    const sprite = PIXI.Sprite.from(texture);
    if (!sprite) {
      throw new Error('sprite not found');
    }

    const mainImgLabel = 'main-img';
    const child = windowContentContainer.getChildByLabel(mainImgLabel);
    if (child) {
      windowContentContainer.removeChild(child);
    }
    sprite.label = mainImgLabel;
    sprite.zIndex = LAYER_ORDER_IMG;

    // use original size, keep image quality
    sprite.width = imageWidth;
    sprite.height = imageHeight;

    windowContentContainer.addChild(sprite);
  };

  const spinningPointer = (frame: FrameFn): (() => void) => {
    if (!spinningPointerSprite.current) {
      spinningPointerSprite.current = PIXI.Sprite.from(mouseLoading);
      spinningPointerSprite.current.zIndex = LAYER_ORDER_SPINNING_POINTER;
      spinningPointerSprite.current.anchor.set(0.5, 0.5);
      spinningPointerSprite.current.scale.set(0.5);
      spinningPointerSprite.current.label = 'spinning-pointer';
    }

    spinningPointerSprite.current.x = pointerSprite.current?.x || 0;
    spinningPointerSprite.current.y = pointerSprite.current?.y || 0;
    windowContentContainer.addChild(spinningPointerSprite.current);

    let startTime: number;
    let isCancelled = false;

    const animate = (currentTime: number) => {
      if (isCancelled) return;
      if (!startTime) startTime = currentTime;
      const elapsedTime = currentTime - startTime;

      // Non-linear timing function (ease-in-out)
      const progress = (Math.sin(elapsedTime / 500 - Math.PI / 2) + 1) / 2;

      const rotation = progress * Math.PI * 2;

      if (spinningPointerSprite.current) {
        spinningPointerSprite.current.rotation = rotation;
      }

      frame(animate);
    };

    frame(animate);

    const stopFn = () => {
      if (spinningPointerSprite.current) {
        windowContentContainer.removeChild(spinningPointerSprite.current);
      }
      isCancelled = true;
    };

    return stopFn;
  };

  const updatePointer = async (
    img: string,
    x?: number,
    y?: number,
  ): Promise<void> => {
    if (!getTextureFromCache(img)) {
      console.warn('image not loaded', img);
      await loadTexture(img);
    }
    const texture = getTextureFromCache(img);
    if (!texture) {
      throw new Error('texture not found');
    }
    const sprite = PIXI.Sprite.from(texture);

    let targetX = pointerSprite.current?.x;
    let targetY = pointerSprite.current?.y;
    if (typeof x === 'number') {
      targetX = x;
    }
    if (typeof y === 'number') {
      targetY = y;
    }
    if (typeof targetX === 'undefined' || typeof targetY === 'undefined') {
      console.warn('invalid pointer position', x, y);
      return;
    }

    if (pointerSprite.current) {
      const pointer = windowContentContainer.getChildByLabel('pointer');
      if (pointer) {
        windowContentContainer.removeChild(pointer);
      }
    }

    pointerSprite.current = sprite;
    pointerSprite.current.x = targetX;
    pointerSprite.current.y = targetY;
    pointerSprite.current.label = 'pointer';
    pointerSprite.current.zIndex = LAYER_ORDER_POINTER;
    windowContentContainer.addChild(pointerSprite.current);
  };

  const updateCamera = (state: CameraState): void => {
    cameraState.current = state;

    // If auto zoom is disabled, keep scale at 1 (no zoom)
    const newScale = disableAutoZoom
      ? 1
      : Math.max(1, imageWidth / state.width);
    windowContentContainer.scale.set(newScale);

    // If auto zoom is disabled, don't pan the camera
    windowContentContainer.x = disableAutoZoom
      ? canvasPaddingLeft
      : Math.round(canvasPaddingLeft - state.left * newScale);
    windowContentContainer.y = disableAutoZoom
      ? canvasPaddingTop
      : Math.round(canvasPaddingTop - state.top * newScale);

    const pointer = windowContentContainer.getChildByLabel('pointer');
    if (pointer) {
      pointer.scale.set(1 / newScale);

      if (
        typeof state.pointerLeft === 'number' &&
        typeof state.pointerTop === 'number'
      ) {
        pointer.x = state.pointerLeft;
        pointer.y = state.pointerTop;
      }
    }
  };

  const cameraAnimation = async (
    targetState: TargetCameraState,
    duration: number,
    frame: FrameFn,
  ): Promise<void> => {
    // If auto zoom is disabled, skip camera animation (only animate pointer)
    if (disableAutoZoom) {
      const currentState = { ...cameraState.current };
      const startPointerLeft = currentState.pointerLeft;
      const startPointerTop = currentState.pointerTop;
      const startTime = performance.now();

      const shouldMovePointer =
        typeof targetState.pointerLeft === 'number' &&
        typeof targetState.pointerTop === 'number' &&
        (targetState.pointerLeft !== startPointerLeft ||
          targetState.pointerTop !== startPointerTop);

      if (!shouldMovePointer) return;

      await new Promise<void>((resolve) => {
        const animate = (currentTime: number) => {
          const elapsedTime = currentTime - startTime;
          const rawProgress = Math.min(elapsedTime / duration, 1);
          const progress = cubicMouse(rawProgress);

          const nextState: CameraState = {
            ...currentState,
            pointerLeft:
              startPointerLeft +
              (targetState.pointerLeft! - startPointerLeft) * progress,
            pointerTop:
              startPointerTop +
              (targetState.pointerTop! - startPointerTop) * progress,
          };

          updateCamera(nextState);

          if (elapsedTime < duration) {
            frame(animate);
          } else {
            resolve();
          }
        };
        frame(animate);
      });
      return;
    }

    const currentState = { ...cameraState.current };
    const startLeft = currentState.left;
    const startTop = currentState.top;
    const startPointerLeft = currentState.pointerLeft;
    const startPointerTop = currentState.pointerTop;
    const startScale = currentState.width / imageWidth;

    const startTime = performance.now();
    const shouldMovePointer =
      typeof targetState.pointerLeft === 'number' &&
      typeof targetState.pointerTop === 'number' &&
      (targetState.pointerLeft !== startPointerLeft ||
        targetState.pointerTop !== startPointerTop);

    // move pointer first, then move camera
    const pointerMoveDuration = shouldMovePointer ? duration * 0.375 : 0;
    const cameraMoveStart = pointerMoveDuration;
    const cameraMoveDuration = duration - pointerMoveDuration;

    await new Promise<void>((resolve) => {
      const animate = (currentTime: number) => {
        const nextState: CameraState = { ...cameraState.current };
        const elapsedTime = currentTime - startTime;

        // Mouse movement animation
        if (shouldMovePointer) {
          if (elapsedTime <= pointerMoveDuration) {
            const rawMouseProgress = Math.min(
              elapsedTime / pointerMoveDuration,
              1,
            );
            const mouseProgress = cubicMouse(rawMouseProgress);
            nextState.pointerLeft =
              startPointerLeft +
              (targetState.pointerLeft! - startPointerLeft) * mouseProgress;
            nextState.pointerTop =
              startPointerTop +
              (targetState.pointerTop! - startPointerTop) * mouseProgress;
          } else {
            nextState.pointerLeft = targetState.pointerLeft!;
            nextState.pointerTop = targetState.pointerTop!;
          }
        }

        // Camera movement animation (starts 500ms after mouse movement begins)
        if (elapsedTime > cameraMoveStart) {
          const cameraElapsedTime = elapsedTime - cameraMoveStart;
          const rawCameraProgress = Math.min(
            cameraElapsedTime / cameraMoveDuration,
            1,
          );
          const cameraProgress = cubicImage(rawCameraProgress);

          // get the target scale
          const targetScale = targetState.width / imageWidth;
          const progressScale =
            startScale + (targetScale - startScale) * cameraProgress;
          const progressWidth = imageWidth * progressScale;
          const progressHeight = imageHeight * progressScale;
          nextState.width = progressWidth;

          const progressLeft =
            startLeft + (targetState.left - startLeft) * cameraProgress;
          const progressTop =
            startTop + (targetState.top - startTop) * cameraProgress;

          const horizontalExceed = progressLeft + progressWidth - imageWidth;
          const verticalExceed = progressTop + progressHeight - imageHeight;

          nextState.left =
            horizontalExceed > 0
              ? progressLeft + horizontalExceed
              : progressLeft;
          nextState.top =
            verticalExceed > 0 ? progressTop + verticalExceed : progressTop;
        }

        updateCamera(nextState);

        if (elapsedTime < duration) {
          frame(animate);
        } else {
          resolve();
        }
      };

      frame(animate);
    });
  };

  const fadeInGraphics = (
    graphics: PIXI.Container | PIXI.Graphics | PIXI.Text,
    duration: number,
    frame: FrameFn,
    targetAlpha = 1,
  ): Promise<void> => {
    return new Promise<void>((resolve) => {
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        graphics.alpha =
          targetAlpha === 0 ? 1 - linear(progress) : linear(progress);
        if (elapsedTime < duration) {
          frame(animate);
        } else {
          resolve();
        }
      };

      frame(animate);
    });
  };

  const fadeOutItem = async (
    graphics: PIXI.Container | PIXI.Graphics | PIXI.Text,
    duration: number,
    frame: FrameFn,
  ): Promise<void> => {
    return fadeInGraphics(graphics, duration, frame, 0);
  };

  const insightElementsAnimation = async (
    elements: BaseElement[],
    highlightElements: (BaseElement | LocateResultElement)[],
    searchArea: Rect | undefined,
    duration: number,
    frame: FrameFn,
  ): Promise<void> => {
    insightMarkContainer.removeChildren();

    const elementsToAdd = [...elements];
    const totalLength = elementsToAdd.length;
    let childrenCount = 0;

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsedTime = currentTime - startTime;
        const progress = cubicInsightElement(
          Math.min(elapsedTime / duration, 1),
        );

        const elementsToAddNow = Math.floor(progress * totalLength);

        while (childrenCount < elementsToAddNow) {
          const randomIndex = Math.floor(Math.random() * elementsToAdd.length);
          const element = elementsToAdd.splice(randomIndex, 1)[0];
          if (element) {
            const [insightMarkGraphic] = rectMarkForItem(
              element.rect,
              element.content,
              'element',
            );
            insightMarkGraphic.alpha = 0;
            insightMarkContainer.addChild(insightMarkGraphic);
            childrenCount++;
            fadeInGraphics(
              insightMarkGraphic,
              singleElementFadeInDuration,
              frame,
            );
          }
        }

        if (elapsedTime < duration) {
          frame(animate);
        } else {
          // Add all remaining items when time ends
          while (elementsToAdd.length > 0) {
            const randomIndex = Math.floor(
              Math.random() * elementsToAdd.length,
            );
            const element = elementsToAdd.splice(randomIndex, 1)[0];
            const [insightMarkGraphic] = rectMarkForItem(
              element.rect,
              element.content,
              'element',
            );
            insightMarkGraphic.alpha = 1; // Set alpha to 1 immediately for remaining items
            insightMarkContainer.addChild(insightMarkGraphic);
          }

          if (searchArea) {
            const [searchAreaGraphic] = rectMarkForItem(
              searchArea,
              'Search Area',
              'searchArea',
            );
            searchAreaGraphic.alpha = 1;
            insightMarkContainer.addChild(searchAreaGraphic);
          }

          highlightElements.map((element) => {
            const [insightMarkGraphic] = rectMarkForItem(
              element.rect,
              (element as BaseElement).content || '',
              'highlight',
            );
            insightMarkGraphic.alpha = 1;
            insightMarkContainer.addChild(insightMarkGraphic);
          });

          resolve();
        }
      };

      frame(animate);
    });
  };

  const init = async (): Promise<void> => {
    if (!divContainerRef.current || !scripts) return;

    // use original image size for initialization
    // this can keep the original image quality, then scale the canvas with CSS
    await app.init({
      width: imageWidth,
      height: imageHeight,
      background: 0xf4f4f4,
      autoDensity: true,
      antialias: true,
    });

    if (!divContainerRef.current) return;
    divContainerRef.current.appendChild(app.canvas);

    windowContentContainer.x = 0;
    windowContentContainer.y = 0;
    app.stage.addChild(windowContentContainer);

    insightMarkContainer.x = 0;
    insightMarkContainer.y = 0;
    windowContentContainer.addChild(insightMarkContainer);
  };

  const [isRecording, setIsRecording] = useState(false);
  const recorderSessionRef = useRef<RecordingSession | null>(null);

  const handleExport = () => {
    if (recorderSessionRef.current) {
      console.warn('recorderSession exists');
      return;
    }

    if (!app.canvas) {
      console.warn('canvas is not initialized');
      return;
    }

    recorderSessionRef.current = new RecordingSession(app.canvas);
    setIsRecording(true);
    triggerReplay();
  };

  const play = (): (() => void) => {
    let cancelFn: () => void;
    Promise.resolve(
      (async () => {
        if (!app) {
          throw new Error('app is not initialized');
        }
        if (!scripts) {
          throw new Error('scripts is required');
        }
        const { frame, cancel, timeout } = frameKit();
        cancelFn = cancel;
        const allImages: string[] = scripts
          .filter((item) => !!item.img)
          .map((item) => item.img!);

        // Load and display the image
        await Promise.all(
          [...allImages, mouseLoading, mousePointer].map(loadTexture),
        );

        // pointer on top
        insightMarkContainer.removeChildren();
        await updatePointer(mousePointer, imageWidth / 2, imageHeight / 2);
        await repaintImage();
        await updateCamera({ ...basicCameraState });
        const totalDuration = scripts.reduce((acc, item) => {
          return (
            acc +
            item.duration +
            (item.camera && item.insightCameraDuration
              ? item.insightCameraDuration
              : 0)
          );
        }, 0);
        // progress bar
        const progressUpdateInterval = 200;
        const startTime = performance.now();
        setAnimationProgress(0);
        const updateProgress = () => {
          const progress = Math.min(
            (performance.now() - startTime) / totalDuration,
            1,
          );
          setAnimationProgress(progress);
          if (progress < 1) {
            return timeout(updateProgress, progressUpdateInterval);
          }
        };
        frame(updateProgress);
        if (recorderSessionRef.current) {
          recorderSessionRef.current.start();
        }

        // play animation
        for (const index in scripts) {
          const item = scripts[index];
          setTitleText(item.title || '');
          setSubTitleText(item.subTitle || '');

          if (item.type === 'sleep') {
            await sleep(item.duration);
          } else if (item.type === 'insight') {
            if (!item.img) {
              throw new Error('img is required');
            }
            currentImg.current = item.img;
            await repaintImage();
            const elements = item.context?.tree
              ? treeToList(item.context.tree)
              : [];
            const highlightElements = item.highlightElement
              ? [item.highlightElement]
              : [];
            await insightElementsAnimation(
              elements,
              highlightElements,
              item.searchArea,
              item.duration,
              frame,
            );
            if (item.camera) {
              if (!item.insightCameraDuration) {
                throw new Error('insightCameraDuration is required');
              }
              await cameraAnimation(
                item.camera,
                item.insightCameraDuration,
                frame,
              );
            }
          } else if (item.type === 'clear-insight') {
            await fadeOutItem(insightMarkContainer, item.duration, frame);
            insightMarkContainer.removeChildren();
            insightMarkContainer.alpha = 1;
          } else if (item.type === 'img') {
            if (item.img && item.img !== currentImg.current) {
              currentImg.current = item.img!;
              await repaintImage();
            }
            if (item.camera) {
              await cameraAnimation(item.camera, item.duration, frame);
            } else {
              await sleep(item.duration);
            }
          } else if (item.type === 'pointer') {
            if (!item.img) {
              throw new Error('pointer img is required');
            }
            await updatePointer(item.img);
          } else if (item.type === 'spinning-pointer') {
            const stop = spinningPointer(frame);
            await sleep(item.duration);
            stop();
          }
        }

        if (recorderSessionRef.current) {
          recorderSessionRef.current.stop();
          recorderSessionRef.current = null;
          setIsRecording(false);
        }
      })().catch((e) => {
        console.error('player error', e);
      }),
    );
    // Cleanup function
    return () => {
      cancelFn?.();
    };
  };

  useEffect(() => {
    Promise.resolve(
      (async () => {
        await init();

        // dynamically set the aspect ratio and fit mode of the container
        if (divContainerRef.current && imageWidth && imageHeight) {
          const aspectRatio = imageWidth / imageHeight;
          divContainerRef.current.style.setProperty(
            '--canvas-aspect-ratio',
            aspectRatio.toString(),
          );

          // set adaptive mode for canvas container
          divContainerRef.current.setAttribute('data-fit-mode', fitMode);

          // set adaptive mode for player container (for background color switching)
          const playerContainer = divContainerRef.current.closest(
            '.player-container',
          ) as HTMLElement;
          if (playerContainer) {
            playerContainer.setAttribute('data-fit-mode', fitMode);
          }
        }

        triggerReplay();
      })(),
    );

    return () => {
      try {
        app.destroy(true, { children: true, texture: true });
      } catch (e) {
        console.warn('destroy failed', e);
      }
    };
  }, [imageWidth, imageHeight, fitMode]);

  useEffect(() => {
    if (replayMark) {
      return play();
    }
  }, [replayMark]);

  const [mouseOverStatusIcon, setMouseOverStatusIcon] = useState(false);
  const [mouseOverSettingsIcon, setMouseOverSettingsIcon] = useState(false);
  const progressString = Math.round(animationProgress * 100);
  const transitionStyle = animationProgress === 0 ? 'none' : '0.3s';

  // press space to replay
  const canReplayNow = animationProgress === 1;
  useEffect(() => {
    if (canReplayNow) {
      const listener = (event: KeyboardEvent) => {
        if (event.key === ' ') {
          triggerReplay();
        }
      };
      window.addEventListener('keydown', listener);
      return () => {
        window.removeEventListener('keydown', listener);
      };
    }
  }, [canReplayNow]);

  let statusIconElement;
  let statusOnClick: () => void = () => {};
  if (animationProgress < 1) {
    statusIconElement = (
      <Spin indicator={<LoadingOutlined spin color="#333" />} size="default" />
    );
  } else if (mouseOverStatusIcon) {
    statusIconElement = (
      <Spin indicator={<CaretRightOutlined color="#333" />} size="default" />
    );
    statusOnClick = () => triggerReplay();
  } else {
    statusIconElement = (
      // <Spin indicator={<CheckCircleOutlined />} size="default" />
      <Spin indicator={<CaretRightOutlined color="#333" />} size="default" />
    );
  }

  return (
    <div className="player-container">
      <div className="canvas-container" ref={divContainerRef} />
      <div className="player-timeline-wrapper">
        <div className="player-timeline">
          <div
            className="player-timeline-progress"
            style={{
              width: `${progressString}%`,
              transition: transitionStyle,
            }}
          />
        </div>
      </div>
      <div className="player-tools-wrapper">
        <div className="player-tools">
          <div className="player-control">
            <div className="status-text">
              <div className="title">{titleText}</div>
              <Tooltip title={subTitleText}>
                <div className="subtitle">{subTitleText}</div>
              </Tooltip>
            </div>
            {isRecording ? null : (
              <div
                className="status-icon"
                onMouseEnter={() => setMouseOverStatusIcon(true)}
                onMouseLeave={() => setMouseOverStatusIcon(false)}
                onClick={statusOnClick}
              >
                {statusIconElement}
              </div>
            )}

            {props?.reportFileContent ? (
              <Tooltip title="Download Report">
                <div
                  className="status-icon"
                  onMouseEnter={() => setMouseOverStatusIcon(true)}
                  onMouseLeave={() => setMouseOverStatusIcon(false)}
                  onClick={() => downloadReport(props.reportFileContent!)}
                >
                  <DownloadOutlined color="#333" />
                </div>
              </Tooltip>
            ) : null}
            <Tooltip title={isRecording ? 'Generating...' : 'Export Video'}>
              <div
                className="status-icon"
                onClick={isRecording ? undefined : handleExport}
                style={{
                  opacity: isRecording ? 0.5 : 1,
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                }}
              >
                {isRecording ? (
                  <Spin size="default" percent={progressString} />
                ) : (
                  <ExportOutlined />
                )}
              </div>
            </Tooltip>
            <Dropdown
              trigger={['hover']}
              placement="bottomRight"
              overlayStyle={{
                minWidth: '148px',
              }}
              dropdownRender={(menu) => (
                <div
                  style={{
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  {menu}
                </div>
              )}
              menu={{
                style: {
                  borderRadius: '8px',
                  padding: 0,
                },
                items: [
                  {
                    key: 'autoZoom',
                    style: {
                      height: '39px',
                      margin: 0,
                      padding: '0 12px',
                    },
                    label: (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          height: '39px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <GlobalPerspectiveIcon
                            style={{ width: '16px', height: '16px' }}
                          />
                          <span style={{ fontSize: '12px' }}>
                            Global Perspective
                          </span>
                          <Tooltip title="When enabled, the canvas will not follow the mouse zoom">
                            <QuestionCircleOutlined
                              style={{
                                fontSize: '12px',
                                color: '#999',
                                cursor: 'help',
                                marginRight: '16px',
                              }}
                            />
                          </Tooltip>
                        </div>
                        <Switch
                          size="small"
                          checked={disableAutoZoom}
                          onChange={(checked) => {
                            setDisableAutoZoom(checked);
                            triggerReplay();
                          }}
                          onClick={(_, e) => e?.stopPropagation?.()}
                        />
                      </div>
                    ),
                  },
                ],
              }}
            >
              <div
                className="status-icon"
                onMouseEnter={() => setMouseOverSettingsIcon(true)}
                onMouseLeave={() => setMouseOverSettingsIcon(false)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: mouseOverSettingsIcon ? 1 : 0.7,
                  transition: 'opacity 0.2s',
                }}
              >
                <SettingIcon style={{ width: '16px', height: '16px' }} />
              </div>
            </Dropdown>
          </div>
        </div>
      </div>
    </div>
  );
}
