import './index.less';
import { useAllCurrentTasks, useExecutionDump } from '@/components/store';
import type {
  AIUsageInfo,
  ExecutionTask,
  ExecutionTaskPlanningLocate,
} from '@midscene/core';
import { typeStr } from '@midscene/core/agent';
import {
  type AnimationScript,
  iconForStatus,
  timeCostStrElement,
} from '@midscene/visualizer';
import { Checkbox, Tag, Tooltip } from 'antd';
import { useEffect, useMemo } from 'react';
import CameraIcon from '../../icons/camera.svg?react';
import MessageIcon from '../../icons/message.svg?react';
import PlayIcon from '../../icons/play.svg?react';
import type { PlaywrightTasks } from '../../types';
import ReportOverview from '../report-overview';

// Extended task type with searchAreaUsage
type ExecutionTaskWithSearchAreaUsage = ExecutionTask & {
  searchAreaUsage?: AIUsageInfo;
};

// Table row data type
type TableRowData = {
  key: string;
  isGroupHeader?: boolean;
  groupName?: string;
  task?: ExecutionTaskWithSearchAreaUsage;
};

interface SidebarProps {
  dumps?: PlaywrightTasks[];
  proModeEnabled?: boolean;
  onProModeChange?: (checked: boolean) => void;
  replayAllScripts?: AnimationScript[] | null;
  replayAllMode?: boolean;
  setReplayAllMode?: (mode: boolean) => void;
}

const Sidebar = (props: SidebarProps = {}): JSX.Element => {
  const {
    dumps,
    proModeEnabled = false,
    onProModeChange,
    setReplayAllMode,
  } = props;
  const groupedDump = useExecutionDump((store) => store.dump);
  const setActiveTask = useExecutionDump((store) => store.setActiveTask);
  const activeTask = useExecutionDump((store) => store.activeTask);
  const setHoverTask = useExecutionDump((store) => store.setHoverTask);

  const setHoverPreviewConfig = useExecutionDump(
    (store) => store.setHoverPreviewConfig,
  );
  const allTasks = useAllCurrentTasks();
  const currentSelectedIndex = allTasks?.findIndex(
    (task) => task === activeTask,
  );

  // Prepare table data source
  const tableData = useMemo<TableRowData[]>(() => {
    if (!groupedDump) return [];

    const rows: TableRowData[] = [];
    groupedDump.executions.forEach((execution, executionIndex) => {
      // Add group header row
      rows.push({
        key: `group-${executionIndex}`,
        isGroupHeader: true,
        groupName: execution.name,
      });

      // Add task rows
      execution.tasks.forEach((task, taskIndex) => {
        rows.push({
          key: `task-${executionIndex}-${taskIndex}`,
          task: task as ExecutionTaskWithSearchAreaUsage,
        });
      });
    });

    return rows;
  }, [groupedDump]);

  const hasCachedInput = useMemo(() => {
    if (!groupedDump) return false;

    return groupedDump.executions.some((execution) =>
      execution.tasks.some((task) => {
        const mainCached = task.usage?.cached_input || 0;
        const searchAreaCached =
          (task as ExecutionTaskWithSearchAreaUsage).searchAreaUsage
            ?.cached_input || 0;
        return mainCached + searchAreaCached > 0;
      }),
    );
  }, [groupedDump]);

  // Helper functions for rendering
  const getStatusIcon = (task: ExecutionTaskWithSearchAreaUsage) => {
    const isFinished = task.status === 'finished';
    const isError = isFinished && (task.error || task.errorMessage);

    if (isError) {
      return iconForStatus('failed');
    }

    const isAssertFinishedWithWarning =
      isFinished && task.subType === 'WaitFor' && task.output === false;

    if (isAssertFinishedWithWarning) {
      return iconForStatus('finishedWithWarning');
    }

    const isAssertFailed =
      task.subType === 'Assert' && isFinished && task.output === false;

    if (isAssertFailed) {
      return iconForStatus('failed');
    }

    return iconForStatus(task.status);
  };

  const getTitleIcon = (task: ExecutionTaskWithSearchAreaUsage) => {
    return task.type === 'Planning' && task.subType !== 'LoadYaml' ? (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginLeft: '4px',
        }}
      >
        <CameraIcon width={16} height={16} />
      </span>
    ) : null;
  };

  const getCacheTag = (task: ExecutionTaskWithSearchAreaUsage) => {
    return task.hitBy?.from === 'Cache' ? (
      <Tag
        className="cache-tag"
        style={{
          padding: '0 4px',
          marginLeft: '4px',
          marginRight: 0,
          lineHeight: '16px',
        }}
        bordered={false}
      >
        Cache
      </Tag>
    ) : null;
  };

  const getDeepThinkTag = (task: ExecutionTaskWithSearchAreaUsage) => {
    return (task as ExecutionTaskPlanningLocate)?.param?.deepThink ? (
      <Tag
        className="deepthink-tag"
        bordered={false}
        style={{
          padding: '0 4px',
          marginLeft: '4px',
          marginRight: 0,
          lineHeight: '16px',
        }}
      >
        DeepThink
      </Tag>
    ) : null;
  };

  const getStatusText = (task: ExecutionTaskWithSearchAreaUsage) => {
    if (typeof task.timing?.cost === 'number') {
      return timeCostStrElement(task.timing.cost);
    }
    return task.status;
  };

  const getTokens = (
    task: ExecutionTaskWithSearchAreaUsage,
    type: 'prompt' | 'completion',
  ) => {
    const key = type === 'prompt' ? 'prompt_tokens' : 'completion_tokens';
    const mainUsage = task.usage?.[key] || 0;
    const searchAreaUsage = task.searchAreaUsage?.[key] || 0;
    const total = mainUsage + searchAreaUsage;
    return total > 0 ? total : '-';
  };

  const getCachedTokens = (task: ExecutionTaskWithSearchAreaUsage) => {
    const mainCached = task.usage?.cached_input || 0;
    const searchAreaCached = task.searchAreaUsage?.cached_input || 0;
    const total = mainCached + searchAreaCached;
    return total > 0 ? total : '-';
  };

  const typeColumnMinWidth = 160;

  // Calculate dynamic column widths based on content
  const dynamicWidths = useMemo(() => {
    if (!groupedDump) {
      return {
        time: 80,
        intent: 70,
        model: 100,
        prompt: 90,
        cached: 100,
        completion: 110,
      };
    }

    let maxTimeLength = 0;
    let maxIntentLength = 0;
    let maxModelLength = 0;
    let maxPromptLength = 0;
    let maxCachedLength = 0;
    let maxCompletionLength = 0;

    groupedDump.executions.forEach((execution) => {
      execution.tasks.forEach((task) => {
        // Time cost length (e.g., "1.23s", "123ms") or status text
        if (typeof task.timing?.cost === 'number') {
          const timeStr =
            task.timing.cost < 1000
              ? `${task.timing.cost}ms`
              : `${(task.timing.cost / 1000).toFixed(2)}s`;
          maxTimeLength = Math.max(maxTimeLength, timeStr.length);
        } else {
          // Measure status text length when no timing cost
          const statusText = task.status || '';
          maxTimeLength = Math.max(maxTimeLength, statusText.length);
        }

        // Intent length
        const intent = task.usage?.intent || '';
        maxIntentLength = Math.max(maxIntentLength, String(intent).length);

        // Model name length
        const modelName = task.usage?.model_name || '';
        maxModelLength = Math.max(maxModelLength, modelName.length);

        // Token numbers length
        const promptTokens = String(
          (task.usage?.prompt_tokens || 0) +
            ((task as ExecutionTaskWithSearchAreaUsage).searchAreaUsage
              ?.prompt_tokens || 0),
        );
        const cachedTokens = String(
          (task.usage?.cached_input || 0) +
            ((task as ExecutionTaskWithSearchAreaUsage).searchAreaUsage
              ?.cached_input || 0),
        );
        const completionTokens = String(
          (task.usage?.completion_tokens || 0) +
            ((task as ExecutionTaskWithSearchAreaUsage).searchAreaUsage
              ?.completion_tokens || 0),
        );

        maxPromptLength = Math.max(maxPromptLength, promptTokens.length);
        maxCachedLength = Math.max(maxCachedLength, cachedTokens.length);
        maxCompletionLength = Math.max(
          maxCompletionLength,
          completionTokens.length,
        );
      });
    });

    // Calculate widths: monospace char width ~7-8px + padding
    // Use 9px per char to account for padding and ensure no overflow
    const charWidth = 9;
    const minWidths = {
      time: 60,
      intent: 60,
      model: 80,
      prompt: 70,
      cached: 80,
      completion: 90,
    };
    const maxWidth = 200;

    return {
      time: Math.min(
        maxWidth,
        Math.max(minWidths.time, maxTimeLength * charWidth + 20),
      ),
      intent: Math.min(
        maxWidth,
        Math.max(minWidths.intent, maxIntentLength * charWidth + 20),
      ),
      model: Math.min(
        maxWidth,
        Math.max(minWidths.model, maxModelLength * charWidth + 20),
      ),
      prompt: Math.min(
        maxWidth,
        Math.max(minWidths.prompt, maxPromptLength * charWidth + 20),
      ),
      cached: Math.min(
        maxWidth,
        Math.max(minWidths.cached, maxCachedLength * charWidth + 20),
      ),
      completion: Math.min(
        maxWidth,
        Math.max(minWidths.completion, maxCompletionLength * charWidth + 20),
      ),
    };
  }, [groupedDump]);

  // Define column configuration
  const columnConfig = useMemo(() => {
    return [
      { key: 'type', label: 'Type', width: typeColumnMinWidth, flex: true },
      { key: 'time', label: 'Time', width: dynamicWidths.time },
      ...(proModeEnabled
        ? [
            { key: 'intent', label: 'Intent', width: dynamicWidths.intent },
            { key: 'model', label: 'Model', width: dynamicWidths.model },
            {
              key: 'prompt',
              label: 'Prompt',
              width: dynamicWidths.prompt,
              tooltip: 'Input tokens (including cached input tokens) usage',
            },
            ...(hasCachedInput
              ? [
                  {
                    key: 'cached',
                    label: 'Cached',
                    width: dynamicWidths.cached,
                    tooltip: 'Cached input tokens usage',
                  },
                ]
              : []),
            {
              key: 'completion',
              label: 'Completion',
              width: dynamicWidths.completion,
              tooltip: 'Output tokens generated by the AI model',
            },
          ]
        : []),
    ];
  }, [hasCachedInput, proModeEnabled, dynamicWidths]);

  // Calculate total tokens by model
  const tokensByModel = useMemo(() => {
    const modelStats = new Map<
      string,
      { prompt: number; cachedInput: number; completion: number }
    >();

    groupedDump?.executions
      .flatMap((e) => e.tasks)
      .forEach((task) => {
        // Skip tasks without usage information
        if (!task.usage) return;

        const modelName = task.usage.model_name || 'Unknown';
        const mainPrompt = task.usage.prompt_tokens || 0;
        const mainCompletion = task.usage.completion_tokens || 0;
        const mainCached = task.usage.cached_input || 0;
        const searchAreaPrompt =
          (task as ExecutionTaskWithSearchAreaUsage).searchAreaUsage
            ?.prompt_tokens || 0;
        const searchAreaCompletion =
          (task as ExecutionTaskWithSearchAreaUsage).searchAreaUsage
            ?.completion_tokens || 0;
        const searchAreaCached =
          (task as ExecutionTaskWithSearchAreaUsage).searchAreaUsage
            ?.cached_input || 0;

        const existing = modelStats.get(modelName) || {
          prompt: 0,
          cachedInput: 0,
          completion: 0,
        };
        modelStats.set(modelName, {
          prompt: existing.prompt + mainPrompt + searchAreaPrompt,
          cachedInput: existing.cachedInput + mainCached + searchAreaCached,
          completion:
            existing.completion + mainCompletion + searchAreaCompletion,
        });
      });

    return modelStats;
  }, [groupedDump]);

  const totalPromptTokens = Array.from(tokensByModel.values()).reduce(
    (sum, stats) => sum + stats.prompt,
    0,
  );

  const totalCachedInputTokens = Array.from(tokensByModel.values()).reduce(
    (sum, stats) => sum + stats.cachedInput,
    0,
  );

  const totalCompletionTokens = Array.from(tokensByModel.values()).reduce(
    (sum, stats) => sum + stats.completion,
    0,
  );

  // Keyboard navigation
  useEffect(() => {
    // all tasks
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!allTasks?.length || allTasks?.length <= 1) {
        return;
      }
      // should be command / ctrl + arrow
      if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const nextIndex = currentSelectedIndex - 1;
        if (nextIndex < 0) {
          return;
        }
        const nextTask = allTasks[nextIndex];
        setActiveTask(nextTask);
      } else if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const nextIndex = currentSelectedIndex + 1;
        if (nextIndex >= allTasks.length) {
          return;
        }
        const nextTask = allTasks[nextIndex];
        setActiveTask(nextTask);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentSelectedIndex, allTasks, setActiveTask]);

  const sideList = groupedDump ? (
    [groupedDump].map((group, groupIndex) => {
      return (
        <div key={groupIndex}>
          <ReportOverview title={group.groupName} dumps={dumps} />
        </div>
      );
    })
  ) : (
    <span>no tasks</span>
  );

  // Render cell content based on column key
  const renderCellContent = (
    columnKey: string,
    task: ExecutionTaskWithSearchAreaUsage,
  ) => {
    switch (columnKey) {
      case 'type': {
        const taskName =
          task.type === 'Planning' && task.output?.log
            ? `${typeStr(task)} - ${task.output?.log}`
            : typeStr(task);
        return (
          <div className="title">
            <span className="status-icon">{getStatusIcon(task)}</span>
            <span>{taskName}</span>
            {getTitleIcon(task)}
            {getCacheTag(task)}
            {getDeepThinkTag(task)}
          </div>
        );
      }
      case 'time':
        return getStatusText(task);
      case 'intent': {
        const intent = task.usage?.intent || '-';
        return <span title={intent}>{intent}</span>;
      }
      case 'model': {
        const modelName = task.usage?.model_name || '-';
        return <span title={modelName}>{modelName}</span>;
      }
      case 'prompt':
        return getTokens(task, 'prompt');
      case 'cached':
        return getCachedTokens(task);
      case 'completion':
        return getTokens(task, 'completion');
      default:
        return null;
    }
  };

  const executionContent = groupedDump ? (
    <div className="execution-info-section">
      <div className="execution-info-title">
        <div className="execution-info-title-left">
          <MessageIcon width={16} height={16} />
          Execution
        </div>
        <div className="execution-info-title-right">
          <Checkbox
            className="token-usage-checkbox"
            checked={proModeEnabled}
            onChange={(e) => onProModeChange?.(e.target.checked)}
          >
            Model Call Details
          </Checkbox>
        </div>
      </div>
      <div className="executions-wrapper">
        <div className="tasks-table">
          {/* Header */}
          <div className="table-header">
            {columnConfig.map((col) => (
              <div
                key={col.key}
                className={`header-cell column-${col.key}`}
                style={{
                  width: col.flex ? undefined : col.width,
                  minWidth: col.key === 'type' ? typeColumnMinWidth : undefined,
                  flex: col.flex ? 1 : undefined,
                }}
              >
                {col.tooltip ? (
                  <Tooltip title={col.tooltip}>{col.label}</Tooltip>
                ) : (
                  col.label
                )}
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="table-body">
            {tableData.map((record) => {
              if (record.isGroupHeader) {
                return (
                  <div key={record.key} className="group-header-row">
                    <div className="side-sub-title">{record.groupName}</div>
                  </div>
                );
              }

              const task = record.task!;
              const isSelected = task === activeTask;

              return (
                <div
                  key={record.key}
                  className={`task-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setActiveTask(task);
                    setReplayAllMode?.(false);
                  }}
                  onMouseEnter={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const x = rect.left + rect.width;
                    const y = rect.top;
                    setHoverPreviewConfig({ x, y });
                    setHoverTask(task);
                  }}
                  onMouseLeave={() => {
                    setHoverPreviewConfig(null);
                    setHoverTask(null);
                  }}
                >
                  {columnConfig.map((col) => (
                    <div
                      key={col.key}
                      className={`task-cell column-${col.key}`}
                      style={{
                        width: col.flex ? undefined : col.width,
                        minWidth:
                          col.key === 'type' ? typeColumnMinWidth : undefined,
                        flex: col.flex ? 1 : undefined,
                      }}
                    >
                      {renderCellContent(col.key, task)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {proModeEnabled && (
            <div className="table-summary">
              <div className="side-seperator side-seperator-line side-seperator-space-up" />
              {(() => {
                const modelEntries = Array.from(tokensByModel.entries());
                const hasMultipleModels = modelEntries.length > 1;

                return hasMultipleModels
                  ? modelEntries.map(([modelName, stats]) => (
                      <div key={modelName} className="summary-row">
                        <div
                          className="summary-cell column-type"
                          style={{
                            minWidth: typeColumnMinWidth,
                            flex: 1,
                          }}
                        >
                          <div className="token-total-label">
                            {modelName}
                            <Tag bordered={false} style={{ marginLeft: '8px' }}>
                              Total
                            </Tag>
                          </div>
                        </div>
                        <div
                          className="summary-cell column-prompt"
                          style={{ width: dynamicWidths.prompt }}
                        >
                          <span className="token-value">{stats.prompt}</span>
                        </div>
                        {hasCachedInput && (
                          <div
                            className="summary-cell column-cached"
                            style={{ width: dynamicWidths.cached }}
                          >
                            <span className="token-value">
                              {stats.cachedInput}
                            </span>
                          </div>
                        )}
                        <div
                          className="summary-cell column-completion"
                          style={{ width: dynamicWidths.completion }}
                        >
                          <span className="token-value">
                            {stats.completion}
                          </span>
                        </div>
                      </div>
                    ))
                  : [
                      <div key="total" className="summary-row">
                        <div
                          className="summary-cell column-type"
                          style={{
                            minWidth: typeColumnMinWidth,
                            flex: 1,
                          }}
                        >
                          <div className="token-total-label">Total</div>
                        </div>
                        <div
                          className="summary-cell column-prompt"
                          style={{ width: dynamicWidths.prompt }}
                        >
                          <span className="token-value">
                            {totalPromptTokens}
                          </span>
                        </div>
                        {hasCachedInput && (
                          <div
                            className="summary-cell column-cached"
                            style={{ width: dynamicWidths.cached }}
                          >
                            <span className="token-value">
                              {totalCachedInputTokens}
                            </span>
                          </div>
                        )}
                        <div
                          className="summary-cell column-completion"
                          style={{ width: dynamicWidths.completion }}
                        >
                          <span className="token-value">
                            {totalCompletionTokens}
                          </span>
                        </div>
                      </div>,
                    ];
              })()}
            </div>
          )}
        </div>
        <div className="executions-tip">
          <span className="tip-icon">?</span>
          <span className="tip-text">
            How to insert a custom log entry ?{' '}
            <a
              href="https://midscenejs.com/api#agentlogscreenshot"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
            </a>
          </span>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="side-bar">
      <div className="page-nav">
        <div className="page-nav-left">
          <div className="page-nav-title">
            Report
            <span className="page-nav-title-hint">
              Switch: Command + Up / Down
            </span>
          </div>
          <div className="page-nav-toolbar">
            <div
              className="icon-button"
              onClick={() => {
                setReplayAllMode?.(true);
              }}
            >
              <PlayIcon />
            </div>
          </div>
        </div>
      </div>
      {sideList}
      {executionContent}
    </div>
  );
};

export default Sidebar;
