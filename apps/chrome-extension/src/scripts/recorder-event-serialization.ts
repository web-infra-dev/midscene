import type { ChromeRecordedEvent } from '@midscene/recorder';

// Keep the injected bridge independent from the recorder package's React UI
// exports. Importing its barrel entry adds the entire timeline and Ant Design
// to the script injected into every recorded page.
export const serializeRecorderEvent = (
  event: ChromeRecordedEvent,
): ChromeRecordedEvent => ({
  type: event.type,
  url: event.url,
  title: event.title,
  value: event.value,
  elementRect: event.elementRect,
  pageInfo: event.pageInfo,
  screenshotBefore: event.screenshotBefore,
  screenshotAfter: event.screenshotAfter,
  semantic: event.semantic,
  elementDescription: event.elementDescription,
  descriptionLoading: event.descriptionLoading,
  screenshotWithBox: event.screenshotWithBox,
  timestamp: event.timestamp,
  hashId: event.hashId,
});
