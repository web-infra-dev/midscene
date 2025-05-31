import Insight from '@midscene/core';
import type { UIContext, BaseElement } from '@midscene/core';
import { compositeElementInfoImg } from '@midscene/shared/img';
import type { RecordedEvent } from '../store';

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

// Generate AI description asynchronously
const generateAIDescription = async (
    event: RecordedEvent, 
    boxedImageBase64: string, 
    eventWithBoxedImage: RecordedEvent, 
    updateCallback: (updatedEvent: RecordedEvent) => void
) => {
    try {
        const mockContext: UIContext<BaseElement> = {
            screenshotBase64: boxedImageBase64,
            size: { width: event.pageWidth, height: event.pageHeight },
            content: [],
            tree: { node: null, children: [] }
        };

        const insight = new Insight(mockContext);
        const { description } = await insight.describe([event.x!, event.y!]);

        updateCallback({
            ...eventWithBoxedImage,
            elementDescription: description,
            descriptionLoading: false
        });
    } catch (aiError) {
        console.error('Failed to generate AI description:', aiError);
        
        updateCallback({
            ...eventWithBoxedImage,
            elementDescription: generateFallbackDescription(event),
            descriptionLoading: false
        });
    }
};

// Function to generate element description using AI with boxed image
export const optimizeEvent = async (
    event: RecordedEvent, 
    updateCallback?: (updatedEvent: RecordedEvent) => void
): Promise<RecordedEvent> => {
    try {
        // Only process events with screenshots and element position
        if (!event.screenshotBefore || 
            event.viewportX === undefined || 
            event.viewportY === undefined || 
            event.width === undefined || 
            event.height === undefined) {
            return event;
        }

        // Create the target rect for the element
        const targetRect = {
            left: event.viewportX,
            top: event.viewportY,
            width: event.width,
            height: event.height
        };

        const elementsPositionInfo = [{
            rect: targetRect,
            indexId: 1
        }];

        // Add click coordinates if available
        if (event.x !== undefined && event.y !== undefined) {
            elementsPositionInfo.push({
                rect: { left: event.x, top: event.y, width: 2, height: 2 }
            } as any);
        }

        // Generate the boxed image
        const boxedImageBase64 = await compositeElementInfoImg({
            inputImgBase64: event.screenshotBefore,
            size: { width: event.pageWidth, height: event.pageHeight },
            elementsPositionInfo,
            borderThickness: 3,
            annotationPadding: 2
        });

        // Return event with boxed image and loading state
        const eventWithBoxedImage: RecordedEvent = {
            ...event,
            screenshotWithBox: boxedImageBase64,
            elementDescription: 'AI 正在分析元素...',
            descriptionLoading: true
        };

        // Generate AI description asynchronously if coordinates are available
        if (event.x !== undefined && event.y !== undefined && updateCallback) {
            generateAIDescription(event, boxedImageBase64, eventWithBoxedImage, updateCallback);
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
            descriptionLoading: false
        };
    }
};