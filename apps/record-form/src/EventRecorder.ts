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
}

// 事件回调函数类型
export type EventCallback = (event: RecordedEvent) => void;

// 事件记录器类
export class EventRecorder {
  private isRecording = false;
  private eventCallback: EventCallback;
  private scrollThrottleTimer: number | null = null;
  private lastScrollEvent: RecordedEvent | null = null;
  private scrollThrottleDelay = 1000; // 1000ms 节流
  private events: RecordedEvent[] = [];
  private lastViewportScroll: { x: number; y: number } | null = null;

  constructor(eventCallback: EventCallback) {
    this.eventCallback = eventCallback;
  }

  // 开始记录
  start(): void {
    if (this.isRecording) return;

    this.isRecording = true;

    // 添加事件监听器
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('scroll', this.handleScroll, true);
    document.addEventListener('input', this.handleInput, true);

    // 添加页面加载事件
    const navigationEvent: RecordedEvent = {
      type: 'navigation',
      url: window.location.href,
      timestamp: Date.now(),
    };
    this.eventCallback(navigationEvent);
  }

  // 停止记录
  stop(): void {
    if (!this.isRecording) return;

    this.isRecording = false;

    // 清理滚动节流定时器
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }

    // 移除事件监听器
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('scroll', this.handleScroll, true);
    document.removeEventListener('input', this.handleInput, true);
  }

  // 点击事件处理器
  private handleClick = (event: MouseEvent): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;

    // 优化：如果上一个事件是 label 点击，并且 labelInfo.htmlFor 等于当前 input 的 id，则跳过
    const lastEvent = this.getLastEvent();
    if (
      lastEvent &&
      lastEvent.type === 'click' &&
      lastEvent.isLabelClick &&
      lastEvent.labelInfo?.htmlFor === target.id
    ) {
      console.log('Skip input event triggered by label click:', target.id);
      return;
    }

    // 检查是否是 label 触发的点击
    const { isLabelClick, labelInfo } = this.checkLabelClick(target);

    // 获取元素相对于 viewport 的位置
    const rect = target.getBoundingClientRect();
    const relativeX = rect.left;
    const relativeY = rect.top;

    const clickEvent: RecordedEvent = {
      type: 'click',
      x: event.clientX,
      y: event.clientY,
      value: '',
      timestamp: Date.now(),
      element: target,
      isLabelClick: isLabelClick,
      labelInfo: labelInfo,
      targetTagName: target?.tagName,
      targetId: target?.id,
      targetClassName: target?.className,
      isTrusted: event.isTrusted,
      detail: event.detail,
      viewportX: relativeX,
      viewportY: relativeY,
    };

    console.log('Click Event:', clickEvent);
    this.events.push(clickEvent);
    this.eventCallback(clickEvent);
  };

  // 滚动事件处理器
  private handleScroll = (event: Event): void => {
    if (!this.isRecording) return;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // 只在滚动位置发生变化时收集
    if (
      this.lastViewportScroll &&
      this.lastViewportScroll.x === scrollX &&
      this.lastViewportScroll.y === scrollY
    ) {
      return; // 没有变化，不收集
    }

    this.lastViewportScroll = { x: scrollX, y: scrollY };

    const target = event.target as HTMLElement;
    const scrollXTarget =
      target instanceof Document ? window.scrollX : target.scrollLeft;
    const scrollYTarget =
      target instanceof Document ? window.scrollY : target.scrollTop;

    // 始终保存最新的滚动事件
    this.lastScrollEvent = {
      type: 'scroll',
      x: scrollXTarget,
      y: scrollYTarget,
      value: `${scrollXTarget},${scrollYTarget}`,
      timestamp: Date.now(),
      element: target,
      targetTagName: target?.tagName,
      targetId: target?.id,
      targetClassName: target?.className,
    };

    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
    }

    this.scrollThrottleTimer = window.setTimeout(() => {
      if (this.lastScrollEvent && this.isRecording) {
        console.log('Throttled Scroll Event:', this.lastScrollEvent);

        // 优化：如有必要，替换最后一个 scroll 事件，否则 push
        if (this.shouldReplaceScrollEvent(this.lastScrollEvent)) {
          this.events[this.events.length - 1] = this.lastScrollEvent;
        } else {
          this.events.push(this.lastScrollEvent);
        }

        this.eventCallback(this.lastScrollEvent);
        this.lastScrollEvent = null;
      }
      this.scrollThrottleTimer = null;
    }, this.scrollThrottleDelay);
  };

  // 输入事件处理器
  private handleInput = (event: Event): void => {
    if (!this.isRecording) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement;

    // 优化：如果上一个事件是 label 点击，并且 labelInfo.htmlFor 等于当前 input 的 id，则跳过
    const lastEvent = this.getLastEvent();
    if (
      lastEvent &&
      lastEvent.type === 'click' &&
      lastEvent.isLabelClick &&
      lastEvent.labelInfo?.htmlFor === target.id
    ) {
      console.log('Skip input event triggered by label click:', target.id);
      return;
    }

    // 获取元素相对于 viewport 的位置
    const rect = target.getBoundingClientRect();
    const relativeX = rect.left;
    const relativeY = rect.top;

    const inputEvent: RecordedEvent = {
      type: 'input',
      value: target.value,
      timestamp: Date.now(),
      element: target,
      targetTagName: target?.tagName,
      targetId: target?.id,
      targetClassName: target?.className,
      inputType: target.type || 'text',
      viewportX: relativeX,
      viewportY: relativeY,
    };

    console.log('Input Event:', inputEvent);
    this.events.push(inputEvent);
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
      // 检查点击的元素本身是否是 label
      if (target.tagName === 'LABEL') {
        isLabelClick = true;
        labelInfo = {
          htmlFor: (target as HTMLLabelElement).htmlFor,
          textContent: target.textContent?.trim(),
        };
      } else {
        // 检查父元素是否是 label
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

  private getLastEvent(): RecordedEvent | undefined {
    return this.events[this.events.length - 1];
  }

  // 检查是否应该替换滚动事件
  private shouldReplaceScrollEvent(scrollEvent: RecordedEvent): boolean {
    const lastEvent = this.getLastEvent();

    // 如果最后一个事件是滚动事件，并且是同一个元素，则替换
    if (
      lastEvent &&
      lastEvent.type === 'scroll' &&
      this.isSameScrollTarget(lastEvent, scrollEvent)
    ) {
      return true;
    }

    return false;
  }

  // 检查是否是同一个滚动目标
  private isSameScrollTarget(
    event1: RecordedEvent,
    event2: RecordedEvent,
  ): boolean {
    // 比较元素标签名和ID
    if (event1.targetTagName !== event2.targetTagName) {
      return false;
    }

    // 如果都有ID，比较ID
    if (event1.targetId && event2.targetId) {
      return event1.targetId === event2.targetId;
    }

    // 如果都没有ID，比较标签名（通常是document或body）
    if (!event1.targetId && !event2.targetId) {
      return event1.targetTagName === event2.targetTagName;
    }

    return false;
  }

  getEvents(): RecordedEvent[] {
    return [...this.events];
  }
}
