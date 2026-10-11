import { useEffect, useMemo, useRef, useState } from 'react';

import './index.less';
import type { ExecutionTask } from '@midscene/core';
import { useTheme } from '@midscene/visualizer';
import { useAllCurrentTasks, useExecutionDump } from '../store';
import { buildTimelineScreenshots } from './build-timeline-screenshots';
import { timelineImageStore } from './timeline-image-store';
import {
  type TimelineThumbnail,
  prepareTimelineImageGroups,
  selectTimelineImageGroups,
} from './timeline-images';
import { TimelinePreparing } from './timeline-preparing';
import {
  DEFAULT_TIMELINE_MAX_TIME_MS,
  createTimelineScale,
  formatTimelineTime,
} from './timeline-scale';
import { useTimelineViewport } from './use-timeline-viewport';

interface TimelineItem {
  id: string;
  img: string;
  timeOffset: number;
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

function hexToCSS(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

const TimelineWidget = (props: {
  screenshots: TimelineItem[];
  onHighlight?: (param: HighlightParam) => any;
  onUnhighlight?: () => any;
  onTap?: (param: TimelineItem) => any;
  highlightMask?: HighlightMask;
  hoverMask?: HighlightMask;
}): JSX.Element => {
  const domRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<{
    imgCache: Map<string, TimelineThumbnail>;
    failedImages: Map<string, unknown>;
    screenshots: TimelineItem[] | null;
    hoverX: number | null;
    highlightMask?: HighlightMask;
    hoverMask?: HighlightMask;
  }>({
    imgCache: new Map(),
    failedImages: new Map(),
    screenshots: null,
    hoverX: null,
    highlightMask: props.highlightMask,
    hoverMask: props.hoverMask,
  });

  const { isDarkMode } = useTheme();

  const allScreenshots = props.screenshots;
  const { visible, width: viewportWidth } = useTimelineViewport(
    domRef,
    allScreenshots.length > 0,
  );
  const [preparingScreenshots, setPreparingScreenshots] = useState<
    TimelineItem[] | null
  >(allScreenshots);
  let maxTime = DEFAULT_TIMELINE_MAX_TIME_MS;
  if (allScreenshots.length >= 2) {
    maxTime = Math.max(
      allScreenshots[allScreenshots.length - 1].timeOffset,
      maxTime,
    );
  }

  const sizeRatio = 2;
  const BASE_HEIGHT = 110;

  const titleBg = isDarkMode ? 0x1f1f1f : 0xffffff;
  const sideBg = isDarkMode ? 0x1f1f1f : 0xffffff;
  const gridTextColor = isDarkMode ? 0xd9d9d9 : 0x000000;
  const shotBorderColor = isDarkMode ? 0x595959 : 0x777777;
  const gridLineColor = isDarkMode ? 0x3d3d3d : 0xe5e5e5;
  const gridHighlightColor = isDarkMode ? 0x4d4d6d : 0xbfc4da;
  const highlightMaskAlpha = 0.6;
  // Canvas backing pixels are scaled down to CSS pixels when displayed.
  const timeContentFontSize = 12 * sizeRatio;
  const commonPadding = 12;
  const timeTextTop = commonPadding;
  const timeTitleBottom = timeTextTop * 2 + timeContentFontSize;
  const hoverMaskAlpha = 0.3;

  const closestScreenshotItemOnXY = (x: number) => {
    let closestScreenshot: TimelineItem | undefined;
    let closestIndex = -1;
    for (let i = 0; i < allScreenshots.length; i++) {
      if (allScreenshots[i].x! <= x) {
        closestScreenshot = allScreenshots[i];
        closestIndex = i;
      } else {
        break;
      }
    }
    return { closestScreenshot, closestIndex };
  };

  // Update masks and trigger redraw
  useEffect(() => {
    stateRef.current.highlightMask = props.highlightMask;
    stateRef.current.hoverMask = props.hoverMask;
    redraw();
  }, [
    props.highlightMask?.startMs,
    props.highlightMask?.endMs,
    props.hoverMask?.startMs,
    props.hoverMask?.endMs,
  ]);

  // Shared redraw ref so event handlers can call it
  const redrawRef = useRef<() => void>(() => {});
  const redraw = () => redrawRef.current();

  useEffect(() => {
    if (!domRef.current) return;

    const { clientWidth } = domRef.current;
    const canvasWidth = clientWidth * sizeRatio;
    const canvasHeight = BASE_HEIGHT * sizeRatio;
    const { timeStep, visibleMaxTime, leftForTimeOffset, timeOffsetForLeft } =
      createTimelineScale({
        canvasWidth,
        maxTime,
        sizeRatio,
      });

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvasRef.current = canvas;
    domRef.current.replaceChildren(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to create the timeline canvas');

    const screenshotTop = timeTitleBottom + commonPadding * 1.5;
    const screenshotMaxHeight =
      canvasHeight - screenshotTop - commonPadding * 1.5;

    const { imgCache, failedImages } = stateRef.current;
    if (!visible || stateRef.current.screenshots !== allScreenshots) {
      imgCache.clear();
      failedImages.clear();
      stateRef.current.screenshots = allScreenshots;
      stateRef.current.hoverX = null;
    }
    const controller = new AbortController();
    const { signal } = controller;

    // Pre-compute x/y positions
    for (let i = 0; i < allScreenshots.length; i++) {
      allScreenshots[i].x = leftForTimeOffset(allScreenshots[i].timeOffset);
      allScreenshots[i].y = screenshotTop;
    }

    const applyLayout = () => {
      for (const shot of allScreenshots) {
        const thumbnail = imgCache.get(shot.img);
        shot.width = thumbnail?.width ?? screenshotMaxHeight;
        shot.height = thumbnail?.height ?? screenshotMaxHeight;
      }
    };
    applyLayout();

    const groups = selectTimelineImageGroups(
      allScreenshots.map((shot) => ({ img: shot.img, x: shot.x! })),
      20 * sizeRatio,
    );
    const isPrepared = (url: string) =>
      imgCache.has(url) || failedImages.has(url);
    let initialReady = groups.initial.every(isPrepared);
    setPreparingScreenshots(initialReady ? null : allScreenshots);

    // ── Draw function ──
    const drawAll = () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Background
      ctx.fillStyle = hexToCSS(sideBg);
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Title bar background
      ctx.fillStyle = hexToCSS(titleBg);
      ctx.fillRect(0, 0, canvasWidth, timeTitleBottom);

      // Title bottom border
      ctx.fillStyle = hexToCSS(gridLineColor);
      ctx.fillRect(0, timeTitleBottom, canvasWidth, sizeRatio);

      // Grid lines + time labels
      ctx.font = `${timeContentFontSize}px sans-serif`;
      for (let tickMs = timeStep; tickMs < visibleMaxTime; tickMs += timeStep) {
        const x = leftForTimeOffset(tickMs);
        ctx.fillStyle = hexToCSS(gridLineColor);
        ctx.fillRect(x, 0, sizeRatio, canvasHeight);

        const label = formatTimelineTime(tickMs);
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = hexToCSS(gridTextColor);
        ctx.fillText(
          label,
          x - tw - commonPadding,
          timeTextTop + timeContentFontSize,
        );
      }

      // Screenshots
      for (const shot of allScreenshots) {
        if (!initialReady || shot.x == null || shot.width == null) continue;
        const thumbnail = imgCache.get(shot.img);
        if (thumbnail) {
          ctx.drawImage(
            thumbnail.canvas,
            shot.x,
            screenshotTop,
            shot.width,
            screenshotMaxHeight,
          );
        } else if (failedImages.has(shot.img)) {
          ctx.fillStyle = hexToCSS(sideBg);
          ctx.fillRect(shot.x, screenshotTop, shot.width, screenshotMaxHeight);
          ctx.fillStyle = hexToCSS(gridTextColor);
          ctx.fillText('Unavailable', shot.x + 4, screenshotTop + 24);
        } else {
          continue;
        }
        ctx.strokeStyle = hexToCSS(shotBorderColor);
        ctx.lineWidth = sizeRatio;
        ctx.strokeRect(shot.x, screenshotTop, shot.width, screenshotMaxHeight);
      }

      // Highlight masks
      const drawMask = (
        start: number | undefined,
        end: number | undefined,
        alpha: number,
      ) => {
        if (start == null || end == null || end === 0) return;
        const x1 = leftForTimeOffset(start);
        const x2 = leftForTimeOffset(end);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = hexToCSS(gridHighlightColor);
        ctx.fillRect(x1, 0, x2 - x1, canvasHeight);
        ctx.globalAlpha = 1;
        ctx.fillRect(x1, 0, sizeRatio, canvasHeight);
        ctx.fillRect(x2, 0, sizeRatio, canvasHeight);
      };

      const { highlightMask, hoverMask } = stateRef.current;
      drawMask(
        highlightMask?.startMs,
        highlightMask?.endMs,
        highlightMaskAlpha,
      );
      drawMask(hoverMask?.startMs, hoverMask?.endMs, hoverMaskAlpha);

      // Hover indicator
      const hoverX = stateRef.current.hoverX;
      if (hoverX != null) {
        const { closestScreenshot } = closestScreenshotItemOnXY(hoverX);

        // Cursor line
        ctx.fillStyle = hexToCSS(gridHighlightColor);
        ctx.fillRect(hoverX - 1, 0, 3, canvasHeight);

        // Hover screenshot clone
        if (closestScreenshot) {
          const thumbnail = initialReady
            ? imgCache.get(closestScreenshot.img)
            : undefined;
          if (
            thumbnail &&
            closestScreenshot.width &&
            closestScreenshot.height
          ) {
            ctx.drawImage(
              thumbnail.canvas,
              hoverX,
              closestScreenshot.y!,
              closestScreenshot.width,
              closestScreenshot.height,
            );
            ctx.strokeStyle = hexToCSS(gridHighlightColor);
            ctx.lineWidth = 2;
            ctx.strokeRect(
              hoverX,
              closestScreenshot.y!,
              closestScreenshot.width,
              closestScreenshot.height,
            );
          }
        }

        // Time label at cursor
        const label = formatTimelineTime(timeOffsetForLeft(hoverX));
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = hexToCSS(titleBg);
        ctx.fillRect(hoverX + 5, timeTextTop, tw + 10, timeContentFontSize + 4);
        ctx.fillStyle = hexToCSS(gridTextColor);
        ctx.fillText(label, hoverX + 5, timeTextTop + timeContentFontSize);
      }
    };

    redrawRef.current = drawAll;

    // Event handlers
    const onPointerMove = (e: PointerEvent) => {
      const x = e.offsetX * sizeRatio;
      const y = e.offsetY * sizeRatio;
      stateRef.current.hoverX = x;
      drawAll();

      const { closestScreenshot } = closestScreenshotItemOnXY(x);
      if (closestScreenshot) {
        props.onHighlight?.({
          mouseX: x / sizeRatio,
          mouseY: y / sizeRatio,
          item: closestScreenshot,
        });
      } else {
        props.onUnhighlight?.();
      }
    };

    const onPointerOut = () => {
      stateRef.current.hoverX = null;
      drawAll();
      props.onUnhighlight?.();
    };

    const onPointerDown = (e: PointerEvent) => {
      const x = e.offsetX * sizeRatio;
      const { closestScreenshot } = closestScreenshotItemOnXY(x);
      if (closestScreenshot) {
        props.onTap?.(closestScreenshot);
      }
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerout', onPointerOut);
    canvas.addEventListener('pointerdown', onPointerDown);

    // Initial draw + load images
    drawAll();
    if (visible)
      void prepareTimelineImageGroups(
        groups,
        (url) => timelineImageStore.load(url, screenshotMaxHeight, signal),
        signal,
        ({ images, failures, complete }) => {
          for (const [url, thumbnail] of images) imgCache.set(url, thumbnail);
          for (const [url, error] of failures) failedImages.set(url, error);
          if (complete && failures.size)
            console.error('Failed to prepare timeline screenshots', [
              ...failures.values(),
            ]);
          applyLayout();
          initialReady = true;
          setPreparingScreenshots(null);
          drawAll();
        },
      ).catch((error) => {
        if (!signal.aborted) console.error('Failed to prepare timeline', error);
      });

    return () => {
      controller.abort();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerout', onPointerOut);
      canvas.removeEventListener('pointerdown', onPointerDown);
      redrawRef.current = () => {};
    };
  }, [
    isDarkMode,
    titleBg,
    sideBg,
    gridTextColor,
    shotBorderColor,
    gridLineColor,
    gridHighlightColor,
    allScreenshots,
    visible,
    viewportWidth,
  ]);

  return (
    <div className="timeline-widget">
      <div className="timeline-canvas-wrapper" ref={domRef} />
      {preparingScreenshots === allScreenshots && allScreenshots.length > 0 ? (
        <div className="timeline-preparing-wrapper">
          <TimelinePreparing />
        </div>
      ) : null}
    </div>
  );
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

  const { allScreenshots, idTaskMap, startingTime } = useMemo(
    () => buildTimelineScreenshots(allTasks),
    [allTasks],
  );

  const itemOnTap = (item: TimelineItem) => {
    const task = idTaskMap[item.id];
    if (task) setActiveTask(task);
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
    if (!task) return undefined;
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
