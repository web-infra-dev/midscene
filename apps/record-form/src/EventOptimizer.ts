import type { RecordedEvent } from './EventRecorder';

// 事件优化器类
export class EventOptimizer {
  private events: RecordedEvent[] = [];

  // 添加事件，并进行优化处理
  addEvent(event: RecordedEvent): RecordedEvent[] {
    // 如果是点击事件，直接添加
    if (event.type === 'click') {
      this.events.push(event);
      return [...this.events];
    }

    // 如果是输入事件，检查是否需要跳过或合并
    if (event.type === 'input') {
      const shouldSkip = this.shouldSkipInputEvent(event);
      if (shouldSkip) {
        console.log('Skipping input event - triggered by label click:', {
          labelHtmlFor: this.getLastLabelClick()?.labelInfo?.htmlFor,
          inputId: event.targetId,
          element: event.element,
        });
        return [...this.events];
      }
      const shouldMerge = this.shouldMergeInputEvent(event);
      if (shouldMerge) {
        // 获取旧的输入事件信息用于日志
        const oldInputEvent = this.events[this.events.length - 1];
        // 用新的输入事件替换最后一个输入事件
        this.events[this.events.length - 1] = {
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
        return [...this.events];
      }
    }

    // 如果是滚动事件，检查是否需要替换上一个滚动事件
    if (event.type === 'scroll') {
      const shouldReplace = this.shouldReplaceScrollEvent(event);
      if (shouldReplace) {
        // 获取旧的滚动事件信息用于日志
        const oldScrollEvent = this.events[this.events.length - 1];
        // 用新的滚动事件替换最后一个滚动事件
        this.events[this.events.length - 1] = event;
        console.log('Replacing last scroll event with new scroll event:', {
          oldPosition: `${oldScrollEvent.x},${oldScrollEvent.y}`,
          newPosition: `${event.x},${event.y}`,
          oldTimestamp: oldScrollEvent.timestamp,
          newTimestamp: event.timestamp,
          target: event.targetTagName,
        });
        return [...this.events];
      }
    }

    // 其他事件直接添加
    this.events.push(event);
    return [...this.events];
  }

  // 检查是否应该跳过输入事件
  private shouldSkipInputEvent(inputEvent: RecordedEvent): boolean {
    const lastEvent = this.getLastEvent();

    // 如果上一个事件是 label 点击，并且 htmlFor 与当前 input 的 id 相等
    if (
      lastEvent &&
      lastEvent.type === 'click' &&
      lastEvent.isLabelClick &&
      lastEvent.labelInfo?.htmlFor === inputEvent.targetId
    ) {
      return true;
    }

    return false;
  }

  // 检查是否应该合并输入事件
  private shouldMergeInputEvent(inputEvent: RecordedEvent): boolean {
    const lastEvent = this.getLastEvent();

    // 如果上一个事件是输入事件，并且是同一个输入目标
    if (
      lastEvent &&
      lastEvent.type === 'input' &&
      this.isSameInputTarget(lastEvent, inputEvent)
    ) {
      return true;
    }

    return false;
  }

  // 检查是否是同一个输入目标
  private isSameInputTarget(
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

  // 获取最后一个事件
  private getLastEvent(): RecordedEvent | undefined {
    return this.events[this.events.length - 1];
  }

  // 获取最后一个 label 点击事件
  private getLastLabelClick(): RecordedEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (event.type === 'click' && event.isLabelClick) {
        return event;
      }
    }
    return undefined;
  }

  // 获取所有事件
  getEvents(): RecordedEvent[] {
    return [...this.events];
  }

  // 清空事件
  clear(): void {
    this.events = [];
  }

  // 获取事件数量
  getEventCount(): number {
    return this.events.length;
  }
}
