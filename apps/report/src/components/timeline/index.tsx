import * as PIXI from 'pixi.js';
/* eslint-disable max-lines */
import { useEffect, useMemo, useRef } from 'react';

import './index.less';
import type { ExecutionTask } from '@midscene/core';
import { getTextureFromCache, loadTexture } from '../pixi-loader';
import { useAllCurrentTasks, useExecutionDump } from '../store';

interface TimelineItem {
  id: string;
  img: string;
  timeOffset: number;
  order?: number;
  overlapIndex?: number;
  overlapCount?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface HighlightParam {
  mouseX: number;
  mouseY: number;
  item: TimelineItem;
}

interface HighlightMask {
  startMs: number;
  endMs: number;
}

// Function to clone a sprite
function cloneSprite(sprite: PIXI.Sprite) {
  const clonedSprite = new PIXI.Sprite(sprite.texture);

  // Copy properties
  clonedSprite.position.copyFrom(sprite.position);
  clonedSprite.scale.copyFrom(sprite.scale);
  clonedSprite.rotation = sprite.rotation;
  clonedSprite.alpha = sprite.alpha;
  clonedSprite.visible = sprite.visible;

  return clonedSprite;
}

const TimelineWidget = (props: {
  screenshots: TimelineItem[];
  onHighlight?: (param: HighlightParam) => any;
  onUnhighlight?: () => any;
  onTap?: (param: TimelineItem) => any;
  highlightMask?: HighlightMask;
  hoverMask?: HighlightMask;
}): JSX.Element => {
  const domRef = useRef<HTMLDivElement>(null); // Should be HTMLDivElement not HTMLInputElement
  const app = useMemo<PIXI.Application>(() => new PIXI.Application(), []);

  const gridsContainer = useMemo(() => new PIXI.Container(), []);
  const screenshotsContainer = useMemo(() => new PIXI.Container(), []);
  const highlightMaskContainer = useMemo(() => new PIXI.Container(), []);
  const containerUpdaterRef = useRef(
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    (
      _s: number | undefined,
      _e: number | undefined,
      _hs: number | undefined,
      _he: number | undefined,
    ) => {},
  );
  const indicatorContainer = useMemo(() => new PIXI.Container(), []);

  const allScreenshots = props.screenshots || [];
  let maxTime = 500;

  if (allScreenshots.length >= 2) {
    maxTime = Math.max(
      allScreenshots[allScreenshots.length - 1].timeOffset,
      maxTime,
    );
  }

  const sizeRatio = 2;

  const titleBg = 0xffffff; // @title-bg
  const sideBg = 0xffffff;
  const gridTextColor = 0;
  const shotBorderColor = 0x777777;
  const gridLineColor = 0xe5e5e5; // @border-color
  const gridHighlightColor = 0xbfc4da; // @selected-bg
  const highlightMaskAlpha = 0.6;
  const timeContentFontSize = 20;
  const commonPadding = 12;
  const timeTextTop = commonPadding;
  const timeTitleBottom = timeTextTop * 2 + timeContentFontSize;
  const hoverMaskAlpha = 0.3;

  const closestScreenshotItemOnXY = (x: number, _y: number) => {
    // find out the screenshot that is closest to the mouse on the left
    let closestScreenshot: TimelineItem | undefined; // already sorted
    let closestIndex = -1;
    for (let i = 0; i < allScreenshots.length; i++) {
      const shot = allScreenshots[i];
      if (shot.x! <= x) {
        closestScreenshot = allScreenshots[i];
        closestIndex = i;
      } else {
        break;
      }
    }
    return {
      closestScreenshot,
      closestIndex,
    };
  };

  useMemo(() => {
    const { startMs, endMs } = props.highlightMask || {};
    const { startMs: hoverStartMs, endMs: hoverEndMs } = props.hoverMask || {};
    const fn = containerUpdaterRef.current;
    fn(startMs, endMs, hoverStartMs, hoverEndMs);
  }, [
    props.highlightMask?.startMs,
    props.highlightMask?.endMs,
    props.hoverMask?.startMs,
    props.hoverMask?.endMs,
  ]);

  useEffect(() => {
    let freeFn = () => {};
    Promise.resolve(
      (async () => {
        if (!domRef.current) {
          return;
        }

        // width of domRef
        const { clientWidth, clientHeight } = domRef.current;
        const canvasWidth = clientWidth * sizeRatio;
        const canvasHeight = clientHeight * sizeRatio;

        let singleGridWidth = 100 * sizeRatio;
        let gridCount = Math.floor(canvasWidth / singleGridWidth);
        const stepCandidate = [
          50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 6000, 8000, 9000,
          10000, 20000, 30000, 40000, 60000, 90000, 12000, 300000,
        ];
        let timeStep = stepCandidate[0];
        for (let i = stepCandidate.length - 1; i >= 0; i--) {
          if (gridCount * stepCandidate[i] >= maxTime) {
            timeStep = stepCandidate[i];
          }
        }
        const gridRatio = maxTime / (gridCount * timeStep);
        if (gridRatio <= 0.8) {
          singleGridWidth = Math.floor(singleGridWidth * (1 / gridRatio) * 0.9);
          gridCount = Math.floor(canvasWidth / singleGridWidth);
        }

        const leftForTimeOffset = (timeOffset: number) => {
          return Math.floor((singleGridWidth * timeOffset) / timeStep);
        };
        const timeOffsetForLeft = (left: number) => {
          return Math.floor((left * timeStep) / singleGridWidth);
        };

        await app.init({
          width: canvasWidth,
          height: canvasHeight,
          backgroundColor: sideBg,
        });
        freeFn = () => {
          app.destroy();
        };
        if (!domRef.current) {
          app.destroy();
          return;
        }
        domRef.current.replaceChildren(app.canvas);

        const pixiTextForNumber = (num: number) => {
          const textContent = `${num}ms`;
          const text = new PIXI.Text(`${textContent}`, {
            fontSize: timeContentFontSize,
            fill: gridTextColor,
          });
          return text;
        };

        // drawing vertical grids, texts, title bg
        gridsContainer.removeChildren();
        const titleBgSection = new PIXI.Graphics();
        titleBgSection.beginFill(titleBg);
        titleBgSection.drawRect(0, 0, canvasWidth, timeTitleBottom);
        titleBgSection.endFill();
        gridsContainer.addChild(titleBgSection);
        const titleBottomBorder = new PIXI.Graphics();
        titleBottomBorder.beginFill(gridLineColor);
        titleBottomBorder.drawRect(0, timeTitleBottom, canvasWidth, sizeRatio);
        titleBottomBorder.endFill();
        gridsContainer.addChild(titleBottomBorder);

        const gridHeight = canvasHeight;
        for (let i = 1; i <= gridCount; i++) {
          const gridLine = new PIXI.Graphics();
          const gridLineLeft = leftForTimeOffset(i * timeStep);
          gridLine.beginFill(gridLineColor);
          gridLine.drawRect(gridLineLeft, 0, sizeRatio, gridHeight);
          gridLine.endFill();
          gridsContainer.addChild(gridLine);

          // mark text at the left of each line
          const text = pixiTextForNumber(i * timeStep); // `${i * timeStep}ms`;
          // measure text width
          const textLeft = gridLineLeft - text.width - commonPadding;

          text.x = textLeft;
          text.y = timeTextTop;

          gridsContainer.addChild(text);
        }
        app.stage.addChild(gridsContainer);

        if (!allScreenshots.length) {
          console.warn('No screenshots found');
          return;
        }

        const shotContainers: PIXI.Container[] = [];

        // draw all screenshots
        screenshotsContainer.removeChildren();
        const screenshotTop = timeTitleBottom + commonPadding * 1.5;
        const screenshotMaxHeight =
          canvasHeight - screenshotTop - commonPadding * 1.5;
        allScreenshots.forEach((screenshot, index) => {
          const container = new PIXI.Container();
          shotContainers.push(container);
          app.stage.addChild(container);
          Promise.resolve(
            (async () => {
              await loadTexture(screenshot.img);
              const texture = getTextureFromCache(screenshot.img);
              if (!texture) {
                return;
              }

              // clone the sprite
              const screenshotSprite = PIXI.Sprite.from(texture);

              // get width / height of img
              const originalWidth = screenshotSprite.width;
              const originalHeight = screenshotSprite.height;

              const screenshotHeight = screenshotMaxHeight;
              const screenshotWidth = Math.floor(
                (screenshotHeight / originalHeight) * originalWidth,
              );

              const baseX = leftForTimeOffset(screenshot.timeOffset);
              let overlapX = baseX;

              if ((screenshot.overlapCount ?? 1) > 1) {
                const overlapCount = screenshot.overlapCount ?? 1;
                const overlapIndex = screenshot.overlapIndex ?? 0;
                const centeredIndex = overlapIndex - (overlapCount - 1) / 2;
                const overlapGap = Math.min(
                  Math.max(Math.floor(screenshotWidth * 0.25), 10 * sizeRatio),
                  Math.max(screenshotWidth, 30 * sizeRatio),
                );
                overlapX = baseX + centeredIndex * overlapGap;
              }

              allScreenshots[index].x = overlapX;
              allScreenshots[index].y = screenshotTop;
              allScreenshots[index].width = screenshotWidth;
              allScreenshots[index].height = screenshotMaxHeight;

              const border = new PIXI.Graphics();
              border.lineStyle(sizeRatio, shotBorderColor, 1);
              border.drawRect(
                overlapX,
                screenshotTop,
                screenshotWidth,
                screenshotMaxHeight,
              );
              border.endFill();
              container.addChild(border);

              screenshotSprite.x = overlapX;
              screenshotSprite.y = screenshotTop;
              screenshotSprite.width = screenshotWidth;
              screenshotSprite.height = screenshotMaxHeight;
              container.addChild(screenshotSprite);
            })(),
          );
        });

        const highlightMaskUpdater = (
          start: number | undefined,
          end: number | undefined,
          hoverStart: number | undefined,
          hoverEnd: number | undefined,
        ) => {
          highlightMaskContainer.removeChildren();

          const mask = (
            start: number | undefined,
            end: number | undefined,
            alpha: number,
          ) => {
            if (
              typeof start === 'undefined' ||
              typeof end === 'undefined' ||
              end === 0
            ) {
              return;
            }
            const leftBorder = new PIXI.Graphics();
            leftBorder.beginFill(gridHighlightColor, 1);
            leftBorder.drawRect(
              leftForTimeOffset(start),
              0,
              sizeRatio,
              canvasHeight,
            );
            leftBorder.endFill();
            highlightMaskContainer.addChild(leftBorder);

            const rightBorder = new PIXI.Graphics();
            rightBorder.beginFill(gridHighlightColor, 1);
            rightBorder.drawRect(
              leftForTimeOffset(end),
              0,
              sizeRatio,
              canvasHeight,
            );
            rightBorder.endFill();
            highlightMaskContainer.addChild(rightBorder);

            const mask = new PIXI.Graphics();
            mask.beginFill(gridHighlightColor, alpha);
            mask.drawRect(
              leftForTimeOffset(start),
              0,
              leftForTimeOffset(end) - leftForTimeOffset(start),
              canvasHeight,
            );
            mask.endFill();
            highlightMaskContainer.addChild(mask);
          };

          mask(start, end, highlightMaskAlpha);
          mask(hoverStart, hoverEnd, hoverMaskAlpha);
        };
        highlightMaskUpdater(
          props.highlightMask?.startMs,
          props.highlightMask?.endMs,
          0,
          0,
        );
        containerUpdaterRef.current = highlightMaskUpdater;

        // keep tracking the position of the mouse moving above the canvas
        app.stage.interactive = true;
        const onPointerMove = (event: PointerEvent) => {
          const x = event.offsetX * sizeRatio;
          const y = event.offsetY * sizeRatio;
          indicatorContainer.removeChildren();

          // find out the screenshot that is closest to the mouse on the left
          const { closestScreenshot, closestIndex } = closestScreenshotItemOnXY(
            x,
            y,
          );
          if (closestIndex < 0) {
            props.onUnhighlight?.();
            return;
          }
          const closestContainer = shotContainers[closestIndex];

          // highlight the items in closestContainer
          closestContainer.children.forEach((child) => {
            if (child instanceof PIXI.Sprite) {
              // border
              const newSpirit = new PIXI.Graphics();
              newSpirit.lineStyle(2, gridHighlightColor, 1);
              newSpirit.drawRect(
                x, // follow mouse
                closestScreenshot?.y!,
                closestScreenshot?.width!,
                closestScreenshot?.height!,
              );
              newSpirit.endFill();
              indicatorContainer.addChild(newSpirit);

              const screenshotSpirit = cloneSprite(child);
              screenshotSpirit.x = x;
              indicatorContainer.addChild(screenshotSpirit);
            }
          });

          // cursor line
          const indicator = new PIXI.Graphics();
          indicator.beginFill(gridHighlightColor, 1);
          indicator.drawRect(x - 1, 0, 3, canvasHeight);
          indicator.endFill();
          indicatorContainer.addChild(indicator);

          // time string
          const timeToDisplay =
            closestScreenshot?.timeOffset ?? timeOffsetForLeft(x);
          const text = pixiTextForNumber(timeToDisplay);
          text.x = x + 5;
          text.y = timeTextTop;
          const textBg = new PIXI.Graphics();
          textBg.beginFill(titleBg, 1);
          textBg.drawRect(text.x, text.y, text.width + 10, text.height);
          textBg.endFill();

          indicatorContainer.addChild(textBg);
          indicatorContainer.addChild(text);

          props.onHighlight?.({
            mouseX: x / sizeRatio,
            mouseY: y / sizeRatio,
            item: closestScreenshot!,
          });
        };
        // app.stage.on('pointermove', onPointerMove);
        // on pointer move out
        const onPointerOut = () => {
          indicatorContainer.removeChildren();
          props.onUnhighlight?.();
        };

        const onPointerTap = (event: PointerEvent) => {
          const x = event.offsetX * sizeRatio;
          const y = event.offsetY * sizeRatio;
          const { closestScreenshot } = closestScreenshotItemOnXY(x, y);
          if (closestScreenshot) {
            props.onTap?.(closestScreenshot);
          }
        };

        app.stage.addChild(screenshotsContainer);
        app.stage.addChild(highlightMaskContainer);
        app.stage.addChild(indicatorContainer);

        const canvas = app.view;
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerout', onPointerOut);
        canvas.addEventListener('pointerdown', onPointerTap);
      })(),
    );

    return () => {
      freeFn();
    };
  }, []);

  return <div className="timeline-canvas-wrapper" ref={domRef} />;
};

const Timeline = () => {
  const allTasks = useAllCurrentTasks();
  const wrapper = useRef<HTMLDivElement>(null);
  const setActiveTask = useExecutionDump((store) => store.setActiveTask);
  const activeTask = useExecutionDump((store) => store.activeTask);
  const hoverTask = useExecutionDump((store) => store.hoverTask);
  const setHoverTask = useExecutionDump((store) => store.setHoverTask);
  const setHoverPreviewConfig = useExecutionDump(
    (store) => store.setHoverPreviewConfig,
  );

  // should be first task time ?
  let startingTime = -1;
  let idCount = 1;
  const idTaskMap: Record<string, ExecutionTask> = {};
  type RecorderEntry = {
    id: string;
    img: string;
    ts: number;
    order: number;
    overlapIndex: number;
    overlapCount: number;
  };

  const recorderEntries = allTasks.reduce<RecorderEntry[]>((acc, current) => {
    const recorders = current.recorder || [];
    recorders.forEach((item) => {
      if (startingTime === -1 || startingTime > item.ts) {
        startingTime = item.ts;
      }
    });
    if (
      current.timing?.start &&
      (startingTime === -1 || startingTime > current.timing.start)
    ) {
      startingTime = current.timing.start;
    }

    recorders.forEach((item) => {
      const imageCandidates = [
        item.screenshot,
        ...(item.screenshots ?? []),
      ].filter((img): img is string => Boolean(img));
      if (!imageCandidates.length) {
        return;
      }
      const uniqueImages = Array.from(new Set(imageCandidates));
      const overlapCount = uniqueImages.length;
      uniqueImages.forEach((img, idx) => {
        const idStr = `id_${idCount++}`;
        idTaskMap[idStr] = current;
        acc.push({
          id: idStr,
          img,
          ts: item.ts,
          order: idx,
          overlapIndex: idx,
          overlapCount,
        });
      });
    });

    return acc;
  }, []);

  if (startingTime === -1 && recorderEntries.length) {
    startingTime = recorderEntries[0]!.ts;
  }

  if (startingTime === -1) {
    startingTime = 0;
  }

  const allScreenshots: TimelineItem[] = recorderEntries
    .map((entry) => ({
      id: entry.id,
      img: entry.img,
      timeOffset: entry.ts - startingTime,
      order: entry.order,
      overlapIndex: entry.overlapIndex,
      overlapCount: entry.overlapCount,
    }))
    .sort((a, b) => {
      if (a.timeOffset === b.timeOffset) {
        return (a.order ?? 0) - (b.order ?? 0);
      }
      return a.timeOffset - b.timeOffset;
    });

  const itemOnTap = (item: TimelineItem) => {
    const task = idTaskMap[item.id];
    if (task) {
      setActiveTask(task);
    }
  };

  const onHighlightItem = (param: HighlightParam) => {
    const { mouseX, item } = param;
    const refBounding = wrapper.current?.getBoundingClientRect();
    const task = idTaskMap[item.id];
    if (task) {
      setHoverTask(task, item.timeOffset + startingTime);
      setHoverPreviewConfig({
        x: mouseX + (refBounding?.left || 0),
        y: (refBounding?.bottom || 1) - 1,
      });
    } else {
      setHoverTask(null);
      setHoverPreviewConfig(null);
    }
  };

  const unhighlight = () => {
    setHoverTask(null);
    setHoverPreviewConfig(null);
  };

  const maskConfigForTask = (
    task?: ExecutionTask | null,
  ): HighlightMask | undefined => {
    if (!task) {
      return undefined;
    }
    return task.timing?.start && task.timing?.end
      ? {
          startMs: task.timing.start - startingTime || 0,
          endMs: task.timing.end - startingTime || 0,
        }
      : undefined;
  };

  const highlightMaskConfig = maskConfigForTask(activeTask);
  const hoverMaskConfig = maskConfigForTask(hoverTask);

  const itemIdList = allScreenshots.map((item) => item.id).join(',');
  return (
    <div className="timeline-wrapper" ref={wrapper}>
      <TimelineWidget
        key={itemIdList}
        screenshots={allScreenshots}
        onTap={itemOnTap}
        onHighlight={onHighlightItem}
        onUnhighlight={unhighlight}
        highlightMask={highlightMaskConfig}
        hoverMask={hoverMaskConfig}
      />
    </div>
  );
};
export default Timeline;
