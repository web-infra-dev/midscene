'use client';
import * as PIXI from 'pixi.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import './player.less';
import { mouseLoading, mousePointer } from '@/utils';
import type { BaseElement } from '@midscene/core/.';
import { rectMarkForItem } from './blackboard';
import type { CameraState, TargetCameraState } from './player-scripts';
import { useExecutionDump } from './store';

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
  return cubicBezier(t, 0, 0.69, 0.43, 1);
  // return linear(t); //, 0, 0.6, 0.6, 1);
};

const cubicInsightElement = (t: number): number => {
  // return cubicBezier(t, 0, 0.69, 0.43, 1);
  // using ease-in-out
  return cubicBezier(t, 0, 0.5, 0.5, 1);
};

const cubicMouse = (t: number): number => {
  return linear(t);
  // return cubicBezier(t, 0, 0.99, 0.03, 1);
  // return cubicBezier(t, 0, 0.99, 0.03, 1);
};

const linear = (t: number): number => {
  return t;
};

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const singleElementFadeInDuration = 80;
const LAYER_ORDER_IMG = 0;
const LAYER_ORDER_INSIGHT = 1;
const LAYER_ORDER_POINTER = 2;
const LAYER_ORDER_SPINNING_POINTER = 3;

const Player = (): JSX.Element => {
  const [titleText, setTitleText] = useState('');
  const [subTitleText, setSubTitleText] = useState('');
  const scripts = useExecutionDump((store) => store.activeExecutionAnimation);
  const imageWidth = useExecutionDump(
    (store) => store.activeExecutionScreenshotWidth,
  );
  const imageHeight = useExecutionDump(
    (store) => store.activeExecutionScreenshotHeight,
  );
  const canvasWidth = imageWidth + canvasPaddingLeft * 2;
  const canvasHeight = imageHeight + canvasPaddingTop * 2;
  const currentImg = useRef<string | null>(scripts?.[0]?.img || null);

  const divContainerRef = useRef<HTMLDivElement>(null);
  const app = useMemo<PIXI.Application>(() => new PIXI.Application(), []);
  const imgSpriteMap = useRef<Map<string, PIXI.Sprite>>(new Map());

  const pointerSprite = useRef<PIXI.Sprite | null>(null);
  const spinningPointerSprite = useRef<PIXI.Sprite | null>(null);

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
    pointer: {
      left: imageWidth / 2,
      top: imageHeight / 2,
    },
  };

  const cancelFlag = useRef(false);

  useEffect(() => {
    cancelFlag.current = false;
    return () => {
      cancelFlag.current = true;
    };
  }, []);

  const frame = (callback: (current: number) => void) => {
    requestAnimationFrame(() => {
      if (cancelFlag.current) {
        return;
      }
      callback(performance.now());
    });
  };

  const cameraState = useRef<CameraState>({ ...basicCameraState });

  const preloadImage = async (img: string): Promise<void> => {
    if (imgSpriteMap.current.has(img)) return;
    return PIXI.Assets.load(img).then((texture) => {
      const sprite = PIXI.Sprite.from(texture);
      imgSpriteMap.current.set(img, sprite);
    });
  };

  const repaintImage = async (): Promise<void> => {
    const imgToUpdate = currentImg.current;
    if (!imgToUpdate) {
      console.warn('no image to update');
      return;
    }
    if (!imgSpriteMap.current.has(imgToUpdate)) {
      console.warn('image not loaded', imgToUpdate);
      await preloadImage(imgToUpdate!);
    }
    const sprite = imgSpriteMap.current.get(imgToUpdate);
    if (!sprite) {
      throw new Error('sprite not found');
    }

    const child = windowContentContainer.getChildByLabel('main-img');
    if (child) {
      windowContentContainer.removeChild(child);
    }
    sprite.label = 'main-img';
    sprite.zIndex = LAYER_ORDER_IMG;
    windowContentContainer.addChild(sprite);
  };

  const spinningPointer = async (): Promise<() => void> => {
    // use center of the sprite to rotate
    // await updatePointer(mouseLoading);
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
    if (!imgSpriteMap.current.has(img)) {
      console.warn('image not loaded', img);
      await preloadImage(img);
    }
    const sprite = imgSpriteMap.current.get(img);
    if (!sprite) {
      throw new Error('sprite not found');
    }

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

    const newScale = Math.max(1, imageWidth / state.width);
    windowContentContainer.scale.set(newScale);
    windowContentContainer.x = Math.round(
      canvasPaddingLeft - state.left * newScale,
    );
    windowContentContainer.y = Math.round(
      canvasPaddingTop - state.top * newScale,
    );

    const pointer = windowContentContainer.getChildByLabel('pointer');
    if (pointer && state.pointer) {
      pointer.x = state.pointer.left; // * newScale;
      pointer.y = state.pointer.top; // * newScale;
      pointer.scale.set(1 / newScale);
    }
  };

  const cameraAnimation = async (
    targetState: TargetCameraState,
    duration: number,
  ): Promise<void> => {
    const currentState = { ...cameraState.current };
    const startLeft = currentState.left;
    const startTop = currentState.top;
    const startPointer = { ...currentState.pointer };
    const startScale = currentState.width / imageWidth;

    const startTime = performance.now();
    const shouldMovePointer =
      targetState.pointer &&
      (targetState.pointer.left !== startPointer.left ||
        targetState.pointer.top !== startPointer.top);

    // pointer move --> camera move
    const pointerMoveDuration = shouldMovePointer ? duration * 0.375 : 0;
    const cameraMoveStart = pointerMoveDuration;
    const cameraMoveDuration = duration - pointerMoveDuration;
    await new Promise<void>((resolve) => {
      const animate = (currentTime: number) => {
        const nextState: CameraState = { ...cameraState.current };
        const elapsedTime = currentTime - startTime;

        // Mouse movement animation
        if (shouldMovePointer && elapsedTime < pointerMoveDuration) {
          const rawMouseProgress = Math.min(
            elapsedTime / pointerMoveDuration,
            1,
          );
          const mouseProgress = cubicMouse(rawMouseProgress);
          nextState.pointer.left =
            startPointer.left +
            (targetState.pointer!.left - startPointer.left) * mouseProgress;
          nextState.pointer.top =
            startPointer.top +
            (targetState.pointer!.top - startPointer.top) * mouseProgress;
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
  ): Promise<void> => {
    return fadeInGraphics(graphics, duration, 0);
  };

  const insightElementsAnimation = async (
    elements: BaseElement[],
    highlightElements: BaseElement[],
    duration: number,
  ): Promise<void> => {
    insightMarkContainer.removeChildren();

    const elementsToAdd = [...elements];
    const totalLength = elementsToAdd.length;

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsedTime = currentTime - startTime;
        const progress = cubicInsightElement(
          Math.min(elapsedTime / duration, 1),
        );

        const elementsToAddNow = Math.floor(progress * totalLength);

        while (insightMarkContainer.children.length < elementsToAddNow) {
          const randomIndex = Math.floor(Math.random() * elementsToAdd.length);
          const element = elementsToAdd.splice(randomIndex, 1)[0];
          if (element) {
            const [insightMarkGraphic] = rectMarkForItem(
              element.rect,
              element.content,
              false,
            );
            insightMarkGraphic.alpha = 0;
            insightMarkContainer.addChild(insightMarkGraphic);

            fadeInGraphics(insightMarkGraphic, singleElementFadeInDuration);
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
              false,
            );
            insightMarkGraphic.alpha = 1; // Set alpha to 1 immediately for remaining items
            insightMarkContainer.addChild(insightMarkGraphic);
          }
          highlightElements.map((element) => {
            const [insightMarkGraphic] = rectMarkForItem(
              element.rect,
              element.content,
              true,
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

  useEffect(() => {
    let cancelFn: () => void;
    Promise.resolve(
      (async () => {
        if (!divContainerRef.current || !scripts || !app) return;

        await app.init({
          width: canvasWidth,
          height: canvasHeight,
          background: 0xf4f4f4,
        });
        divContainerRef.current.appendChild(app.canvas); // Ensure app.view is appended

        const allImages: string[] = scripts
          .filter((item) => !!item.img)
          .map((item) => item.img!);

        // Load and display the image
        await Promise.all([...allImages, mouseLoading].map(preloadImage));

        windowContentContainer.x = 0;
        windowContentContainer.y = 0;
        app.stage.addChild(windowContentContainer);

        insightMarkContainer.x = 0;
        insightMarkContainer.y = 0;
        windowContentContainer.addChild(insightMarkContainer);

        // pointer on top
        await updatePointer(mousePointer, imageWidth / 2, imageHeight / 2);
        // let lastImg: string = scripts[0].img!;
        await repaintImage();
        await updateCamera(cameraState.current);

        // play animation
        for (const item of scripts) {
          setTitleText(item.title || '');
          setSubTitleText(item.subTitle || '');
          if (item.type === 'sleep') {
            await sleep(item.duration);
          } else if (item.type === 'insight') {
            if (!item.insightDump || !item.img) {
              throw new Error('insight dump or img is required');
            }
            currentImg.current = item.img;
            await repaintImage();

            const elements = item.insightDump.context.content;
            const highlightElements = item.insightDump.matchedElement;
            await insightElementsAnimation(
              elements,
              highlightElements,
              item.duration,
            );
            if (item.camera) {
              await cameraAnimation(item.camera, item.duration);
            }
            // const insightMark = insightMarkForItem(item);
            // insightMarkContainer.addChild(insightMark);
          } else if (item.type === 'clear-insight') {
            await fadeOutItem(insightMarkContainer, item.duration);
            insightMarkContainer.removeChildren();
            insightMarkContainer.alpha = 1;
          } else if (item.type === 'img') {
            if (item.img && item.img !== currentImg.current) {
              currentImg.current = item.img!;
              await repaintImage();
            }
            if (item.camera) {
              await cameraAnimation(item.camera, item.duration);
            } else {
              await sleep(item.duration);
            }
          } else if (item.type === 'pointer') {
            if (!item.img) {
              throw new Error('pointer img is required');
            }
            await updatePointer(item.img);
          } else if (item.type === 'spinning-pointer') {
            const cancelFn = await spinningPointer();
            await sleep(item.duration);
            cancelFn();
          }
        }
      })(),
    );

    // Cleanup function
    return () => {
      try {
        cancelFn?.();
        app.destroy(true, { children: true, texture: true });
      } catch (e) {
        console.warn('destroy failed', e);
      }
    };
  }, []);

  const showControl = !!titleText;

  return (
    <div className="player-container">
      <div className="player-top-placeholder">&nbsp;</div>
      <div className="canvas-container" ref={divContainerRef} />
      <div className="player-controls" style={{ opacity: showControl ? 1 : 0 }}>
        <div className="title">{titleText}</div>
        <div className="subtitle">{subTitleText}</div>
      </div>
    </div>
  );
};

export default Player;
