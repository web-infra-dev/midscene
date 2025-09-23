import type { DeviceAction } from '@midscene/core';
import { useCallback } from 'react';
import { useEnvConfig } from '../store/store';
import type {
  FormValue,
  InfoListItem,
  PlaygroundSDKLike,
  StorageProvider,
} from '../types';

import { noReplayAPIs } from '@midscene/playground';
import { BLANK_RESULT } from '../utils/constants';
import { allScriptsFromDump } from '../utils/replay-scripts';

/**
 * Hook for handling playground execution logic
 */
export function usePlaygroundExecution(
  playgroundSDK: PlaygroundSDKLike | null,
  storage: StorageProvider | undefined | null,
  actionSpace: DeviceAction<unknown>[],
  loading: boolean,
  setLoading: (loading: boolean) => void,
  infoList: InfoListItem[],
  setInfoList: React.Dispatch<React.SetStateAction<InfoListItem[]>>,
  replayCounter: number,
  setReplayCounter: React.Dispatch<React.SetStateAction<number>>,
  verticalMode: boolean,
  currentRunningIdRef: React.MutableRefObject<number | null>,
  interruptedFlagRef: React.MutableRefObject<Record<number, boolean>>,
) {
  // Get execution options from environment config
  const { deepThink, screenshotIncluded, domIncluded } = useEnvConfig();
  // Handle form submission and execution
  const handleRun = useCallback(
    async (value: FormValue) => {
      // Check if SDK is available
      if (!playgroundSDK) {
        console.warn('PlaygroundSDK is not available');
        return;
      }

      // Basic validation - specific validation logic would need to be moved to the SDK or passed as a separate function
      const thisRunningId = Date.now();
      const actionType = value.type;

      // Create display content for user input
      const displayContent = `${value.type}: ${value.prompt || JSON.stringify(value.params)}`;

      // Add user input to info list
      const userItem: InfoListItem = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: displayContent,
        timestamp: new Date(),
      };
      setInfoList((prev) => [...prev, userItem]);
      setLoading(true);

      const result = { ...BLANK_RESULT };

      // Add system processing info to list
      const systemItem: InfoListItem = {
        id: `system-${thisRunningId}`,
        type: 'system',
        content: '',
        timestamp: new Date(),
        loading: true,
        loadingProgressText: '',
      };
      setInfoList((prev) => [...prev, systemItem]);

      try {
        currentRunningIdRef.current = thisRunningId;
        interruptedFlagRef.current[thisRunningId] = false;

        // Clear any existing progress callback first to prevent duplicates
        if (playgroundSDK.onProgressUpdate) {
          playgroundSDK.onProgressUpdate(() => {}); // Clear callback
        }

        // Set up fresh progress tracking
        if (playgroundSDK.onProgressUpdate) {
          playgroundSDK.onProgressUpdate((tip: string) => {
            if (interruptedFlagRef.current[thisRunningId]) {
              return;
            }

            setInfoList((prev) => {
              const lastItem = prev[prev.length - 1];
              // Prevent duplicate progress tips
              if (
                lastItem &&
                lastItem.type === 'progress' &&
                lastItem.content === tip
              ) {
                return prev;
              }

              const progressItem: InfoListItem = {
                id: `progress-${thisRunningId}-${Date.now()}`,
                type: 'progress',
                content: tip,
                timestamp: new Date(),
              };
              return [...prev, progressItem];
            });
          });
        }

        // Execute the action using the SDK
        result.result = await playgroundSDK.executeAction(actionType, value, {
          requestId: thisRunningId.toString(),
          deepThink,
          screenshotIncluded,
          domIncluded,
        });

        // For some adapters, result might already include dump and reportHTML
        if (typeof result.result === 'object' && result.result !== null) {
          const resultObj = result.result;
          if (resultObj.dump) result.dump = resultObj.dump;
          if (resultObj.reportHTML) result.reportHTML = resultObj.reportHTML;
          if (resultObj.error) result.error = resultObj.error;

          // If result was wrapped, extract the actual result
          if (resultObj.result !== undefined) {
            result.result = resultObj.result;
          }
        }
      } catch (e: any) {
        result.error = e?.message || String(e);
        console.error('Playground execution error:', e);
      }

      if (interruptedFlagRef.current[thisRunningId]) {
        return;
      }

      setLoading(false);
      currentRunningIdRef.current = null;

      let replayInfo = null;
      let counter = replayCounter;

      // Generate replay info for interaction APIs
      if (result?.dump && !noReplayAPIs.includes(actionType)) {
        const info = allScriptsFromDump(result.dump);
        setReplayCounter((c) => c + 1);
        replayInfo = info;
        counter = replayCounter + 1;
      }

      // Update system message to completed
      setInfoList((prev) =>
        prev.map((item) =>
          item.id === `system-${thisRunningId}`
            ? {
                ...item,
                content: '',
                loading: false,
                loadingProgressText: '',
              }
            : item,
        ),
      );

      // Add result to list
      const resultItem: InfoListItem = {
        id: `result-${thisRunningId}`,
        type: 'result',
        content: 'Execution result',
        timestamp: new Date(),
        result: result,
        loading: false,
        replayScriptsInfo: replayInfo,
        replayCounter: counter,
        loadingProgressText: '',
        verticalMode: verticalMode,
      };

      setInfoList((prev) => [...prev, resultItem]);

      // Store result if storage is available
      if (storage?.saveResult) {
        try {
          await storage.saveResult(resultItem.id, resultItem);
        } catch (error) {
          console.error('Failed to save result:', error);
        }
      }

      // Add separator item to mark the end of this session
      const separatorItem: InfoListItem = {
        id: `separator-${thisRunningId}`,
        type: 'separator',
        content: 'New Session',
        timestamp: new Date(),
      };
      setInfoList((prev) => [...prev, separatorItem]);
    },
    [
      playgroundSDK,
      storage,
      actionSpace,
      setLoading,
      setInfoList,
      replayCounter,
      setReplayCounter,
      verticalMode,
      currentRunningIdRef,
      interruptedFlagRef,
      deepThink,
      screenshotIncluded,
      domIncluded,
    ],
  );

  // Handle stop execution
  const handleStop = useCallback(async () => {
    const thisRunningId = currentRunningIdRef.current;
    if (thisRunningId && playgroundSDK && playgroundSDK.cancelExecution) {
      try {
        await playgroundSDK.cancelExecution(thisRunningId.toString());
        interruptedFlagRef.current[thisRunningId] = true;
        setLoading(false);

        // Clear progress callback on stop to prevent stray tips
        if (playgroundSDK.onProgressUpdate) {
          playgroundSDK.onProgressUpdate(() => {});
        }

        // Update info list to mark as stopped
        setInfoList((prev) =>
          prev.map((item) =>
            item.id === `system-${thisRunningId}` && item.loading
              ? {
                  ...item,
                  content: 'Operation stopped',
                  loading: false,
                  loadingProgressText: '',
                }
              : item,
          ),
        );

        // Add separator item
        const separatorItem: InfoListItem = {
          id: `separator-${thisRunningId}`,
          type: 'separator',
          content: 'New Session',
          timestamp: new Date(),
        };
        setInfoList((prev) => [...prev, separatorItem]);
      } catch (error) {
        console.error('Failed to stop execution:', error);
      }
    }
  }, [
    playgroundSDK,
    currentRunningIdRef,
    interruptedFlagRef,
    setLoading,
    setInfoList,
  ]);

  // Check if execution can be stopped
  const canStop =
    loading &&
    !!currentRunningIdRef.current &&
    !!playgroundSDK &&
    !!playgroundSDK.cancelExecution;

  return {
    handleRun,
    handleStop,
    canStop,
  };
}
