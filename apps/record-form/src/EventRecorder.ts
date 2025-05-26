// 事件类型定义
export interface RecordedEvent {
  type: 'click' | 'scroll' | 'input' | 'navigation';
  timestamp: number;
  x?: number;
  y?: number;
  value?: string;
  element?: HTMLElement;
  targetTagName?: string;
  targetId?: string;
  targetClassName?: string;
  isLabelClick?: boolean;
  labelInfo?: {
    htmlFor?: string;
    textContent?: string;
  };
  isTrusted?: boolean;
  detail?: number;
  inputType?: string;
  url?: string;
  viewportX?: number;
  viewportY?: number;
  width?: number; // 元素宽度
  height?: number; // 元素高度
}

// 事件回调函数类型
export type EventCallback = (event: RecordedEvent) => void;

// 检查是否是同一个输入目标
const isSameInputTarget = (
  event1: RecordedEvent,
  event2: RecordedEvent,
): boolean => {
  if (event1.targetTagName !== event2.targetTagName) {
    return false;
  }
  if (event1.targetId && event2.targetId) {
    return event1.targetId === event2.targetId;
  }
  if (!event1.targetId && !event2.targetId) {
    return event1.targetTagName === event2.targetTagName;
  }
  return false;
};

// 检查是否是同一个滚动目标
const isSameScrollTarget = (
  event1: RecordedEvent,
  event2: RecordedEvent,
): boolean => {
  return event1.element === event2.element;
};

// 获取最后一个 label 点击事件
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

// 获取所有可滚动的元素
function getAllScrollableElements(): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const all = document.querySelectorAll<HTMLElement>('body *');
  all.forEach((el) => {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const isScrollableY =
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight;
    const isScrollableX =
      (overflowX === 'auto' || overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth;
    if (isScrollableY || isScrollableX) {
      elements.push(el);
    }
  });
  return elements;
}

// 事件记录器类
export class EventRecorder {
  private isRecording = false;
  private eventCallback: EventCallback;
  private scrollThrottleTimer: number | null = null;
  private scrollThrottleDelay = 200; // 1000ms 节流
  private lastViewportScroll: { x: number; y: number } | null = null;
  private scrollTargets: HTMLElement[] = [];

  constructor(eventCallback: EventCallback) {
    this.eventCallback = eventCallback;
  }

  // 开始记录
  start(): void {
    if (this.isRecording) return;
    this.isRecording = true;

    // 处理滚动目标
    this.scrollTargets = [];
    // 如果没有指定，自动检测所有可滚动区域
    if (this.scrollTargets.length === 0) {
      this.scrollTargets = getAllScrollableElements();
      // 若页面整体可滚动也监听

      this.scrollTargets.push(document.body);
    }

    // 添加事件监听器
    document.addEventListener('click', this.handleClick);
    document.addEventListener('input', this.handleInput);
    document.addEventListener('scroll', this.handleScroll, { passive: true });
    this.scrollTargets.forEach((target) => {
      target.addEventListener('scroll', this.handleScroll, { passive: true });
    });
  }

  // 停止记录
  stop(): void {
    if (!this.isRecording) return;
    this.isRecording = false;
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('input', this.handleInput);
    this.scrollTargets.forEach((target) => {
      target.removeEventListener('scroll', this.handleScroll);
    });
  }

  // 点击事件处理器
  private handleClick = (event: MouseEvent): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;
    const { isLabelClick, labelInfo } = this.checkLabelClick(target);
    const rect = target.getBoundingClientRect();

    const clickEvent: RecordedEvent = {
      type: 'click',
      x: event.clientX,
      y: event.clientY,
      value: '',
      timestamp: Date.now(),
      element: target,
      isLabelClick,
      labelInfo,
      targetTagName: target?.tagName,
      targetId: target?.id,
      targetClassName: target?.className,
      isTrusted: event.isTrusted,
      detail: event.detail,
      viewportX: rect.left,
      viewportY: rect.top,
      width: rect.width, // 添加宽度
      height: rect.height, // 添加高度
    };

    this.eventCallback(clickEvent);
  };

  // 滚动事件处理器
  private handleScroll = (event: Event): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;
    const scrollXTarget =
      target instanceof Document ? window.scrollX : target.scrollLeft;
    const scrollYTarget =
      target instanceof Document ? window.scrollY : target.scrollTop;
    // 节流逻辑：每个目标单独节流（可扩展为 Map）
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
    }
    this.scrollThrottleTimer = window.setTimeout(() => {
      if (this.isRecording) {
        const scrollEvent: RecordedEvent = {
          type: 'scroll',
          x: scrollXTarget,
          y: scrollYTarget,
          value: `${scrollXTarget},${scrollYTarget}`,
          timestamp: Date.now(),
          element: target,
        };
        this.eventCallback(scrollEvent);
      }
      this.scrollThrottleTimer = null;
    }, this.scrollThrottleDelay);
  };

  // 输入事件处理器
  private handleInput = (event: Event): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const rect = target.getBoundingClientRect();

    const inputEvent: RecordedEvent = {
      type: 'input',
      value: target.value,
      timestamp: Date.now(),
      element: target,
      inputType: target.type || 'text',
      viewportX: rect.left,
      viewportY: rect.top,
      width: rect.width, // 添加宽度
      height: rect.height, // 添加高度
    };

    this.eventCallback(inputEvent);
  };

  // 检查是否是 label 点击
  private checkLabelClick(target: HTMLElement): {
    isLabelClick: boolean;
    labelInfo: { htmlFor?: string; textContent?: string } | undefined;
  } {
    let isLabelClick = false;
    let labelInfo: { htmlFor?: string; textContent?: string } | undefined =
      undefined;

    if (target) {
      if (target.tagName === 'LABEL') {
        isLabelClick = true;
        labelInfo = {
          htmlFor: (target as HTMLLabelElement).htmlFor,
          textContent: target.textContent?.trim(),
        };
      } else {
        let parent = target.parentElement;
        while (parent) {
          if (parent.tagName === 'LABEL') {
            isLabelClick = true;
            labelInfo = {
              htmlFor: (parent as HTMLLabelElement).htmlFor,
              textContent: parent.textContent?.trim(),
            };
            break;
          }
          parent = parent.parentElement;
        }
      }
    }

    return { isLabelClick, labelInfo };
  }

  // 获取记录状态
  isActive(): boolean {
    return this.isRecording;
  }

  public optimizeEvent(
    event: RecordedEvent,
    events: RecordedEvent[],
  ): RecordedEvent[] {
    const lastEvent = events[events.length - 1];

    // 如果是点击事件，直接添加
    if (event.type === 'click') {
      return [...events, event];
    }

    // 如果是输入事件，检查是否需要跳过或合并
    if (event.type === 'input') {
      // 检查是否需要跳过（由 label 点击触发）
      if (
        lastEvent &&
        lastEvent.type === 'click' &&
        lastEvent.isLabelClick &&
        lastEvent.labelInfo?.htmlFor === event.targetId
      ) {
        console.log('Skipping input event - triggered by label click:', {
          labelHtmlFor: getLastLabelClick(events)?.labelInfo?.htmlFor,
          inputId: event.targetId,
          element: event.element,
        });
        return events;
      }

      // 检查是否需要合并（同一个输入框的连续输入）
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
        console.log('Merging input event:', {
          oldValue: oldInputEvent.value,
          newValue: event.value,
          oldTimestamp: oldInputEvent.timestamp,
          newTimestamp: event.timestamp,
          target: event.targetTagName,
        });
        return newEvents;
      }
    }

    // 如果是滚动事件，检查是否需要替换
    if (event.type === 'scroll') {
      if (
        lastEvent &&
        lastEvent.type === 'scroll' &&
        isSameScrollTarget(lastEvent, event)
      ) {
        const oldScrollEvent = events[events.length - 1];
        const newEvents = [...events];
        newEvents[events.length - 1] = event;
        console.log('Replacing last scroll event with new scroll event:', {
          oldPosition: `${oldScrollEvent.x},${oldScrollEvent.y}`,
          newPosition: `${event.x},${event.y}`,
          oldTimestamp: oldScrollEvent.timestamp,
          newTimestamp: event.timestamp,
          target: event.targetTagName,
        });
        return newEvents;
      }
    }

    // 其他事件直接添加
    return [...events, event];
  }
}
