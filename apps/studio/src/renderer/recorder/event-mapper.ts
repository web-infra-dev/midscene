import type { PlaygroundPageRecordedEvent } from '@midscene/playground';
import type { StudioRecordedEvent, StudioRecorderTarget } from './types';

function resolvePreviewRecorderActionType(
  eventType: PlaygroundPageRecordedEvent['type'],
): string {
  switch (eventType) {
    case 'navigation':
      return 'Navigate';
    case 'click':
      return 'Click';
    case 'drag':
      return 'DragAndDrop';
    case 'input':
      return 'Input';
    case 'keydown':
      return 'KeyboardPress';
    case 'scroll':
      return 'Scroll';
    case 'setViewport':
      return 'SetViewport';
    default:
      return String(eventType);
  }
}

export function mapPreviewRecorderEventToStudioRecordedEvent(input: {
  event: PlaygroundPageRecordedEvent;
  target: StudioRecorderTarget;
}): StudioRecordedEvent {
  const actionType =
    input.event.actionType ??
    resolvePreviewRecorderActionType(input.event.type);
  return {
    ...input.event,
    platformId: input.target.platformId,
    actionType,
    rawPayload:
      input.event.rawPayload && typeof input.event.rawPayload === 'object'
        ? { actionType, ...input.event.rawPayload }
        : {
            actionType,
            type: input.event.type,
            url: input.event.url,
            title: input.event.title,
            value: input.event.value,
            elementRect: input.event.elementRect,
          },
    target: input.target,
    pageInfo: input.event.pageInfo ?? { width: 0, height: 0 },
  };
}
