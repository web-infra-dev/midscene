import type { ExternalRunRequest } from '../../types';

export async function preparePlaygroundExecution({
  clearTimeline,
  clearTimelineBeforeRun = false,
  onBeforeExecutionStart,
}: {
  clearTimeline: () => Promise<void>;
  clearTimelineBeforeRun?: boolean;
  onBeforeExecutionStart?: () => Promise<void> | void;
}) {
  await onBeforeExecutionStart?.();
  if (clearTimelineBeforeRun) {
    await clearTimeline();
  }
}

export function shouldExecuteExternalRunRequest({
  request,
  handledRequestIds,
  lastRequestId,
  sdkReady,
  messagesInitialized,
}: {
  request?: ExternalRunRequest | null;
  handledRequestIds?: ReadonlySet<string>;
  lastRequestId: string | null;
  sdkReady: boolean;
  messagesInitialized: boolean;
}) {
  return Boolean(
    request &&
      request.id !== lastRequestId &&
      !handledRequestIds?.has(request.id) &&
      sdkReady &&
      messagesInitialized,
  );
}
