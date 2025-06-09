import Insight from '@midscene/core';
import type { BaseElement, UIContext } from '@midscene/core';
import type { RecordedEvent } from '@midscene/record';
import { compositeElementInfoImg } from '@midscene/shared/img';

// Caches for element descriptions and boxed screenshots to improve performance
// Using LRU-like behavior by tracking keys in insertion order and limiting size
const MAX_CACHE_SIZE = 100; // Maximum number of items to keep in each cache
const descriptionCache = new Map<string, string>();
const boxedScreenshotCache = new Map<string, string>();
const cacheKeyOrder: string[] = []; // Track keys in order of insertion for LRU behavior

// Track ongoing AI description generation requests to prevent duplicates
const ongoingDescriptionRequests = new Map<string, Promise<string>>();
const pendingCallbacks = new Map<string, (description: string) => void>();

// Debounce mechanism for AI description generation by hashId
const DEBOUNCE_DELAY = 1000; // 1 second debounce delay
const debounceTimeouts = new Map<string, NodeJS.Timeout>();

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

// Clear all caches
export const clearDescriptionCache = (): void => {
  descriptionCache.clear();
  boxedScreenshotCache.clear();
  cacheKeyOrder.length = 0; // Clear the key order array

  // Clear ongoing requests and callbacks
  ongoingDescriptionRequests.clear();
  pendingCallbacks.clear();

  // Clear debounce data
  debounceTimeouts.forEach((timeout: NodeJS.Timeout) => clearTimeout(timeout));
  debounceTimeouts.clear();

  console.log(
    'Description and screenshot caches cleared, ongoing requests cancelled, debounce data cleared',
  );
};

// Generate fallback description for events when AI fails
export const generateFallbackDescription = (): string => {
  return `failed to generate element description`;
};

// Debounced AI description generation function
const debouncedGenerateAIDescription = (
  event: RecordedEvent,
  imageBase64: string,
  hashId: string,
  updateCallback?: (description: string) => void,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Clear any existing timeout for this hashId (debounce behavior)
    const existingTimeout = debounceTimeouts.get(hashId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      console.log(`[Debounce] Clearing existing timeout for ${hashId}`);
    }

    // Set new timeout - this will be the only execution if no more calls come in
    console.log(
      `[Debounce] Scheduling AI description generation for ${hashId} in ${DEBOUNCE_DELAY}ms`,
    );
    const timeout = setTimeout(() => {
      console.log(
        `[Debounce] Executing AI description generation for ${hashId}`,
      );
      debounceTimeouts.delete(hashId);
      generateAIDescriptionInternal(event, imageBase64, hashId, updateCallback)
        .then(resolve)
        .catch(reject);
    }, DEBOUNCE_DELAY);

    debounceTimeouts.set(hashId, timeout);
  });
};

// Generate AI description asynchronously with complete caching logic (internal function)
const generateAIDescriptionInternal = async (
  event: RecordedEvent,
  imageBase64: string,
  hashId: string,
  updateCallback?: (description: string) => void,
): Promise<string> => {
  try {
    // Check cache first
    if (descriptionCache.has(hashId)) {
      const cachedDescription = descriptionCache.get(hashId)!;
      console.log('Using cached description for element:', hashId);
      return cachedDescription;
    }

    // Check if there's already an ongoing request for this element
    if (ongoingDescriptionRequests.has(hashId)) {
      console.log(
        'AI description generation already in progress for element:',
        hashId,
      );

      // Replace the existing callback with the new one (only one callback per element)
      if (updateCallback) {
        pendingCallbacks.set(hashId, updateCallback);
      }

      // Return the existing promise
      return ongoingDescriptionRequests.get(hashId)!;
    }

    console.log('Starting AI description generation for element:', hashId);

    // Create and track the promise
    const descriptionPromise = (async () => {
      try {
        const mockContext: UIContext<BaseElement> = {
          screenshotBase64: imageBase64,
          size: { width: event.pageInfo.width, height: event.pageInfo.height },
          content: [],
          tree: { node: null, children: [] },
        };

        const insight = new Insight(mockContext);
        let rect:
          | [number, number]
          | { left: number; top: number; width: number; height: number };
        if (event.elementRect?.x && event.elementRect?.y) {
          rect = [event.elementRect.x, event.elementRect.y] as [number, number];
        } else {
          rect = {
            left: event.elementRect?.left!,
            top: event.elementRect?.top!,
            width: event.elementRect?.width!,
            height: event.elementRect?.height!,
          };
        }
        const { description } = await insight.describe(rect);

        // Cache the generated description
        addToCache(descriptionCache, hashId, description);

        // Update the pending callback for this element
        const callback = pendingCallbacks.get(hashId);
        if (callback) {
          callback(description);
        }

        return description;
      } catch (aiError) {
        console.error('Failed to generate AI description:', aiError);
        const fallbackDescription = generateFallbackDescription();

        // Cache the fallback description to avoid retrying failed requests
        addToCache(descriptionCache, hashId, fallbackDescription);

        // Update the pending callback with fallback
        const callback = pendingCallbacks.get(hashId);
        if (callback) {
          callback(fallbackDescription);
        }

        return fallbackDescription;
      } finally {
        // Clean up tracking data
        ongoingDescriptionRequests.delete(hashId);
        pendingCallbacks.delete(hashId);
      }
    })();

    ongoingDescriptionRequests.set(hashId, descriptionPromise);

    // Set current callback as the pending callback if provided
    if (updateCallback) {
      pendingCallbacks.set(hashId, updateCallback);
    }

    return descriptionPromise;
  } catch (error) {
    console.error('Error in generateAIDescription:', error);
    const fallbackDescription = generateFallbackDescription();

    // Cache the fallback description
    addToCache(descriptionCache, hashId, fallbackDescription);

    return fallbackDescription;
  }
};

// Main AI description generation function with debouncing
const generateAIDescription = async (
  event: RecordedEvent,
  imageBase64: string,
  hashId: string,
  updateCallback?: (description: string) => void,
): Promise<string> => {
  // Check cache first - if cached, return immediately without debouncing
  if (descriptionCache.has(hashId)) {
    const cachedDescription = descriptionCache.get(hashId)!;
    console.log(
      'Using cached description for element (no debounce needed):',
      hashId,
    );
    if (updateCallback) {
      updateCallback(cachedDescription);
    }
    return cachedDescription;
  }

  // Check if there's already an ongoing request for this element
  if (ongoingDescriptionRequests.has(hashId)) {
    console.log(
      'AI description generation already in progress (no debounce needed):',
      hashId,
    );

    // Replace the existing callback with the new one (only one callback per element)
    if (updateCallback) {
      pendingCallbacks.set(hashId, updateCallback);
    }

    // Return the existing promise
    return ongoingDescriptionRequests.get(hashId)!;
  }

  // Use debounced version for new requests
  console.log('Using debounced AI description generation for:', hashId);
  return debouncedGenerateAIDescription(
    event,
    imageBase64,
    hashId,
    updateCallback,
  );
};

function existsRect(event: RecordedEvent): boolean {
  return Boolean(
    (event.elementRect?.left &&
      event.elementRect?.top &&
      event.elementRect?.width &&
      event.elementRect?.height) ||
      (event.elementRect?.x && event.elementRect?.y),
  );
}

// Function to generate element description using AI with boxed image
export const optimizeEvent = async (
  event: RecordedEvent,
  updateCallback?: (updatedEvent: RecordedEvent) => void,
): Promise<RecordedEvent> => {
  try {
    console.log('[optimizeEvent] Processing event:', {
      type: event.type,
      hasScreenshot: !!event.screenshotBefore,
      hasRect: existsRect(event),
      elementRect: event.elementRect,
      hasCallback: !!updateCallback,
    });

    // Only process events with screenshots and element position
    if (!event.screenshotBefore) {
      console.log(
        '[optimizeEvent] Skipping AI description - missing screenshot or rect',
      );
      return event;
    }

    // Create the target rect for the element
    const targetRect = {
      left: event.elementRect?.left,
      top: event.elementRect?.top,
      width: event.elementRect?.width,
      height: event.elementRect?.height,
    };

    const elementsPositionInfo = [];

    if (
      event.elementRect?.left &&
      event.elementRect?.top &&
      event.elementRect?.width &&
      event.elementRect?.height
    ) {
      elementsPositionInfo.push({
        rect: targetRect,
        indexId: 1,
      });
    }

    // Add click coordinates if available
    if (event.elementRect?.x && event.elementRect?.y) {
      elementsPositionInfo.push({
        rect: {
          left: event.elementRect?.x,
          top: event.elementRect?.y,
          width: 2,
          height: 2,
        },
      } as any);
    }

    // Use hashId from the event instead of generating a cache key
    const hashId = event.hashId;
    let boxedImageBase64;

    // Check if we have a cached boxed screenshot
    if (boxedScreenshotCache.has(hashId)) {
      boxedImageBase64 = boxedScreenshotCache.get(hashId);
      console.log('Using cached boxed screenshot for element');
    } else {
      // Generate the boxed image and cache it
      boxedImageBase64 = await compositeElementInfoImg({
        inputImgBase64: event.screenshotBefore,
        size: { width: event.pageInfo.width, height: event.pageInfo.height },
        elementsPositionInfo,
        borderThickness: 3,
        annotationPadding: 2,
      });

      // Only cache the boxed image if it's for a significant element (with dimensions)
      if (
        event.elementRect?.width &&
        event.elementRect?.height &&
        event.elementRect?.width > 0 &&
        event.elementRect?.height > 0
      ) {
        addToCache(boxedScreenshotCache, hashId, boxedImageBase64);
      }
    }

    // Create base event with boxed image
    const eventWithBoxedImage: RecordedEvent = {
      ...event,
      screenshotWithBox: boxedImageBase64,
    };

    // Handle description generation
    if (updateCallback && event.screenshotBefore && existsRect(event)) {
      console.log(
        '[optimizeEvent] Starting AI description generation for hash ID:',
        hashId,
      );

      // Check if already cached to provide immediate response
      if (descriptionCache.has(hashId)) {
        const cachedDescription = descriptionCache.get(hashId)!;
        console.log(
          '[optimizeEvent] Using cached description immediately:',
          cachedDescription,
        );
        eventWithBoxedImage.elementDescription = cachedDescription;
        eventWithBoxedImage.descriptionLoading = false;
      } else {
        // Set loading state
        eventWithBoxedImage.elementDescription = 'AI is analyzing element...';
        eventWithBoxedImage.descriptionLoading = true;

        // Generate AI description with debouncing and callback handling
        generateAIDescription(
          event,
          event.screenshotBefore,
          hashId,
          (description: string) => {
            console.log(
              '[optimizeEvent] AI description completed:',
              description,
            );
            updateCallback({
              ...eventWithBoxedImage,
              elementDescription: description,
              descriptionLoading: false,
            });
          },
        ).catch((error: any) => {
          console.error('Error in AI description generation:', error);
          // Fallback is handled inside generateAIDescription, but we still update the callback
          updateCallback({
            ...eventWithBoxedImage,
            elementDescription: generateFallbackDescription(),
            descriptionLoading: false,
          });
        });

        // Set fallback description immediately
        // eventWithBoxedImage.elementDescription = generateFallbackDescription(event);
      }
    } else {
      console.log(
        '[optimizeEvent] Skipping AI description generation - no callback or screenshot:',
        {
          hasCallback: !!updateCallback,
          hasScreenshot: !!event.screenshotBefore,
        },
      );
      // No coordinates available, no callback provided, or no boxed image
      eventWithBoxedImage.elementDescription = generateFallbackDescription();
    }

    return eventWithBoxedImage;
  } catch (error) {
    console.error('Failed to generate boxed image:', error);
    return {
      ...event,
      elementDescription: generateFallbackDescription(),
    };
  }
};
