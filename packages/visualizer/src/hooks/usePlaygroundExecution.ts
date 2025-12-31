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

import { BLANK_RESULT } from '../utils/constants';
import { allScriptsFromDump } from '../utils/replay-scripts';

/**
 * Format error object to string
 */
function formatError(error: any): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error?.dump?.error) return error.dump.error;
  if (error.message) return String(error.message);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Build progress content string from task information
 * @param task - The execution task to build content from
 * @returns Formatted content string with action and optional description
 */
function buildProgressContent(task: any): string {
  const action = typeStr(task);
  const description = paramStr(task);
  return description ? `${action} - ${description}` : action;
}

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
            (_: string, executionDump?: ExecutionDump) => {
              if (
                interruptedFlagRef.current[thisRunningId] ||
                !executionDump?.tasks?.length
              ) {
                return;
              }

              const progressItems: InfoListItem[] = executionDump.tasks.map(
                (task, index) => ({
                  id: `progress-${thisRunningId}-task-${index}`,
                  type: 'progress' as const,
                  content: buildProgressContent(task),
                  timestamp: new Date(task.timing?.start || Date.now()),
                  result: task.error
                    ? { error: formatError(task.error), result: null }
                    : undefined,
                }),
              );

              // Replace this session's progress items with new ones
              setInfoList((prev) => {
                const systemItemIndex = prev.findIndex(
                  (item) => item.id === `system-${thisRunningId}`,
                );

                if (systemItemIndex === -1) {
                  return prev;
                }

                // Remove old progress items for this session
                const listWithoutCurrentProgress = prev.filter(
                  (item) =>
                    !(
                      item.type === 'progress' &&
                      item.id.startsWith(`progress-${thisRunningId}-`)
                    ),
                );

                // Insert new progress items after system item
                return [
                  ...listWithoutCurrentProgress.slice(0, systemItemIndex + 1),
                  ...progressItems,
                  ...listWithoutCurrentProgress.slice(systemItemIndex + 1),
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
          if (resultObj.error) result.error = formatError(resultObj.error);

          // If result was wrapped, extract the actual result
          if (resultObj.result !== undefined) {
            result.result = resultObj.result;
          }
        }
      } catch (e: any) {
        result.error = formatError(e);
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

      // Generate replay info for all APIs (including noReplayAPIs)
      // This allows noReplayAPIs to display both output and report
      if (result?.dump) {
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
        actionType: actionType, // Save actionType for display logic
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
        // Cancel execution - may return execution data directly
        const cancelResult = await playgroundSDK.cancelExecution(
          thisRunningId.toString(),
        );

        // If cancelExecution didn't return data, try getCurrentExecutionData as fallback
        let executionData: {
          dump: ExecutionDump | null;
          reportHTML: string | null;
        } | null = null;

        if (cancelResult) {
          executionData = cancelResult;
        } else if (playgroundSDK.getCurrentExecutionData) {
          try {
            executionData = await playgroundSDK.getCurrentExecutionData();
          } catch (error) {
            console.error('Failed to get execution data before stop:', error);
          }
        }

        interruptedFlagRef.current[thisRunningId] = true;
        setLoading(false);

        // Clear progress callback on stop to prevent stray tips
        if (playgroundSDK.onProgressUpdate) {
          playgroundSDK.onProgressUpdate(() => {});
        }

        // Clear dump update callback
        if (playgroundSDK.onDumpUpdate) {
          playgroundSDK.onDumpUpdate(() => {});
        }

        // Update system message to mark as stopped
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

        // Add result item if we have execution data
        if (executionData && (executionData.dump || executionData.reportHTML)) {
          // Generate replayScriptsInfo from dump, just like in handleRun
          let replayInfo = null;
          let counter = replayCounter;

          if (
            executionData.dump?.tasks &&
            Array.isArray(executionData.dump.tasks)
          ) {
            const groupedDump = wrapExecutionDumpForReplay(executionData.dump);
            replayInfo = allScriptsFromDump(groupedDump);
            setReplayCounter((c) => c + 1);
            counter = replayCounter + 1;
          }

          const resultItem: InfoListItem = {
            id: `stop-result-${thisRunningId}`,
            type: 'result',
            content: 'Execution stopped by user',
            timestamp: new Date(),
            result: {
              result: null,
              dump: executionData.dump,
              reportHTML: executionData.reportHTML,
              error: null,
            },
            loading: false,
            verticalMode,
            replayScriptsInfo: replayInfo,
            replayCounter: counter,
          };
          setInfoList((prev) => [...prev, resultItem]);
        } else {
          // If no execution data, show simple stop message
          const stopItem: InfoListItem = {
            id: `stop-${thisRunningId}`,
            type: 'system',
            content: 'Operation stopped',
            timestamp: new Date(),
            loading: false,
          };
          setInfoList((prev) => [...prev, stopItem]);
        }

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
    verticalMode,
    replayCounter,
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
