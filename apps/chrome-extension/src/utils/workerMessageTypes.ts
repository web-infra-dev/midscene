// Shared message types for communicating between Service Worker and UI
export const workerMessageTypes = {
  SAVE_CONTEXT: 'save-context',
  GET_CONTEXT: 'get-context',
  // Background bridge control messages
  BRIDGE_START: 'bridge-start',
  BRIDGE_STOP: 'bridge-stop',
  BRIDGE_GET_STATUS: 'bridge-get-status',
  BRIDGE_SET_AUTO_CONNECT: 'bridge-set-auto-connect',
  BRIDGE_GET_AUTO_CONNECT: 'bridge-get-auto-connect',
  // Bridge status broadcast (from worker to UI)
  BRIDGE_STATUS_CHANGED: 'bridge-status-changed',
  BRIDGE_MESSAGE: 'bridge-message',
} as const;

export type WorkerMessageType =
  (typeof workerMessageTypes)[keyof typeof workerMessageTypes];
