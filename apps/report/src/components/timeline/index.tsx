import { useEffect, useRef } from 'react';

import './index.less';
import type { ExecutionRecorderItem, ExecutionTask } from '@midscene/core';
import { useTheme } from '@midscene/visualizer';
import { useAllCurrentTasks, useExecutionDump } from '../store';

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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
    imgCache: Map<string, HTMLImageElement>;
    hoverX: number | null;
    highlightMask?: HighlightMask;
    hoverMask?: HighlightMask;
  }>({
    imgCache: new Map(),
    hoverX: null,
    highlightMask: props.highlightMask,
    hoverMask: props.hoverMask,
  });

  const { isDarkMode } = useTheme();

  const allScreenshots = props.screenshots || [];
  let maxTime = 500;
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
  const timeContentFontSize = 20;
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

    // Grid calculations
    let singleGridWidth = 100 * sizeRatio;
    let gridCount = Math.floor(canvasWidth / singleGridWidth);
    const stepCandidate = [
      50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 6000, 8000, 9000, 10000,
      20000, 30000, 40000, 60000, 90000, 12000, 300000,
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

    const leftForTimeOffset = (t: number) =>
      Math.floor((singleGridWidth * t) / timeStep);
    const timeOffsetForLeft = (l: number) =>
      Math.floor((l * timeStep) / singleGridWidth);

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvasRef.current = canvas;
    domRef.current.replaceChildren(canvas);
    const ctx = canvas.getContext('2d')!;

    const screenshotTop = timeTitleBottom + commonPadding * 1.5;
    const screenshotMaxHeight =
      canvasHeight - screenshotTop - commonPadding * 1.5;

    const formatTime = (num: number) => {
      const s = num / 1000;
      return s % 1 === 0 ? `${s}s` : `${s.toFixed(1)}s`;
    };

    // Viewport-aware lazy loading: downsample by pixel position, then load rest
    const { imgCache } = stateRef.current;
    let isMounted = true;

    // Pre-compute x/y positions
    for (let i = 0; i < allScreenshots.length; i++) {
      allScreenshots[i].x = leftForTimeOffset(allScreenshots[i].timeOffset);
      allScreenshots[i].y = screenshotTop;
    }

    const applyLayout = (index: number, img: HTMLImageElement) => {
      const w = Math.floor(
        (screenshotMaxHeight / img.naturalHeight) * img.naturalWidth,
      );
      allScreenshots[index].width = w;
      allScreenshots[index].height = screenshotMaxHeight;
    };

    // Apply layout for already-cached images
    for (let i = 0; i < allScreenshots.length; i++) {
      const cached = imgCache.get(allScreenshots[i].img);
      if (cached) {
        applyLayout(i, cached);
      }
    }

    // Deduplicate concurrent loads: if a URL is already being fetched, reuse the same promise
    const inflightLoads = new Map<string, Promise<void>>();
    const loadAndApplyImage = (url: string): Promise<void> => {
      if (imgCache.has(url)) return Promise.resolve();
      const existing = inflightLoads.get(url);
      if (existing) return existing;
      const promise = loadImage(url)
        .then((img) => {
          if (!isMounted) return;
          imgCache.set(url, img);
          for (let j = 0; j < allScreenshots.length; j++) {
            if (allScreenshots[j].img === url) {
              applyLayout(j, img);
            }
          }
        })
        .finally(() => {
          inflightLoads.delete(url);
        });
      inflightLoads.set(url, promise);
      return promise;
    };

    // Downsample: evenly sample up to maxInitialCount screenshots.
    // Remaining screenshots are loaded on-demand when user hovers/clicks.
    const maxInitialCount = Math.max(
      1,
      Math.floor(canvasWidth / (20 * sizeRatio)),
    );
    const step = Math.max(
      1,
      Math.floor(allScreenshots.length / maxInitialCount),
    );
    const toLoad: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < allScreenshots.length; i += step) {
      const shot = allScreenshots[i];
      if (shot.img && !imgCache.has(shot.img) && !seen.has(shot.img)) {
        seen.add(shot.img);
        toLoad.push(shot.img);
      }
    }

    const loadAllImages = async () => {
      const batchSize = 6;
      for (let i = 0; i < toLoad.length; i += batchSize) {
        if (!isMounted) return;
        const batch = toLoad.slice(i, i + batchSize);
        await Promise.all(
          batch.map((url) => loadAndApplyImage(url).catch(() => {})),
        );
        if (isMounted) redraw();
      }
    };

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
      for (let i = 1; i <= gridCount; i++) {
        const x = leftForTimeOffset(i * timeStep);
        ctx.fillStyle = hexToCSS(gridLineColor);
        ctx.fillRect(x, 0, sizeRatio, canvasHeight);

        const label = formatTime(i * timeStep);
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
        const img = imgCache.get(shot.img);
        if (!img || shot.x == null || shot.width == null) continue;
        ctx.drawImage(
          img,
          shot.x,
          screenshotTop,
          shot.width,
          screenshotMaxHeight,
        );
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
          const img = imgCache.get(closestScreenshot.img);
          if (img && closestScreenshot.width && closestScreenshot.height) {
            ctx.drawImage(
              img,
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
        const label = formatTime(timeOffsetForLeft(hoverX));
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = hexToCSS(titleBg);
        ctx.fillRect(hoverX + 5, timeTextTop, tw + 10, timeContentFontSize + 4);
        ctx.fillStyle = hexToCSS(gridTextColor);
        ctx.fillText(label, hoverX + 5, timeTextTop + timeContentFontSize);
      }
    };

    redrawRef.current = drawAll;

    // On-demand load: fetch a single screenshot when user hovers/clicks on it
    const loadOnDemand = (shot: TimelineItem) => {
      if (!shot.img || imgCache.has(shot.img)) return;
      loadAndApplyImage(shot.img)
        .then(() => {
          if (isMounted) redraw();
        })
        .catch(() => {});
    };

    // Event handlers
    const onPointerMove = (e: PointerEvent) => {
      const x = e.offsetX * sizeRatio;
      const y = e.offsetY * sizeRatio;
      stateRef.current.hoverX = x;
      drawAll();

      const { closestScreenshot } = closestScreenshotItemOnXY(x);
      if (closestScreenshot) {
        loadOnDemand(closestScreenshot);
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
    loadAllImages();

    return () => {
      isMounted = false;
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
  ]);

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

  let startingTime = -1;
  let idCount = 1;
  const idTaskMap: Record<string, ExecutionTask> = {};
  const allScreenshots: TimelineItem[] = allTasks
    .reduce<(ExecutionRecorderItem & { id: string })[]>((acc, current) => {
      const uiContextRecorderItem: (ExecutionRecorderItem & { id: string })[] =
        [];
      const screenshotFromContext = current.uiContext?.screenshot;
      if (screenshotFromContext && current.timing?.start) {
        const idStr = `id_${idCount++}`;
        idTaskMap[idStr] = current;
        uiContextRecorderItem.push({
          type: 'screenshot',
          ts: current.timing.start,
          screenshot: screenshotFromContext,
          timing: 'before-calling',
          id: idStr,
        });
      }

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
      const recorderItemWithId = recorders.map((item) => {
        const idStr = `id_${idCount++}`;
        idTaskMap[idStr] = current;
        return { ...item, id: idStr };
      });

      return acc.concat(uiContextRecorderItem, recorderItemWithId || []);
    }, [])
    .filter((item) => item.screenshot)
    .map((recorderItem) => ({
      id: recorderItem.id,
      img: recorderItem.screenshot?.base64 || '',
      timeOffset: recorderItem.ts - startingTime,
    }))
    .sort((a, b) => a.timeOffset - b.timeOffset);

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
