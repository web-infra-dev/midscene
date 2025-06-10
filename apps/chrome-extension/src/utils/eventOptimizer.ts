import Insight from '@midscene/core';
import type { BaseElement, UIContext } from '@midscene/core';
import type { RecordedEvent } from '@midscene/record';
import { compositeElementInfoImg } from '@midscene/shared/img';

// Caches for element descriptions and boxed screenshots to improve performance
const MAX_CACHE_SIZE = 100;
const descriptionCache = new Map<string, string>();
const boxedScreenshotCache = new Map<string, string>();
const cacheKeyOrder: string[] = [];

// Track ongoing AI description generation requests
const ongoingDescriptionRequests = new Map<string, Promise<string>>();
const pendingCallbacks = new Map<string, (description: string) => void>();

// Debounce mechanism for AI description generation
const DEBOUNCE_DELAY = 1000;
const debounceTimeouts = new Map<string, NodeJS.Timeout>();

// Add an item to cache with size limiting
const addToCache = (
  cache: Map<string, string>,
  key: string,
  value: string,
): void => {
  const existingIndex = cacheKeyOrder.indexOf(key);
  if (existingIndex >= 0) {
    cacheKeyOrder.splice(existingIndex, 1);
  }

  if (cache.size >= MAX_CACHE_SIZE && cacheKeyOrder.length > 0) {
    const oldestKey = cacheKeyOrder.shift();
    if (oldestKey) {
      descriptionCache.delete(oldestKey);
      boxedScreenshotCache.delete(oldestKey);
    }
  }

  cache.set(key, value);
  cacheKeyOrder.push(key);
};

// Clear all caches and ongoing operations
export const clearDescriptionCache = (): void => {
  descriptionCache.clear();
  boxedScreenshotCache.clear();
  cacheKeyOrder.length = 0;
  ongoingDescriptionRequests.clear();
  pendingCallbacks.clear();
  debounceTimeouts.forEach(timeout => clearTimeout(timeout));
  debounceTimeouts.clear();
  console.log('All caches and ongoing operations cleared');
};

// Generate fallback description for events when AI fails
export const generateFallbackDescription = (): string => {
  return 'failed to generate element description';
};

// Check if event has valid rect information
const hasValidRect = (event: RecordedEvent): boolean => {
  return Boolean(
    (event.elementRect?.left &&
      event.elementRect?.top &&
      event.elementRect?.width &&
      event.elementRect?.height) ||
      (event.elementRect?.x && event.elementRect?.y),
  );
};

// Generate AI description asynchronously
export const generateAIDescription = async (
  event: RecordedEvent,
  hashId: string,
): Promise<string> => {
  if (!event.screenshotBefore || !hasValidRect(event)) {
    return generateFallbackDescription();
  }

  if (ongoingDescriptionRequests.has(hashId)) {
    return ongoingDescriptionRequests.get(hashId)!;
  }

  const descriptionPromise = (async () => {
    try {
      const mockContext: UIContext<BaseElement> = {
        screenshotBase64: event.screenshotBefore as string,
        size: { width: event.pageInfo.width, height: event.pageInfo.height },
        content: [],
        tree: { node: null, children: [] },
      };

      const insight = new Insight(mockContext);
      const rect = event.elementRect?.x && event.elementRect?.y
        ? [event.elementRect.x, event.elementRect.y] as [number, number]
        : {
            left: event.elementRect?.left!,
            top: event.elementRect?.top!,
            width: event.elementRect?.width!,
            height: event.elementRect?.height!,
          };

      const { description } = await insight.describe(rect);
      addToCache(descriptionCache, hashId, description);
      return description;
    } catch (error) {
      console.error('Failed to generate AI description:', error);
      const fallbackDescription = generateFallbackDescription();
      addToCache(descriptionCache, hashId, fallbackDescription);
      return fallbackDescription;
    } finally {
      ongoingDescriptionRequests.delete(hashId);
      pendingCallbacks.delete(hashId);
    }
  })();

  ongoingDescriptionRequests.set(hashId, descriptionPromise);
  return descriptionPromise;
};

// Generate boxed image for event
export const generateBoxedImage = async (
  event: RecordedEvent,
): Promise<string | undefined> => {
  try {
    if (!event.screenshotBefore) {
      return undefined;
    }

    const hashId = event.hashId;
    if (boxedScreenshotCache.has(hashId)) {
      return boxedScreenshotCache.get(hashId);
    }

    const elementsPositionInfo = [];
    if (hasValidRect(event)) {
      elementsPositionInfo.push({
        rect: {
          left: event.elementRect?.left,
          top: event.elementRect?.top,
          width: event.elementRect?.width,
          height: event.elementRect?.height,
        },
        indexId: 1,
      });
    }

    if (event.elementRect?.x && event.elementRect?.y) {
      elementsPositionInfo.push({
        rect: {
          left: event.elementRect.x,
          top: event.elementRect.y,
          width: 2,
          height: 2,
        },
      } as any);
    }

    const boxedImageBase64 = await compositeElementInfoImg({
      inputImgBase64: event.screenshotBefore,
      size: { width: event.pageInfo.width, height: event.pageInfo.height },
      elementsPositionInfo,
      borderThickness: 3,
      annotationPadding: 2,
    });

    if (event.elementRect?.width && event.elementRect?.height && 
        event.elementRect.width > 0 && event.elementRect.height > 0) {
      addToCache(boxedScreenshotCache, hashId, boxedImageBase64);
    }

    return boxedImageBase64;
  } catch (error) {
    console.error('[generateBoxedImage] Failed to generate boxed image:', error);
    return undefined;
  }
};

// Main function to optimize event with AI description and boxed image
export const optimizeEvent = async (
  event: RecordedEvent,
  updateCallback: (updatedEvent: RecordedEvent) => void,
): Promise<RecordedEvent> => {
  try {
    const boxedImageBase64 = await generateBoxedImage(event);
    if (boxedImageBase64) {
      event.screenshotWithBox = boxedImageBase64;
    }

    const hashId = event.hashId;
    const eventWithDescription = { ...event };

    // Set initial loading state
    eventWithDescription.elementDescription = 'AI is analyzing element...';
    eventWithDescription.descriptionLoading = true;
    updateCallback(eventWithDescription);

    // Check cache first
    if (descriptionCache.has(hashId)) {
      const cachedDescription = descriptionCache.get(hashId)!;
      eventWithDescription.elementDescription = cachedDescription;
      eventWithDescription.descriptionLoading = false;
      updateCallback(eventWithDescription);
      return eventWithDescription;
    }


    // Generate description with debouncing
    generateAIDescription(event, hashId)
      .then(description => {
        updateCallback({
          ...event,
          elementDescription: description,
          descriptionLoading: false,
        });
      })
      .catch(error => {
        console.error('[optimizeEvent] Error in AI description generation:', error);
        updateCallback({
          ...event,
          elementDescription: generateFallbackDescription(),
          descriptionLoading: false,
        });
      });
    return eventWithDescription;
  } catch (error) {
    console.error('[optimizeEvent] Error processing event:', error);
    return {
      ...event,
      elementDescription: generateFallbackDescription(),
      descriptionLoading: false,
    };
  }
};
