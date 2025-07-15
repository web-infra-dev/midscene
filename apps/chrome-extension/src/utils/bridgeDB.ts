import { IndexedDBManager, withErrorHandling } from './baseDB';

// Database configuration
const DB_NAME = 'midscene_bridge';
const DB_VERSION = 1;
const BRIDGE_MESSAGES_STORE = 'bridge_messages';

// Bridge message interface
export interface IndexedDBBridgeMessage {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  time?: string;
}

// Bridge message result interface for external use
export interface BridgeMessage {
  id: string;
  type: string;
  content: string;
  timestamp: Date;
  time?: string;
}

// Database manager instance
const bridgeDbManager = new IndexedDBManager(DB_NAME, DB_VERSION, [
  { name: BRIDGE_MESSAGES_STORE, keyPath: 'id' },
]);

// get bridge messages from IndexedDB
export const getBridgeMsgsFromStorage = async (): Promise<BridgeMessage[]> => {
  return (
    (await withErrorHandling(
      async () => {
        const messages = await bridgeDbManager.getAll<IndexedDBBridgeMessage>(
          BRIDGE_MESSAGES_STORE,
          true,
        );

        return messages.map((msg) => ({
          id: msg.id,
          type: msg.type,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          time: msg.time,
        }));
      },
      'Failed to get bridge messages from IndexedDB',
      [],
    )) ?? []
  );
};

// store bridge messages to IndexedDB
export const storeBridgeMsgsToStorage = async (
  messageList: any[],
): Promise<void> => {
  await withErrorHandling(async () => {
    // Clear existing bridge messages first
    await bridgeDbManager.clear(BRIDGE_MESSAGES_STORE);

    const msgs = messageList
      .filter((item) => item.type === 'system' || item.type === 'status')
      .map((item) => ({
        id: item.id,
        type: item.type,
        content: item.content,
        timestamp: item.timestamp,
        time: item.time,
      }));

    // Store each bridge message
    await Promise.all(
      msgs.map((msg, index) => {
        const data: IndexedDBBridgeMessage = {
          id: msg.id || `bridge-msg-${index}`,
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp
            ? msg.timestamp.getTime()
            : Date.now() + index,
          time: msg.time,
        };

        return bridgeDbManager.put(BRIDGE_MESSAGES_STORE, data);
      }),
    );
  }, 'Failed to store bridge messages');
};

// clear stored bridge messages
export const clearStoredBridgeMessages = async (): Promise<void> => {
  await withErrorHandling(
    () => bridgeDbManager.clear(BRIDGE_MESSAGES_STORE),
    'Failed to clear bridge messages from IndexedDB',
  );
};

// get bridge message count
export const getBridgeMessageCount = async (): Promise<number> => {
  return (
    (await withErrorHandling(
      () => bridgeDbManager.count(BRIDGE_MESSAGES_STORE),
      'Failed to get bridge message count',
      0,
    )) ?? 0
  );
};
