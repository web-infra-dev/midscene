// Shared message types for communicating between Service Worker and UI
export const workerMessageTypes = {
  SAVE_CONTEXT: 'save-context',
  GET_CONTEXT: 'get-context',
  // Background bridge control messages
  BRIDGE_START: 'bridge-start',
  BRIDGE_STOP: 'bridge-stop',
  BRIDGE_GET_STATUS: 'bridge-get-status',
  BRIDGE_GET_PERMISSION: 'bridge-get-permission',
  BRIDGE_RESET_PERMISSION: 'bridge-reset-permission',
  BRIDGE_GET_MESSAGES: 'bridge-get-messages',
  BRIDGE_CLEAR_MESSAGES: 'bridge-clear-messages',
  // Bridge status broadcast (from worker to UI)
  BRIDGE_STATUS_CHANGED: 'bridge-status-changed',
  BRIDGE_MESSAGE: 'bridge-message',
  // Bridge connection confirmation (from confirm popup to worker)
  BRIDGE_CONFIRM_RESPONSE: 'bridge-confirm-response',
} as const;

export type WorkerMessageType =
  (typeof workerMessageTypes)[keyof typeof workerMessageTypes];
