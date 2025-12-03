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
import { Checkbox, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
        // Time cost length (e.g., "1.23s", "123ms")
        if (typeof task.timing?.cost === 'number') {
          const timeStr =
            task.timing.cost < 1000
              ? `${task.timing.cost}ms`
              : `${(task.timing.cost / 1000).toFixed(2)}s`;
          maxTimeLength = Math.max(maxTimeLength, timeStr.length);
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

  // Define columns
  const columns = useMemo<ColumnsType<TableRowData>>(() => {
    const columnCount = proModeEnabled ? (hasCachedInput ? 7 : 6) : 2;
    const baseColumns: ColumnsType<TableRowData> = [
      {
        title: 'Type',
        dataIndex: 'task',
        key: 'type',
        className: 'column-type',
        align: 'left',
        // Let Type column take remaining space
        ellipsis: true,
        render: (_: any, record: TableRowData) => {
          if (record.isGroupHeader) {
            return {
              children: (
                <div
                  className="side-sub-title"
                  style={{ display: 'flex', alignItems: 'flex-start' }}
                >
                  {record.groupName}
                </div>
              ),
              props: {
                colSpan: columnCount,
              },
            };
          }

          const task = record.task!;
          const taskName =
            task.type === 'Planning' && task.output?.log
              ? `${typeStr(task)} - ${task.output?.log}`
              : typeStr(task);
          return (
            <div
              className="title"
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <span className="status-icon">{getStatusIcon(task)}</span>
              <span>{taskName}</span>
              {getTitleIcon(task)}
              {getCacheTag(task)}
              {getDeepThinkTag(task)}
            </div>
          );
        },
      },
      {
        title: <div style={{ width: '100%', textAlign: 'right' }}>Time</div>,
        dataIndex: 'task',
        key: 'time',
        className: 'column-time',
        align: 'right',
        width: dynamicWidths.time,
        render: (_: any, record: TableRowData) => {
          if (record.isGroupHeader) {
            return {
              props: { colSpan: 0 },
            };
          }
          return (
            <div style={{ width: '100%', textAlign: 'right' }}>
              {getStatusText(record.task!)}
            </div>
          );
        },
      },
    ];

    if (proModeEnabled) {
      baseColumns.push(
        {
          title: (
            <div style={{ width: '100%', textAlign: 'right' }}>Intent</div>
          ),
          dataIndex: 'task',
          key: 'intent',
          className: 'column-intent',
          align: 'right',
          width: dynamicWidths.intent,
          ellipsis: {
            showTitle: true,
          },
          render: (_: any, record: TableRowData) => {
            if (record.isGroupHeader) {
              return { props: { colSpan: 0 } };
            }
            const intent = record.task?.usage?.intent || '-';
            return (
              <div style={{ width: '100%', textAlign: 'right' }} title={intent}>
                {intent}
              </div>
            );
          },
        },
        {
          title: <div style={{ width: '100%', textAlign: 'right' }}>Model</div>,
          dataIndex: 'task',
          key: 'model',
          className: 'column-model',
          align: 'right',
          width: dynamicWidths.model,
          ellipsis: {
            showTitle: true,
          },
          render: (_: any, record: TableRowData) => {
            if (record.isGroupHeader) {
              return { props: { colSpan: 0 } };
            }
            const modelName = record.task?.usage?.model_name || '-';
            return (
              <div
                style={{ width: '100%', textAlign: 'right' }}
                title={modelName}
              >
                {modelName}
              </div>
            );
          },
        },
        {
          title: (
            <div style={{ width: '100%', textAlign: 'right' }}>
              <Tooltip title="Input tokens (including cached input tokens) usage">
                Prompt
              </Tooltip>
            </div>
          ),
          dataIndex: 'task',
          key: 'prompt',
          className: 'column-prompt',
          align: 'right',
          width: dynamicWidths.prompt,
          render: (_: any, record: TableRowData) => {
            if (record.isGroupHeader) {
              return { props: { colSpan: 0 } };
            }
            return (
              <div style={{ width: '100%', textAlign: 'right' }}>
                {getTokens(record.task!, 'prompt')}
              </div>
            );
          },
        },
        ...(hasCachedInput
          ? [
              {
                title: (
                  <div style={{ width: '100%', textAlign: 'right' }}>
                    <Tooltip title="Cached input tokens usage">Cached</Tooltip>
                  </div>
                ),
                dataIndex: 'task',
                key: 'cached-input',
                className: 'column-cached-input',
                align: 'right' as const,
                width: dynamicWidths.cached,
                render: (_: any, record: TableRowData) => {
                  if (record.isGroupHeader) {
                    return { props: { colSpan: 0 } };
                  }
                  return (
                    <div style={{ width: '100%', textAlign: 'right' }}>
                      {getCachedTokens(record.task!)}
                    </div>
                  );
                },
              },
            ]
          : []),
        {
          title: (
            <div style={{ width: '100%', textAlign: 'right' }}>
              <Tooltip title="Output tokens generated by the AI model">
                Completion
              </Tooltip>
            </div>
          ),
          dataIndex: 'task',
          key: 'completion',
          className: 'column-completion',
          align: 'right',
          width: dynamicWidths.completion,
          render: (_: any, record: TableRowData) => {
            if (record.isGroupHeader) {
              return { props: { colSpan: 0 } };
            }
            return (
              <div
                style={{
                  width: '100%',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {getTokens(record.task!, 'completion')}
              </div>
            );
          },
        },
      );
    }

    return baseColumns.filter(Boolean) as ColumnsType<TableRowData>;
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
        <Table
          dataSource={tableData}
          columns={columns}
          pagination={false}
          showHeader={true}
          rowKey="key"
          className="tasks-table"
          sticky
          rowClassName={(record) => {
            if (record.isGroupHeader) {
              return 'group-header-row';
            }
            const isSelected = record.task === activeTask;
            return isSelected ? 'task-row selected' : 'task-row';
          }}
          onRow={(record) => {
            if (record.isGroupHeader) {
              return {};
            }

            return {
              onClick: () => {
                setActiveTask(record.task!);
                setReplayAllMode?.(false);
              },
              onMouseEnter: (event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = rect.left + rect.width;
                const y = rect.top;
                setHoverPreviewConfig({ x, y });
                setHoverTask(record.task!);
              },
              onMouseLeave: () => {
                setHoverPreviewConfig(null);
                setHoverTask(null);
              },
            };
          }}
          summary={() => {
            if (!proModeEnabled) {
              return null;
            }

            const modelEntries = Array.from(tokensByModel.entries());
            const hasMultipleModels = modelEntries.length > 1;
            const columnCount = hasCachedInput ? 7 : 6;
            const completionColumnIndex = hasCachedInput ? 6 : 5;

            return (
              <>
                <Table.Summary.Row className="summary-separator-row">
                  <Table.Summary.Cell index={0} colSpan={columnCount}>
                    <div className="side-seperator side-seperator-line side-seperator-space-up" />
                  </Table.Summary.Cell>
                </Table.Summary.Row>
                {hasMultipleModels ? (
                  // Multiple models: show each model separately
                  modelEntries.map(([modelName, stats]) => (
                    <Table.Summary.Row key={modelName} className="summary-row">
                      <Table.Summary.Cell index={0} colSpan={4}>
                        <div className="token-total-label">
                          {modelName}
                          <Tag
                            bordered={false}
                            style={{
                              marginLeft: '8px',
                            }}
                          >
                            Total
                          </Tag>
                        </div>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4}>
                        <span className="token-value">{stats.prompt}</span>
                      </Table.Summary.Cell>
                      {hasCachedInput && (
                        <Table.Summary.Cell index={5}>
                          <span className="token-value">
                            {stats.cachedInput}
                          </span>
                        </Table.Summary.Cell>
                      )}
                      <Table.Summary.Cell index={completionColumnIndex}>
                        <span className="token-value">{stats.completion}</span>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ))
                ) : (
                  // Single model: show total
                  <Table.Summary.Row className="summary-row">
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <div className="token-total-label">Total</div>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4}>
                      <span className="token-value">{totalPromptTokens}</span>
                    </Table.Summary.Cell>
                    {hasCachedInput && (
                      <Table.Summary.Cell index={5}>
                        <span className="token-value">
                          {totalCachedInputTokens}
                        </span>
                      </Table.Summary.Cell>
                    )}
                    <Table.Summary.Cell index={completionColumnIndex}>
                      <span className="token-value">
                        {totalCompletionTokens}
                      </span>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              </>
            );
          }}
        />
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
