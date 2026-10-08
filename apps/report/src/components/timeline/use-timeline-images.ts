import { type RefObject, useEffect, useState } from 'react';
import { timelineImageStore } from './timeline-image-store';
import {
  type TimelineThumbnail,
  prepareTimelineImageGroups,
  selectTimelineImageGroups,
} from './timeline-images';
import { useTimelineViewport } from './use-timeline-viewport';

export interface PositionedTimelineImage {
  img: string;
  ratio: number;
}
const emptyImages = new Map<string, TimelineThumbnail>();
const emptyFailures = new Map<string, unknown>();

export function useTimelineImages(
  items: readonly PositionedTimelineImage[],
  trackRef: RefObject<HTMLElement>,
) {
  const { visible, width } = useTimelineViewport(trackRef, items.length > 0);
  const [prepared, setPrepared] = useState({
    items,
    images: emptyImages,
    failures: emptyFailures,
    initialReady: false,
  });

  useEffect(() => {
    setPrepared({
      items,
      images: emptyImages,
      failures: emptyFailures,
      initialReady: false,
    });
    if (!visible || !width || !items.length) return;
    const controller = new AbortController();
    const { signal } = controller;
    const groups = selectTimelineImageGroups(
      items.map((item) => ({ img: item.img, x: item.ratio * width })),
      20,
    );
    void prepareTimelineImageGroups(
      groups,
      (url) => timelineImageStore.load(url, 136, signal),
      signal,
      ({ images, failures, complete }) => {
        if (complete && failures.size)
          console.error('Failed to prepare timeline screenshots', [
            ...failures.values(),
          ]);
        setPrepared({ items, images, failures, initialReady: true });
      },
    ).catch((error) => {
      if (!signal.aborted) console.error('Failed to prepare timeline', error);
    });
    return () => controller.abort();
  }, [items, visible, width]);

  return prepared.items === items
    ? prepared
    : {
        items,
        images: emptyImages,
        failures: emptyFailures,
        initialReady: false,
      };
}
