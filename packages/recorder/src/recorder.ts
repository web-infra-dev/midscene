import { isNotContainerElement } from '@midscene/shared/extractor';
import { getElementXpath } from '@midscene/shared/extractor';

const DEBUG = localStorage.getItem('DEBUG') === 'true'; // Based on process.env.NODE_ENV
// localStorage.setItem('DEBUG', 'true');

function debugLog(...args: any[]) {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[EventRecorder]', ...args);
  }
}

// Generate a hash ID based on elementRect and type
function generateHashId(
  type: string,
  elementRect?: ChromeRecordedEvent['elementRect'],
): string {
  const rectStr = elementRect
    ? `${elementRect.left}_${elementRect.top}_${elementRect.width}_${elementRect.height}${elementRect.x !== undefined ? `_${elementRect.x}` : ''}${elementRect.y !== undefined ? `_${elementRect.y}` : ''}`
    : 'no_rect';
  const combined = `${type}_${rectStr}_${Date.now()}`;

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export interface ChromeRecordedEvent {
  type: 'click' | 'scroll' | 'input' | 'navigation' | 'setViewport' | 'keydown';
  url?: string;
  title?: string;
  value?: string;
  elementRect?: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  };
  pageInfo: {
    width: number;
    height: number;
  };
  screenshotBefore?: string;
  screenshotAfter?: string;
  elementDescription?: string;
  // Loading state for AI description generation
  descriptionLoading?: boolean;
  // Boxed screenshot with element highlighted
  screenshotWithBox?: string;
  timestamp: number;
  hashId: string;
}

// Event type definition
export interface RecordedEvent extends ChromeRecordedEvent {
  element?: HTMLElement;
  targetTagName?: string;
  targetId?: string;
  targetClassName?: string;
  isLabelClick?: boolean;
  labelInfo?: {
    htmlFor?: string;
    textContent?: string;
    xpath?: string; // xpath of the label element
  };
  isTrusted?: boolean;
  detail?: number;
  inputType?: string;
}

// Event callback function type
export type EventCallback = (event: RecordedEvent) => void;

// Check if it's the same input target
const isSameInputTarget = (
  event1: RecordedEvent,
  event2: RecordedEvent,
): boolean => {
  return event1.element === event2.element;
};

// Check if it's the same scroll target
const isSameScrollTarget = (
  event1: RecordedEvent,
  event2: RecordedEvent,
): boolean => {
  return event1.element === event2.element;
};

// Get the last label click event
const getLastLabelClick = (
  events: RecordedEvent[],
): RecordedEvent | undefined => {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === 'click' && event.isLabelClick) {
      return event;
    }
  }
  return undefined;
};

// Get all iframe elements
const getAllIframeElements = (): HTMLIFrameElement[] => {
  const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe');
  return Array.from(iframes);
};

const getIframeOffset = (
  parentIframe?: HTMLIFrameElement | null,
): {
  x: number;
  y: number;
} => {
  if (!parentIframe) return { x: 0, y: 0 };

  const iframeRect = parentIframe.getBoundingClientRect();
  return { x: iframeRect.left, y: iframeRect.top };
};

// Event recorder class
export class EventRecorder {
  private isRecording = false;
  private eventCallback: EventCallback;
  private scrollThrottleTimer: number | null = null;
  private scrollThrottleDelay = 200; // 200ms throttle
  private inputThrottleTimer: number | null = null;
  private inputThrottleDelay = 300; // 300ms throttle for input events
  private lastViewportScroll: { x: number; y: number } | null = null;
  private sessionId: string;
  private mutationObserver: MutationObserver | null = null;
  private removeEventListenersFunctions: (() => void)[] = [];
  private iframes: HTMLIFrameElement[] = [];

  constructor(eventCallback: EventCallback, sessionId: string) {
    this.eventCallback = eventCallback;
    this.sessionId = sessionId;
  }

  // Create initial navigation event with page dimensions
  createNavigationEvent(url: string, title: string): ChromeRecordedEvent {
    return {
      type: 'navigation',
      url,
      title,
      pageInfo: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      timestamp: Date.now(),
      hashId: `navigation_${Date.now()}`,
    };
  }

  // Add event listeners to a document (main document or iframe document)
  private addEventListeners(
    doc: Document,
    parentIframe?: HTMLIFrameElement | null,
  ): () => void {
    // Create wrapper functions that capture the iframe variable
    const clickHandler = (e: MouseEvent) => this.handleClick(e, parentIframe);
    const inputHandler = (e: Event) => this.handleInput(e, parentIframe);
    const scrollHandler = (e: Event) => this.handleScroll(e, parentIframe);

    const options = { capture: true, passive: true };
    // Store handlers for later removal
    doc.addEventListener('click', clickHandler, options);
    doc.addEventListener('input', inputHandler, options);
    doc.addEventListener('scroll', scrollHandler, options);

    return () => {
      try {
        // Check if document is still valid (iframe might have been removed)
        doc.removeEventListener('click', clickHandler, options);
        doc.removeEventListener('input', inputHandler, options);
        doc.removeEventListener('scroll', scrollHandler, options);
      } catch (e) {
        // Document might have been removed or become invalid
        debugLog(
          'Unable to remove event listeners (document may have been removed):',
          e,
        );
      }
    };
  }

  // Add event listeners to an iframe
  private addIframeListeners(iframe: HTMLIFrameElement): void {
    const listener = () => {
      try {
        const iframeDoc = iframe.contentDocument;
        if (iframeDoc) {
          this.addEventListeners(iframeDoc, iframe);
          debugLog('Added event listeners to iframe:', iframe);
        }
      } catch (e) {
        debugLog('Unable to access iframe (cross-origin):', iframe, e);
      }
    };

    if (iframe.contentDocument) {
      // Iframe is already loaded, add listeners immediately
      return listener();
    }

    // Iframe not loaded yet, wait for load event
    const iframeLoadListener = () => {
      iframe.removeEventListener('load', iframeLoadListener);
      listener();
    };
    iframe.addEventListener('load', iframeLoadListener);
  }

  // Start recording
  start(): void {
    if (this.isRecording) {
      debugLog('Recording already active, ignoring start request');
      return;
    }

    this.isRecording = true;
    debugLog('Starting event recording');

    // Clear previous remove event listeners functions
    this.removeEventListenersFunctions = [];

    // Handle iframe elements
    this.iframes = [];
    // Automatically detect all iframe elements
    this.iframes = getAllIframeElements();

    debugLog('Added event listeners for', this.iframes.length, 'iframe');

    // Add final navigation event to capture the final page
    setTimeout(() => {
      const navigationEvent = this.createNavigationEvent(
        window.location.href,
        document.title,
      );
      this.eventCallback(navigationEvent);
      debugLog('Added final navigation event', navigationEvent);
    }, 0);

    // Add event listeners
    const removeDocumentListeners = this.addEventListeners(document);
    this.removeEventListenersFunctions.push(removeDocumentListeners);
    this.iframes.forEach((iframe) => {
      this.addIframeListeners(iframe);
    });
  }

  // Stop recording
  stop(): void {
    if (!this.isRecording) {
      debugLog('Recording not active, ignoring stop request');
      return;
    }

    this.isRecording = false;
    debugLog('Stopping event recording');

    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }
    if (this.inputThrottleTimer) {
      clearTimeout(this.inputThrottleTimer);
      this.inputThrottleTimer = null;
    }

    // Remove all event listeners
    this.removeEventListenersFunctions.forEach((removeListeners) =>
      removeListeners(),
    );
    this.removeEventListenersFunctions = [];

    debugLog('Removed all event listeners');
  }

  // Click event handler
  private handleClick = (
    event: MouseEvent,
    parentIframe?: HTMLIFrameElement | null,
  ): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;
    const { isLabelClick, labelInfo } = this.checkLabelClick(target);

    const iframeOffset = getIframeOffset(parentIframe);

    const rect = target.getBoundingClientRect();
    const elementRect: ChromeRecordedEvent['elementRect'] = {
      x: Number((event.clientX + iframeOffset.x).toFixed(2)),
      y: Number((event.clientY + iframeOffset.y).toFixed(2)),
    };
    console.log('isNotContainerElement', isNotContainerElement(target));
    if (isNotContainerElement(target)) {
      elementRect.left = Number((rect.left + iframeOffset.x).toFixed(2));
      elementRect.top = Number((rect.top + iframeOffset.y).toFixed(2));
      elementRect.width = Number(rect.width.toFixed(2));
      elementRect.height = Number(rect.height.toFixed(2));
    }

    const clickEvent: RecordedEvent = {
      type: 'click',
      elementRect,
      pageInfo: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      value: '',
      timestamp: Date.now(),
      hashId: generateHashId('click', {
        ...elementRect,
      }),
      element: target,
      isLabelClick,
      labelInfo,
      isTrusted: event.isTrusted,
      detail: event.detail,
    };

    this.eventCallback(clickEvent);
  };

  // Scroll event handler
  private handleScroll = (
    event: Event,
    parentIframe?: HTMLIFrameElement | null,
  ): void => {
    if (!this.isRecording) return;

    function isDocument(target: EventTarget): boolean {
      return (
        target instanceof Document || target === parentIframe?.contentDocument
      );
    }

    const currentwindow = parentIframe?.contentWindow || window;

    const iframeOffset = getIframeOffset(parentIframe);

    const target = event.target as HTMLElement;
    const scrollXTarget = isDocument(target)
      ? currentwindow.scrollX
      : target.scrollLeft;
    const scrollYTarget = isDocument(target)
      ? currentwindow.scrollY
      : target.scrollTop;
    const rect = isDocument(target)
      ? {
          left: 0,
          top: 0,
          width: currentwindow.innerWidth,
          height: currentwindow.innerHeight,
        }
      : target.getBoundingClientRect();
    // Throttle logic: throttle each target separately (can be extended to Map)
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
    }
    this.scrollThrottleTimer = window.setTimeout(() => {
      if (this.isRecording) {
        const elementRect = {
          left: Number((rect.left + iframeOffset.x).toFixed(2)),
          top: Number((rect.top + iframeOffset.y).toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        };
        const scrollEvent: RecordedEvent = {
          type: 'scroll',
          elementRect,
          pageInfo: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          value: `${scrollXTarget.toFixed(2)},${scrollYTarget.toFixed(2)}`,
          timestamp: Date.now(),
          hashId: generateHashId('scroll', {
            ...elementRect,
          }),
          element: target,
        };
        this.eventCallback(scrollEvent);
      }
      this.scrollThrottleTimer = null;
    }, this.scrollThrottleDelay);
  };

  // Input event handler
  private handleInput = (
    event: Event,
    parentIframe?: HTMLIFrameElement | null,
  ): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    // checkbox skip collect
    if (target.type === 'checkbox') {
      return;
    }

    const iframeOffset = getIframeOffset(parentIframe);

    const rect = target.getBoundingClientRect();
    const elementRect = {
      left: Number((rect.left + iframeOffset.x).toFixed(2)),
      top: Number((rect.top + iframeOffset.y).toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
    };

    // Throttle logic: clear existing timer and set new one
    if (this.inputThrottleTimer) {
      clearTimeout(this.inputThrottleTimer);
    }
    this.inputThrottleTimer = window.setTimeout(() => {
      if (this.isRecording) {
        const inputEvent: RecordedEvent = {
          type: 'input',
          value: target.type !== 'password' ? target.value : '*****',
          timestamp: Date.now(),
          hashId: generateHashId('input', {
            ...elementRect,
          }),
          element: target,
          inputType: target.type || 'text',
          elementRect,
          pageInfo: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        };

        debugLog('Throttled input event:', {
          value: inputEvent.value,
          timestamp: inputEvent.timestamp,
          target: target.tagName,
          inputType: target.type,
        });

        this.eventCallback(inputEvent);
      }
      this.inputThrottleTimer = null;
    }, this.inputThrottleDelay);
  };

  // Check if it's a label click
  private checkLabelClick(target: HTMLElement): {
    isLabelClick: boolean;
    labelInfo:
      | { htmlFor?: string; textContent?: string; xpath?: string }
      | undefined;
  } {
    let isLabelClick = false;
    let labelInfo:
      | { htmlFor?: string; textContent?: string; xpath?: string }
      | undefined = undefined;

    if (target) {
      if (target.tagName === 'LABEL') {
        isLabelClick = true;
        labelInfo = {
          htmlFor: (target as HTMLLabelElement).htmlFor,
          textContent: target.textContent?.trim(),
          xpath: getElementXpath(target),
        };
      } else {
        let parent = target.parentElement;
        while (parent) {
          if (parent.tagName === 'LABEL') {
            isLabelClick = true;
            labelInfo = {
              htmlFor: (parent as HTMLLabelElement).htmlFor,
              textContent: parent.textContent?.trim(),
              xpath: getElementXpath(parent),
            };
            break;
          }
          parent = parent.parentElement;
        }
      }
    }

    return { isLabelClick, labelInfo };
  }

  // Get recording status
  isActive(): boolean {
    return this.isRecording;
  }

  public optimizeEvent(
    event: RecordedEvent,
    events: RecordedEvent[],
  ): RecordedEvent[] {
    const lastEvent = events[events.length - 1];

    // If it's a click event, add directly
    if (event.type === 'click') {
      // Optimization: if the previous event is a label click and labelInfo.htmlFor equals current input's id, skip
      const lastEvent = getLastLabelClick(events);
      if (event.element) {
        const { isLabelClick, labelInfo } = this.checkLabelClick(event.element);
        if (
          lastEvent &&
          isLabelClick &&
          lastEvent.type === 'click' &&
          lastEvent.isLabelClick &&
          ((lastEvent.labelInfo?.htmlFor &&
            (event.element as HTMLInputElement).id &&
            lastEvent.labelInfo?.htmlFor ===
              (event.element as HTMLInputElement).id) ||
            (labelInfo?.xpath &&
              lastEvent.labelInfo?.xpath &&
              lastEvent.labelInfo?.xpath === labelInfo?.xpath))
        ) {
          debugLog('Skip input event triggered by label click:', event.element);
          return events;
        }
        return [...events, event];
      }
    }

    // If it's an input event, check if it should be skipped or merged
    if (event.type === 'input') {
      // Check if it should be skipped (triggered by label click)
      if (
        lastEvent &&
        lastEvent.type === 'click' &&
        lastEvent.isLabelClick &&
        lastEvent.labelInfo?.htmlFor === event.targetId
      ) {
        debugLog('Skipping input event - triggered by label click:', {
          labelHtmlFor: getLastLabelClick(events)?.labelInfo?.htmlFor,
          inputId: event.targetId,
          element: event.element,
        });
        return events;
      }

      // Check if it should be merged (consecutive inputs on the same input field)
      if (
        lastEvent &&
        lastEvent.type === 'input' &&
        isSameInputTarget(lastEvent, event)
      ) {
        const oldInputEvent = events[events.length - 1];
        const newEvents = [...events];
        newEvents[events.length - 1] = {
          value: (event.element as HTMLInputElement)?.value,
          ...event,
        };
        debugLog('Merging input event:', {
          oldValue: oldInputEvent.value,
          newValue: event.value,
          oldTimestamp: oldInputEvent.timestamp,
          newTimestamp: event.timestamp,
          target: event.targetTagName,
        });
        return newEvents;
      }
    }

    // If it's a scroll event, check if it should be replaced
    if (event.type === 'scroll') {
      if (
        lastEvent &&
        lastEvent.type === 'scroll' &&
        isSameScrollTarget(lastEvent, event)
      ) {
        const oldScrollEvent = events[events.length - 1];
        const newEvents = [...events];
        newEvents[events.length - 1] = event;
        debugLog('Replacing last scroll event with new scroll event:', {
          oldPosition: `${oldScrollEvent.elementRect?.left},${oldScrollEvent.elementRect?.top}`,
          newPosition: `${event.elementRect?.left},${event.elementRect?.top}`,
          oldTimestamp: oldScrollEvent.timestamp,
          newTimestamp: event.timestamp,
          target: event.targetTagName,
        });
        return newEvents;
      }
    }

    // Add other events directly
    return [...events, event];
  }
}

// Convert RecordedEvent to ChromeRecordedEvent
export function convertToChromeEvent(
  event: RecordedEvent,
): ChromeRecordedEvent {
  return {
    type: event.type,
    url: event.url,
    title: event.title,
    value: event.value,
    elementRect: event.elementRect,
    pageInfo: event.pageInfo,
    screenshotBefore: event.screenshotBefore,
    screenshotAfter: event.screenshotAfter,
    elementDescription: event.elementDescription,
    descriptionLoading: event.descriptionLoading,
    screenshotWithBox: event.screenshotWithBox,
    timestamp: event.timestamp,
    hashId: event.hashId,
  };
}

// Convert array of RecordedEvent to array of ChromeRecordedEvent
export function convertToChromeEvents(
  events: RecordedEvent[],
): ChromeRecordedEvent[] {
  return events.map(convertToChromeEvent);
}
