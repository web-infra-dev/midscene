import Insight from '@midscene/core';
import type { BaseElement, UIContext } from '@midscene/core';
import { compositeElementInfoImg } from '@midscene/shared/img';
import type { RecordedEvent } from '@midscene/record';

// Caches for element descriptions and boxed screenshots to improve performance
// Using LRU-like behavior by tracking keys in insertion order and limiting size
const MAX_CACHE_SIZE = 100; // Maximum number of items to keep in each cache
const descriptionCache = new Map<string, string>();
const boxedScreenshotCache = new Map<string, string>();
const cacheKeyOrder: string[] = []; // Track keys in order of insertion for LRU behavior

// Track ongoing AI description generation requests to prevent duplicates
const ongoingDescriptionRequests = new Map<string, Promise<string>>();
const pendingCallbacks = new Map<string, (description: string) => void>();

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
    event.elementRect?.left || 0,
    event.elementRect?.top || 0,
    event.elementRect?.width || 0,
    event.elementRect?.height || 0,
  ];  

  return elementProps.join('|');
};

// Clear all caches
export const clearDescriptionCache = (): void => {
  descriptionCache.clear();
  boxedScreenshotCache.clear();
  cacheKeyOrder.length = 0; // Clear the key order array
  
  // Clear ongoing requests and callbacks
  ongoingDescriptionRequests.clear();
  pendingCallbacks.clear();
  
  console.log('Description and screenshot caches cleared, ongoing requests cancelled');
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
      return `Scroll to position (${event.elementRect?.left || 0}, ${event.elementRect?.top || 0})`;
    case 'navigation':
      return `Navigate to ${event.url || 'new page'}`;
    default:
      return `${event.type} on ${elementType}`;
  }
};

// Generate AI description asynchronously with complete caching logic
const generateAIDescription = async (
  event: RecordedEvent,
  boxedImageBase64: string,
  cacheKey: string,
  updateCallback?: (description: string) => void,
): Promise<string> => {
  try {
    // Check cache first
    if (descriptionCache.has(cacheKey)) {
      const cachedDescription = descriptionCache.get(cacheKey)!;
      console.log('Using cached description for element:', cacheKey);
      return cachedDescription;
    }

    // Check if there's already an ongoing request for this element
    if (ongoingDescriptionRequests.has(cacheKey)) {
      console.log('AI description generation already in progress for element:', cacheKey);
      
      // Replace the existing callback with the new one (only one callback per element)
      if (updateCallback) {
        pendingCallbacks.set(cacheKey, updateCallback);
      }
      
      // Return the existing promise
      return ongoingDescriptionRequests.get(cacheKey)!;
    }

    console.log('Starting AI description generation for element:', cacheKey);
    
    // Create and track the promise
    const descriptionPromise = (async () => {
      try {
        const mockContext: UIContext<BaseElement> = {
          screenshotBase64: boxedImageBase64,
          size: { width: event.pageInfo.width, height: event.pageInfo.height },
          content: [],
          tree: { node: null, children: [] },
        };

        const insight = new Insight(mockContext);
        let rect: [number, number] | { left: number; top: number; width: number; height: number };
        if (event.elementRect?.x !== undefined && event.elementRect?.y !== undefined) {
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
        addToCache(descriptionCache, cacheKey, description);
        
        // Update the pending callback for this element
        const callback = pendingCallbacks.get(cacheKey);
        if (callback) {
          callback(description);
        }
        
        return description;
      } catch (aiError) {
        console.error('Failed to generate AI description:', aiError);
        const fallbackDescription = generateFallbackDescription(event);
        
        // Cache the fallback description to avoid retrying failed requests
        addToCache(descriptionCache, cacheKey, fallbackDescription);
        
        // Update the pending callback with fallback
        const callback = pendingCallbacks.get(cacheKey);
        if (callback) {
          callback(fallbackDescription);
        }
        
        return fallbackDescription;
      } finally {
        // Clean up tracking data
        ongoingDescriptionRequests.delete(cacheKey);
        pendingCallbacks.delete(cacheKey);
      }
    })();
    
    ongoingDescriptionRequests.set(cacheKey, descriptionPromise);
    
    // Set current callback as the pending callback if provided
    if (updateCallback) {
      pendingCallbacks.set(cacheKey, updateCallback);
    }
    
    return descriptionPromise;
  } catch (error) {
    console.error('Error in generateAIDescription:', error);
    const fallbackDescription = generateFallbackDescription(event);
    
    // Cache the fallback description
    addToCache(descriptionCache, cacheKey, fallbackDescription);
    
    return fallbackDescription;
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
      event.elementRect?.width === undefined ||
      event.elementRect?.height === undefined
    ) {
      return event;
    }

    // Create the target rect for the element
    const targetRect = {
      left: event.elementRect?.left,
      top: event.elementRect?.top,
      width: event.elementRect?.width,
      height: event.elementRect?.height,
    };

    const elementsPositionInfo = [
      {
        rect: targetRect,
        indexId: 1,
      },
    ];

    // Add click coordinates if available
    if (event.elementRect?.x !== undefined && event.elementRect?.y !== undefined) {
      elementsPositionInfo.push({
        rect: { left: event.elementRect?.x, top: event.elementRect?.y, width: 2, height: 2 },
      } as any);
    }

    // Generate cache key for this element
    const cacheKey = generateElementCacheKey(event);
    let boxedImageBase64;

    // Check if we have a cached boxed screenshot
    if (boxedScreenshotCache.has(cacheKey)) {
      boxedImageBase64 = boxedScreenshotCache.get(cacheKey);
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
      if (event.elementRect?.width && event.elementRect?.height && event.elementRect?.width > 0 && event.elementRect?.height > 0) {
        addToCache(boxedScreenshotCache, cacheKey, boxedImageBase64);
      }
    }

    // Create base event with boxed image
    const eventWithBoxedImage: RecordedEvent = {
      ...event,
      screenshotWithBox: boxedImageBase64,
    };

    // Handle description generation
    if (updateCallback && boxedImageBase64) {
      // Set loading state
      eventWithBoxedImage.elementDescription = 'AI 正在分析元素...';
      eventWithBoxedImage.descriptionLoading = true;
      
      // Generate AI description with callback handling
      generateAIDescription(event, boxedImageBase64, cacheKey, (description: string) => {
        updateCallback({
          ...eventWithBoxedImage,
          elementDescription: description,
          descriptionLoading: false,
        });
      }).catch((error) => {
        console.error('Error in AI description generation:', error);
        // Fallback is handled inside generateAIDescription, but we still update the callback
        updateCallback({
          ...eventWithBoxedImage,
          elementDescription: generateFallbackDescription(event),
          descriptionLoading: false,
        });
      });
    } else {
      // No coordinates available, no callback provided, or no boxed image
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
