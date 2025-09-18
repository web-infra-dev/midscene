import type { DeviceAction, UIContext } from '@midscene/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createStorageProvider,
  detectBestStorageType,
} from '../component/universal-playground/providers/storage-provider';
import type {
  ContextProvider,
  InfoListItem,
  PlaygroundSDKLike,
  StorageProvider,
} from '../types';
import { WELCOME_MESSAGE_TEMPLATE } from '../utils/constants';

/**
 * Hook for managing playground state
 */
export function usePlaygroundState(
  playgroundSDK: PlaygroundSDKLike | null,
  storage?: StorageProvider | null,
  contextProvider?: ContextProvider,
) {
  // Core state
  const [loading, setLoading] = useState(false);
  const [infoList, setInfoList] = useState<InfoListItem[]>([]);
  const [actionSpace, setActionSpace] = useState<DeviceAction<unknown>[]>([]);
  const [actionSpaceLoading, setActionSpaceLoading] = useState(true);

  // UI Context state
  const [uiContextPreview, setUiContextPreview] = useState<
    UIContext | undefined
  >();

  // Scroll management
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const [verticalMode, setVerticalMode] = useState(false);

  // Progress tracking
  const [replayCounter, setReplayCounter] = useState(0);

  // Refs
  const infoListRef = useRef<HTMLDivElement>(null);
  const currentRunningIdRef = useRef<number | null>(null);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});
  const initializedRef = useRef<boolean>(false);

  // Initialize messages from storage (runs when storage becomes available)
  useEffect(() => {
    const migrateFromOldNamespace = async (): Promise<InfoListItem[]> => {
      // Try to load from old default namespace
      const oldStorage = createStorageProvider(
        detectBestStorageType(),
        'playground-default',
      );

      try {
        if (oldStorage?.loadMessages) {
          const oldMessages = await oldStorage.loadMessages();
          if (oldMessages.length > 1) {
            // More than just welcome message
            console.log('Found data in old namespace, migrating...');

            // Save to new storage
            if (storage?.saveMessages) {
              await storage.saveMessages(oldMessages);
            }

            // Clear old storage to avoid confusion
            if (oldStorage.clearMessages) {
              await oldStorage.clearMessages();
            }

            return oldMessages;
          }
        }
      } catch (error) {
        console.debug('No data found in old namespace:', error);
      }

      return [];
    };

    const initializeMessages = async () => {
      // Create welcome message only once during initialization
      const welcomeMessage: InfoListItem = {
        ...WELCOME_MESSAGE_TEMPLATE,
        id: 'welcome',
        timestamp: new Date(),
      };

      if (storage?.loadMessages) {
        try {
          let storedMessages = await storage.loadMessages();

          // If no messages found in current namespace, try migration
          if (storedMessages.length === 0) {
            storedMessages = await migrateFromOldNamespace();
          }

          // Check if welcome message already exists in stored messages
          const hasWelcomeMessage = storedMessages.some(
            (msg) => msg.id === 'welcome',
          );
          if (hasWelcomeMessage) {
            setInfoList(storedMessages);
          } else {
            setInfoList([welcomeMessage, ...storedMessages]);
          }
        } catch (error) {
          console.error('Failed to load messages:', error);
          setInfoList([welcomeMessage]);
        }
      } else {
        setInfoList([welcomeMessage]);
      }
    };

    // Initialize when storage becomes available, avoid duplicate initialization
    if (storage && !initializedRef.current) {
      initializedRef.current = true;
      initializeMessages();
    } else if (!storage && infoList.length === 0) {
      // Fallback: initialize without storage if none provided
      initializeMessages();
    }
  }, [storage]); // Add storage to dependency array

  // Save messages to storage when they change
  useEffect(() => {
    if (storage?.saveMessages && infoList.length > 1) {
      // Skip if only welcome message
      storage.saveMessages(infoList).catch((error) => {
        // Handle quota exceeded errors gracefully - don't break the UI
        if (
          error instanceof DOMException &&
          error.name === 'QuotaExceededError'
        ) {
          console.warn(
            'Storage quota exceeded - some messages may not be saved persistently',
          );
        } else {
          console.error('Failed to save messages:', error);
        }
      });
    }
  }, [infoList, storage]);

  // Initialize context preview
  useEffect(() => {
    if (!contextProvider?.getUIContext || uiContextPreview) return;

    contextProvider
      .getUIContext()
      .then((context) => setUiContextPreview(context))
      .catch((error) => {
        console.error('Failed to get UI context:', error);
      });
  }, [contextProvider, uiContextPreview]);

  // Initialize action space
  useEffect(() => {
    const loadActionSpace = async () => {
      setActionSpaceLoading(true);
      try {
        if (!playgroundSDK) {
          setActionSpace([]);
          return;
        }
        const context =
          uiContextPreview || (await contextProvider?.getUIContext?.());
        const space = await playgroundSDK.getActionSpace(context);
        setActionSpace(space || []);
      } catch (error) {
        console.error('Failed to load action space:', error);
        setActionSpace([]);
      } finally {
        setActionSpaceLoading(false);
      }
    };

    loadActionSpace();
  }, [playgroundSDK, uiContextPreview, contextProvider]);

  // Responsive layout
  useEffect(() => {
    const sizeThreshold = 750;
    setVerticalMode(window.innerWidth < sizeThreshold);

    const handleResize = () => {
      setVerticalMode(window.innerWidth < sizeThreshold);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scroll management
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (infoListRef.current) {
        infoListRef.current.scrollTop = infoListRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  const checkIfScrolledToBottom = useCallback(() => {
    if (infoListRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = infoListRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setShowScrollToBottomButton(!isAtBottom);
    }
  }, []);

  const handleScrollToBottom = useCallback(() => {
    if (infoListRef.current) {
      infoListRef.current.scrollTo({
        top: infoListRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setShowScrollToBottomButton(false);
    }
  }, []);

  // Auto scroll when info list updates
  useEffect(() => {
    if (infoList.length > 0) {
      scrollToBottom();
    }
  }, [infoList, scrollToBottom]);

  // Scroll event listener
  useEffect(() => {
    const container = infoListRef.current;
    if (container) {
      container.addEventListener('scroll', checkIfScrolledToBottom);
      checkIfScrolledToBottom();

      return () => {
        container.removeEventListener('scroll', checkIfScrolledToBottom);
      };
    }
  }, [checkIfScrolledToBottom]);

  // Clear messages
  const clearInfoList = useCallback(async () => {
    const welcomeMessage: InfoListItem = {
      ...WELCOME_MESSAGE_TEMPLATE,
      id: 'welcome',
      timestamp: new Date(),
    };

    setInfoList([welcomeMessage]);
    if (storage?.clearMessages) {
      try {
        await storage.clearMessages();
      } catch (error) {
        console.error('Failed to clear stored messages:', error);
      }
    }
  }, [storage]);

  // Refresh context
  const refreshContext = useCallback(async () => {
    if (contextProvider?.refreshContext) {
      try {
        const newContext = await contextProvider.refreshContext();
        setUiContextPreview(newContext);
      } catch (error) {
        console.error('Failed to refresh context:', error);
      }
    }
  }, [contextProvider]);

  return {
    // State
    loading,
    setLoading,
    infoList,
    setInfoList,
    actionSpace,
    actionSpaceLoading,
    uiContextPreview,
    setUiContextPreview,
    showScrollToBottomButton,
    verticalMode,
    replayCounter,
    setReplayCounter,

    // Refs
    infoListRef,
    currentRunningIdRef,
    interruptedFlagRef,

    // Actions
    clearInfoList,
    refreshContext,
    handleScrollToBottom,

    // Utils
    scrollToBottom,
  };
}
