import type { DeviceAction, UIContext } from '@midscene/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ContextProvider,
  InfoListItem,
  PlaygroundSDKLike,
  StorageProvider,
} from '../types';
import { WELCOME_MESSAGE_TEMPLATE } from '../types';

/**
 * Hook for managing playground state
 */
export function usePlaygroundState(
  playgroundSDK: PlaygroundSDKLike,
  storage?: StorageProvider,
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

  // Welcome message with unique ID
  const welcomeMessage: InfoListItem = {
    ...WELCOME_MESSAGE_TEMPLATE,
    id: 'welcome',
    timestamp: new Date(),
  };

  // Initialize messages from storage
  useEffect(() => {
    const initializeMessages = async () => {
      if (storage?.loadMessages) {
        try {
          const storedMessages = await storage.loadMessages();
          setInfoList([welcomeMessage, ...storedMessages]);
        } catch (error) {
          console.error('Failed to load messages:', error);
          setInfoList([welcomeMessage]);
        }
      } else {
        setInfoList([welcomeMessage]);
      }
    };

    initializeMessages();
  }, [storage]);

  // Save messages to storage when they change
  useEffect(() => {
    if (storage?.saveMessages && infoList.length > 1) {
      // Skip if only welcome message
      storage.saveMessages(infoList).catch((error) => {
        console.error('Failed to save messages:', error);
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
    setInfoList([welcomeMessage]);
    if (storage?.clearMessages) {
      try {
        await storage.clearMessages();
      } catch (error) {
        console.error('Failed to clear stored messages:', error);
      }
    }
  }, [storage, welcomeMessage]);

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
