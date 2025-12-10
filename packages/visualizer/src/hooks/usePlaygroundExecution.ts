import type { DeviceAction, ExecutionDump } from '@midscene/core';
import { paramStr, typeStr } from '@midscene/core/agent';
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
 * Convert ExecutionDump to GroupedActionDump for replay scripts
 * @param dump - The execution dump containing tasks and their usage information
 * @returns A grouped action dump with model briefs and executions array
 */
function wrapExecutionDumpForReplay(dump: ExecutionDump) {
  const modelBriefsSet = new Set<string>();

  if (dump?.tasks && Array.isArray(dump.tasks)) {
    dump.tasks.forEach((task) => {
      if (task.usage) {
        const { model_name, model_description, intent } = task.usage;
        if (intent && model_name) {
          modelBriefsSet.add(
            model_description
              ? `${intent}/${model_name}(${model_description})`
              : `${intent}/${model_name}`,
          );
        }
      }
    });
  } else {
    console.warn('[wrapExecutionDumpForReplay] Invalid dump structure:', dump);
  }

  const modelBriefs = [...modelBriefsSet];

  return {
    sdkVersion: '',
    groupName: 'Playground Execution',
    modelBriefs,
    executions: [dump],
  };
}

/**
 * Hook for handling playground execution logic
 */
export function usePlaygroundExecution(
  playgroundSDK: PlaygroundSDKLike | null,
  storage: StorageProvider | undefined | null,
  actionSpace: DeviceAction<unknown>[],
  loading: boolean,
  setLoading: (loading: boolean) => void,
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

        // Set up dump update tracking to transform tasks to progress items
        if (playgroundSDK.onDumpUpdate) {
          playgroundSDK.onDumpUpdate(
            (_dump: string, executionDump?: ExecutionDump) => {
              if (interruptedFlagRef.current[thisRunningId] || !executionDump) {
                return;
              }

              setInfoList((prev) => {
                // Update result item with executionDump
                const updatedList = prev.map((item) => {
                  if (item.id === `result-${thisRunningId}` && item.result) {
                    return {
                      ...item,
                      result: { ...item.result, dump: executionDump },
                    };
                  }
                  return item;
                });

                // Find system item to insert progress items after it
                const systemItemIndex = updatedList.findIndex(
                  (item) => item.id === `system-${thisRunningId}`,
                );

                if (systemItemIndex === -1 || !executionDump.tasks?.length) {
                  return updatedList;
                }

                // Build progress items from tasks (filter out unfinished Planning tasks)
                const progressItems: InfoListItem[] = executionDump.tasks
                  .filter((task) => {
                    // Only show finished Planning tasks with output.log
                    if (task.type === 'Planning' && task.subType === 'Plan') {
                      return task.status === 'finished' && task.output?.log;
                    }
                    return true;
                  })
                  .map((task, index) => ({
                    id: `progress-${thisRunningId}-task-${index}`,
                    type: 'progress' as const,
                    content: (() => {
                      const action = typeStr(task);
                      const description = paramStr(task);
                      return description ? `${action} - ${description}` : action;
                    })(),
                    timestamp: new Date(task.timing?.start || Date.now()),
                  }));

                // Remove old progress items and insert new ones after system item
                const withoutProgress = updatedList.filter(
                  (item) =>
                    !(
                      item.type === 'progress' &&
                      item.id.startsWith(`progress-${thisRunningId}-`)
                    ),
                );

                return [
                  ...withoutProgress.slice(0, systemItemIndex + 1),
                  ...progressItems,
                  ...withoutProgress.slice(systemItemIndex + 1),
                ];
              });
            },
          );
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
          if (resultObj.dump) {
            result.dump = resultObj.dump;
          }
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

        // Try to extract dump and reportHTML from error object
        // The adapter may attach these even on error
        if (typeof e === 'object' && e !== null) {
          if (e.dump) result.dump = e.dump;
          if (e.reportHTML) result.reportHTML = e.reportHTML;
        }
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
        if (result.dump.tasks && Array.isArray(result.dump.tasks)) {
          const groupedDump = wrapExecutionDumpForReplay(result.dump);
          const info = allScriptsFromDump(groupedDump);
          setReplayCounter((c) => c + 1);
          replayInfo = info;
          counter = replayCounter + 1;
        }
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
