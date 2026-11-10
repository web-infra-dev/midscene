import type { ChromeRecordedEvent } from '@midscene/recorder-ui';

/** Serialize event batches and retain only successfully acknowledged versions. */
export class RecorderEventSender {
  private acknowledgedEvents: ChromeRecordedEvent[] = [];
  private queue = Promise.resolve();

  constructor(
    private prepareEvents: (
      events: ChromeRecordedEvent[],
      immediate: boolean,
    ) => Promise<void>,
    private sendEvent: (
      event: ChromeRecordedEvent,
      index: number,
      total: number,
      replacesHashId?: string,
    ) => Promise<void>,
  ) {}

  send(events: ChromeRecordedEvent[], immediate: boolean): Promise<void> {
    const deliver = async () => {
      await this.prepareEvents(events, immediate);
      for (const [index, event] of events.entries()) {
        if (this.acknowledgedEvents[index] === event) continue;
        await this.sendEvent(
          event,
          index,
          events.length,
          this.acknowledgedEvents[index]?.hashId,
        );
        this.acknowledgedEvents[index] = event;
      }
    };
    this.queue = this.queue.then(deliver, deliver);
    return this.queue;
  }
}
