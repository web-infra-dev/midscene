import type { RefObject } from 'react';
import { useEffect } from 'react';
import { mapScrollTopBetweenMarkdownAnchors } from '../utils/markdown-scroll-sync';

interface MarkdownScrollSyncOptions {
  enabled: boolean;
  contentKey: number;
  markdownScrollRef: RefObject<HTMLElement>;
  screenshotScrollRef: RefObject<HTMLElement>;
}

interface SharedAnchorOffsets {
  source: number[];
  target: number[];
}

function anchorOffset(
  scrollContainer: HTMLElement,
  anchor: HTMLElement,
): number {
  const containerRect = scrollContainer.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  return anchorRect.top - containerRect.top + scrollContainer.scrollTop;
}

function sharedAnchorOffsets(
  source: HTMLElement,
  target: HTMLElement,
): SharedAnchorOffsets {
  const targetAnchors = new Map<string, HTMLElement>();
  target
    .querySelectorAll<HTMLElement>('[data-markdown-path]')
    .forEach((anchor) => {
      const path = anchor.dataset.markdownPath;
      if (path && !targetAnchors.has(path)) {
        targetAnchors.set(path, anchor);
      }
    });

  const sourceOffsets: number[] = [];
  const targetOffsets: number[] = [];
  const visitedPaths = new Set<string>();

  source
    .querySelectorAll<HTMLElement>('[data-markdown-path]')
    .forEach((sourceAnchor) => {
      const path = sourceAnchor.dataset.markdownPath;
      if (!path || visitedPaths.has(path)) {
        return;
      }

      const targetAnchor = targetAnchors.get(path);
      if (!targetAnchor) {
        return;
      }

      visitedPaths.add(path);
      sourceOffsets.push(anchorOffset(source, sourceAnchor));
      targetOffsets.push(anchorOffset(target, targetAnchor));
    });

  return { source: sourceOffsets, target: targetOffsets };
}

function syncScrollPosition(source: HTMLElement, target: HTMLElement): void {
  const sourceMaxScrollTop = source.scrollHeight - source.clientHeight;
  const targetMaxScrollTop = target.scrollHeight - target.clientHeight;
  const anchors = sharedAnchorOffsets(source, target);
  const nextScrollTop = mapScrollTopBetweenMarkdownAnchors({
    scrollTop: source.scrollTop,
    sourceMaxScrollTop,
    targetMaxScrollTop,
    sourceAnchorOffsets: anchors.source,
    targetAnchorOffsets: anchors.target,
  });

  // Avoid redundant assignments and their corresponding scroll events.
  if (Math.abs(target.scrollTop - nextScrollTop) > 1) {
    target.scrollTop = nextScrollTop;
  }
}

export function useMarkdownScrollSync({
  enabled,
  contentKey,
  markdownScrollRef,
  screenshotScrollRef,
}: MarkdownScrollSyncOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const markdownScroller = markdownScrollRef.current;
    const screenshotScroller = screenshotScrollRef.current;
    if (!markdownScroller || !screenshotScroller) {
      return;
    }

    let markdownFrame: number | null = null;
    let screenshotFrame: number | null = null;
    let releaseProgrammaticScrollFrame: number | null = null;
    let programmaticScrollTarget: HTMLElement | null = null;

    const syncFrom = (source: HTMLElement, target: HTMLElement) => {
      programmaticScrollTarget = target;
      syncScrollPosition(source, target);

      if (releaseProgrammaticScrollFrame !== null) {
        cancelAnimationFrame(releaseProgrammaticScrollFrame);
      }
      releaseProgrammaticScrollFrame = requestAnimationFrame(() => {
        releaseProgrammaticScrollFrame = null;
        programmaticScrollTarget = null;
      });
    };

    const syncFromMarkdown = () => {
      if (programmaticScrollTarget === markdownScroller) {
        return;
      }
      if (markdownFrame !== null) {
        cancelAnimationFrame(markdownFrame);
      }
      markdownFrame = requestAnimationFrame(() => {
        markdownFrame = null;
        syncFrom(markdownScroller, screenshotScroller);
      });
    };
    const syncFromScreenshots = () => {
      if (programmaticScrollTarget === screenshotScroller) {
        return;
      }
      if (screenshotFrame !== null) {
        cancelAnimationFrame(screenshotFrame);
      }
      screenshotFrame = requestAnimationFrame(() => {
        screenshotFrame = null;
        syncFrom(screenshotScroller, markdownScroller);
      });
    };

    markdownScroller.addEventListener('scroll', syncFromMarkdown, {
      passive: true,
    });
    screenshotScroller.addEventListener('scroll', syncFromScreenshots, {
      passive: true,
    });

    return () => {
      markdownScroller.removeEventListener('scroll', syncFromMarkdown);
      screenshotScroller.removeEventListener('scroll', syncFromScreenshots);
      if (markdownFrame !== null) {
        cancelAnimationFrame(markdownFrame);
      }
      if (screenshotFrame !== null) {
        cancelAnimationFrame(screenshotFrame);
      }
      if (releaseProgrammaticScrollFrame !== null) {
        cancelAnimationFrame(releaseProgrammaticScrollFrame);
      }
    };
  }, [contentKey, enabled, markdownScrollRef, screenshotScrollRef]);
}
