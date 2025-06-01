import Insight from '@midscene/core';
import type { BaseElement, UIContext } from '@midscene/core';
import { compositeElementInfoImg } from '@midscene/shared/img';
import type { RecordedEvent } from '../store';

// Caches for element descriptions and boxed screenshots to improve performance
// Using LRU-like behavior by tracking keys in insertion order and limiting size
const MAX_CACHE_SIZE = 100; // Maximum number of items to keep in each cache
const descriptionCache = new Map<string, string>();
const boxedScreenshotCache = new Map<string, string>();
const cacheKeyOrder: string[] = []; // Track keys in order of insertion for LRU behavior

// Add an item to cache with size limiting
const addToCache = (
  cache: Map<string, string>,
  key: string,
  value: string,
): void => {
  // If key already exists, remove it from the order array to add it at the end (most recently used)
  const existingIndex = cacheKeyOrder.indexOf(key);
  if (existingIndex >= 0) {
    cacheKeyOrder.splice(existingIndex, 1);
  }

  // If cache is at max size, remove oldest item (LRU)
  if (cache.size >= MAX_CACHE_SIZE && cacheKeyOrder.length > 0) {
    const oldestKey = cacheKeyOrder.shift();
    if (oldestKey) {
      // Remove from both caches to ensure consistency
      descriptionCache.delete(oldestKey);
      boxedScreenshotCache.delete(oldestKey);
    }
  }

  // Add new key to cache and track it
  cache.set(key, value);
  cacheKeyOrder.push(key);
};

// Generate a cache key based on element properties
const generateElementCacheKey = (event: RecordedEvent): string => {
  const elementProps = [
    event.targetTagName || '',
    event.targetId || '',
    event.targetClassName || '',
    event.viewportX || 0,
    event.viewportY || 0,
    event.width || 0,
    event.height || 0,
  ];

  return elementProps.join('|');
};

// Check if two events reference the same DOM element
const isSameElement = (
  event1: RecordedEvent,
  event2: RecordedEvent,
): boolean => {
  return (
    event1.targetId === event2.targetId &&
    event1.targetTagName === event2.targetTagName &&
    event1.targetClassName === event2.targetClassName &&
    Math.abs((event1.viewportX || 0) - (event2.viewportX || 0)) < 5 &&
    Math.abs((event1.viewportY || 0) - (event2.viewportY || 0)) < 5 &&
    Math.abs((event1.width || 0) - (event2.width || 0)) < 5 &&
    Math.abs((event1.height || 0) - (event2.height || 0)) < 5
  );
};

// Clear all caches
export const clearDescriptionCache = (): void => {
  descriptionCache.clear();
  boxedScreenshotCache.clear();
  cacheKeyOrder.length = 0; // Clear the key order array
  console.log('Description and screenshot caches cleared');
};

// Generate fallback description for events when AI fails
export const generateFallbackDescription = (event: RecordedEvent): string => {
  const elementType = event.targetTagName?.toLowerCase() || 'element';

  switch (event.type) {
    case 'click':
      return `Click on ${elementType}${event.value ? ` with text "${event.value}"` : ''}`;
    case 'input':
      return `Input "${event.value || ''}" into ${elementType}`;
    case 'scroll':
      return `Scroll to position (${event.viewportX || 0}, ${event.viewportY || 0})`;
    case 'navigation':
      return `Navigate to ${event.url || 'new page'}`;
    default:
      return `${event.type} on ${elementType}`;
  }
};

// Generate AI description asynchronously with caching
const generateAIDescription = async (
  event: RecordedEvent,
  boxedImageBase64: string,
  eventWithBoxedImage: RecordedEvent,
  updateCallback: (updatedEvent: RecordedEvent) => void,
) => {
  try {
    // Generate a cache key for this element
    const cacheKey = generateElementCacheKey(event);

    // Check if we have a cached description for this element
    if (descriptionCache.has(cacheKey)) {
      const cachedDescription = descriptionCache.get(cacheKey);
      console.log('Using cached description for element');

      updateCallback({
        ...eventWithBoxedImage,
        elementDescription: cachedDescription,
        descriptionLoading: false,
      });
      return;
    }

    // No cached description, generate a new one
    const mockContext: UIContext<BaseElement> = {
      screenshotBase64: boxedImageBase64,
      size: { width: event.pageWidth, height: event.pageHeight },
      content: [],
      tree: { node: null, children: [] },
    };

    const insight = new Insight(mockContext);
    const { description } = await insight.describe([event.x!, event.y!]);

    // Cache the description for future use
    addToCache(descriptionCache, cacheKey, description);

    updateCallback({
      ...eventWithBoxedImage,
      elementDescription: description,
      descriptionLoading: false,
    });
  } catch (aiError) {
    console.error('Failed to generate AI description:', aiError);

    updateCallback({
      ...eventWithBoxedImage,
      elementDescription: generateFallbackDescription(event),
      descriptionLoading: false,
    });
  }
};

// Function to generate element description using AI with boxed image
export const optimizeEvent = async (
  event: RecordedEvent,
  updateCallback?: (updatedEvent: RecordedEvent) => void,
): Promise<RecordedEvent> => {
  try {
    // Only process events with screenshots and element position
    if (
      !event.screenshotBefore ||
      event.viewportX === undefined ||
      event.viewportY === undefined ||
      event.width === undefined ||
      event.height === undefined
    ) {
      return event;
    }

    // Create the target rect for the element
    const targetRect = {
      left: event.viewportX,
      top: event.viewportY,
      width: event.width,
      height: event.height,
    };

    const elementsPositionInfo = [
      {
        rect: targetRect,
        indexId: 1,
      },
    ];

    // Add click coordinates if available
    if (event.x !== undefined && event.y !== undefined) {
      elementsPositionInfo.push({
        rect: { left: event.x, top: event.y, width: 2, height: 2 },
      } as any);
    }

    // Check for cached description and boxed screenshot by element properties
    const cacheKey = generateElementCacheKey(event);
    const cachedDescription = descriptionCache.get(cacheKey);
    let boxedImageBase64;

    // Check if we have a cached boxed screenshot
    if (boxedScreenshotCache.has(cacheKey)) {
      boxedImageBase64 = boxedScreenshotCache.get(cacheKey);
      console.log('Using cached boxed screenshot for element');
    } else {
      // Generate the boxed image and cache it
      boxedImageBase64 = await compositeElementInfoImg({
        inputImgBase64: event.screenshotBefore,
        size: { width: event.pageWidth, height: event.pageHeight },
        elementsPositionInfo,
        borderThickness: 3,
        annotationPadding: 2,
      });

      // Only cache the boxed image if it's for a significant element (with dimensions)
      if (event.width && event.height && event.width > 0 && event.height > 0) {
        addToCache(boxedScreenshotCache, cacheKey, boxedImageBase64);
      }
    }

    // Return event with boxed image and loading state or cached description
    const eventWithBoxedImage: RecordedEvent = {
      ...event,
      screenshotWithBox: boxedImageBase64,
      elementDescription: cachedDescription || 'AI 正在分析元素...',
      descriptionLoading: !cachedDescription,
    };

    // Generate AI description asynchronously if coordinates are available and no cached description
    if (event.x !== undefined && event.y !== undefined && updateCallback) {
      // Skip AI description generation if we already have a cached description
      if (!cachedDescription && boxedImageBase64) {
        generateAIDescription(
          event,
          boxedImageBase64,
          eventWithBoxedImage,
          updateCallback,
        );
      }
    } else {
      eventWithBoxedImage.elementDescription = 'No description available';
      eventWithBoxedImage.descriptionLoading = false;
    }

    return eventWithBoxedImage;
  } catch (error) {
    console.error('Failed to generate boxed image:', error);
    return {
      ...event,
      elementDescription: 'Failed to generate description',
      descriptionLoading: false,
    };
  }
};
