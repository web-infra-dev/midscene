import './index.less';
import { useAllCurrentTasks, useExecutionDump } from '@/components/store';
import {
  CopyOutlined,
  DownloadOutlined,
  FileMarkdownOutlined,
} from '@ant-design/icons';
import { type ExecutionTask, deriveTaskStatus } from '@midscene/core';
import { typeStr } from '@midscene/core/agent';
import { collectReportSummary } from '@midscene/core/report-stats';
import {
  type AnimationScript,
  fullTimeStrWithMilliseconds,
  iconForStatus,
  timeCostStrElement,
} from '@midscene/visualizer';
import { Alert, Button, Checkbox, Tag, Tooltip } from 'antd';
import { useEffect, useMemo } from 'react';
import type { Ref } from 'react';
import CameraIcon from '../../icons/camera.svg?react';
import MessageIcon from '../../icons/message.svg?react';
import PlayIcon from '../../icons/play.svg?react';
import type { PlaywrightTasks, ReportViewMode } from '../../types';
import {
  type MarkdownView,
  markdownZipDownloadTooltip,
} from '../../utils/markdown-export';
import {
  hasDeepLocateFlag,
  hasDeepThinkFlag,
  hasObserverAssertionFlag,
} from '../../utils/report-task-tags';
import { anchorIdForTask } from '../../utils/task-anchor';
import ReportOverview from '../report-overview';
import MarkdownSource from './markdown-source';

// Table row data type
type TableRowData = {
  key: string;
  isGroupHeader?: boolean;
  groupName?: string;
  task?: ExecutionTask;
};

interface SidebarProps {
  dumps?: PlaywrightTasks[];
  proModeEnabled?: boolean;
  onProModeChange?: (checked: boolean) => void;
  replayAllScripts?: AnimationScript[] | null;
  replayAllMode?: boolean;
  setReplayAllMode?: (mode: boolean) => void;
  reportViewMode?: ReportViewMode;
  onReportViewModeChange?: (mode: ReportViewMode) => void;
  reportMarkdownView?: MarkdownView | null;
  onMarkdownImageClick?: (markdownPath: string) => void;
  markdownScrollContainerRef?: Ref<HTMLDivElement>;
  reportMarkdownActionsDisabled?: boolean;
  onCopyReportMarkdown?: () => void;
  onDownloadReportMarkdownZip?: () => void;
  onReportCaseChange?: () => void;
}

const Sidebar = (props: SidebarProps = {}): JSX.Element => {
  const {
    dumps,
    proModeEnabled = false,
    onProModeChange,
    setReplayAllMode,
    reportViewMode = 'human',
    onReportViewModeChange,
    reportMarkdownView,
    onMarkdownImageClick,
    markdownScrollContainerRef,
    reportMarkdownActionsDisabled = true,
    onCopyReportMarkdown,
    onDownloadReportMarkdownZip,
    onReportCaseChange,
  } = props;
  const groupedDump = useExecutionDump((store) => store.dump);
  const playwrightAttributes = useExecutionDump(
    (store) => store.playwrightAttributes,
  );
  const setActiveTask = useExecutionDump((store) => store.setActiveTask);
  const activeTask = useExecutionDump((store) => store.activeTask);
  const setHoverTask = useExecutionDump((store) => store.setHoverTask);
  const playingTaskId = useExecutionDump((store) => store.playingTaskId);

  const setHoverPreviewConfig = useExecutionDump(
    (store) => store.setHoverPreviewConfig,
  );
  const setPlayingTaskId = useExecutionDump((store) => store.setPlayingTaskId);
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

      // Add task rows with taskId that matches the animation script format
      execution.tasks.forEach((task, taskIndex) => {
        rows.push({
          key: `task-${executionIndex}-${taskIndex}`,
          task,
        });
      });
    });

    return rows;
  }, [groupedDump]);

  // Create a map from taskId to task for playback highlighting
  const taskIdToTaskMap = useMemo(() => {
    if (!groupedDump) return new Map<string, ExecutionTask>();
    const map = new Map<string, ExecutionTask>();
    groupedDump.executions.forEach((execution) => {
      execution.tasks.forEach((task) => {
        if (task.taskId) {
          map.set(task.taskId, task);
        }
      });
    });
    return map;
  }, [groupedDump]);

  // Get the currently playing task
  const playingTask = playingTaskId ? taskIdToTaskMap.get(playingTaskId) : null;

  const hasCachedInput = useMemo(() => {
    if (!groupedDump) return false;

    return groupedDump.executions.some((execution) =>
      execution.tasks.some((task) => {
        const mainCached = task.usage?.cached_input || 0;
        const searchAreaCached = task.searchAreaUsage?.cached_input || 0;
        return mainCached + searchAreaCached > 0;
      }),
    );
  }, [groupedDump]);

  // Helper functions for rendering
  const getStatusIcon = (task: ExecutionTask) => {
    // Share the same failure semantics as the merged-report status derivation
    // (deriveTaskStatus) so step icons and merged Passed/Failed never diverge.
    const status = deriveTaskStatus(task);
    // `warning` maps to the dedicated warning icon; every other value is a
    // status string iconForStatus already understands.
    return iconForStatus(status === 'warning' ? 'finishedWithWarning' : status);
  };

  const getTitleIcon = (task: ExecutionTask) => {
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

  const getCacheTag = (task: ExecutionTask) => {
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

  const getDomIncludedTag = (task: ExecutionTask) => {
    const isDomIncludedInsightTask =
      task.type === 'Insight' &&
      (
        task as ExecutionTask & {
          param?: { domIncluded?: boolean | 'visible-only' };
        }
      )?.param?.domIncluded;

    return isDomIncludedInsightTask ? (
      <Tag
        className="domincluded-tag"
        bordered={false}
        style={{
          padding: '0 4px',
          marginLeft: '4px',
          marginRight: 0,
          lineHeight: '16px',
        }}
      >
        DomIncluded
      </Tag>
    ) : null;
  };

  const getDeepLocateTag = (task: ExecutionTask) => {
    return hasDeepLocateFlag(task) ? (
      <Tag
        className="deeplocate-tag"
        bordered={false}
        style={{
          padding: '0 4px',
          marginLeft: '4px',
          marginRight: 0,
          lineHeight: '16px',
        }}
      >
        DeepLocate
      </Tag>
    ) : null;
  };

  const getDeepThinkTag = (task: ExecutionTask) => {
    return hasDeepThinkFlag(task) ? (
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

  const getObservedTag = (task: ExecutionTask) => {
    return hasObserverAssertionFlag(task) ? (
      <Tag
        className="observed-tag"
        bordered={false}
        style={{
          padding: '0 4px',
          marginLeft: '4px',
          marginRight: 0,
          lineHeight: '16px',
        }}
      >
        Observed
      </Tag>
    ) : null;
  };

  const getXPathTag = (task: ExecutionTask) => {
    if (task.hitBy?.from !== 'User expected path') {
      return null;
    }

    return (
      <Tag
        className="xpath-tag"
        style={{
          padding: '0 4px',
          marginLeft: '4px',
          marginRight: 0,
          lineHeight: '16px',
        }}
        bordered={false}
      >
        XPath
      </Tag>
    );
  };

  const getStatusText = (task: ExecutionTask) => {
    if (typeof task.timing?.cost === 'number') {
      return timeCostStrElement(task.timing.cost);
    }
    return task.status;
  };

  const getTokens = (task: ExecutionTask, type: 'prompt' | 'completion') => {
    const key = type === 'prompt' ? 'prompt_tokens' : 'completion_tokens';
    const mainUsage = task.usage?.[key] || 0;
    const searchAreaUsage = task.searchAreaUsage?.[key] || 0;
    const total = mainUsage + searchAreaUsage;
    return total > 0 ? total : '-';
  };

  const getCachedTokens = (task: ExecutionTask) => {
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
            (task.searchAreaUsage?.prompt_tokens || 0),
        );
        const cachedTokens = String(
          (task.usage?.cached_input || 0) +
            (task.searchAreaUsage?.cached_input || 0),
        );
        const completionTokens = String(
          (task.usage?.completion_tokens || 0) +
            (task.searchAreaUsage?.completion_tokens || 0),
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
      time: 96,
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
      {
        key: 'time',
        label: 'Time',
        width: dynamicWidths.time,
        tooltip:
          'Per-task elapsed time. The Total row separates the overall elapsed span from total model call duration.',
      },
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

  const reportSummary = useMemo(() => {
    if (!groupedDump) return null;
    return collectReportSummary(groupedDump, {
      wallTimeFallbackMs: playwrightAttributes?.playwright_test_duration,
    });
  }, [groupedDump, playwrightAttributes]);

  const timingSummaryTooltip = useMemo(() => {
    if (!reportSummary) return null;
    const { timing } = reportSummary;
    const hasTaskTimestamps = timing.wallTimeSource === 'task-timestamps';

    return (
      <div className="total-time-tooltip-content">
        <span className="total-time-tooltip-metric">Elapsed</span>
        <span className="total-time-tooltip-description">
          {hasTaskTimestamps
            ? 'Total span from the first recorded task start to the last recorded task end, including model calls, actions, waits, and gaps.'
            : timing.wallTimeSource === 'fallback'
              ? 'Total elapsed duration reported by the enclosing test runner because task timestamps were unavailable.'
              : 'The total elapsed span is unavailable because the report has no recorded task timestamps.'}
        </span>
        {hasTaskTimestamps && (
          <>
            <span className="total-time-tooltip-label">Start</span>
            <span className="total-time-tooltip-value">
              {fullTimeStrWithMilliseconds(timing.wallTimeStart)}
            </span>
            <span className="total-time-tooltip-label">End</span>
            <span className="total-time-tooltip-value">
              {fullTimeStrWithMilliseconds(timing.wallTimeEnd)}
            </span>
          </>
        )}
        <span className="total-time-tooltip-metric">Model</span>
        <span className="total-time-tooltip-description">
          Total duration of all recorded model calls.
        </span>
        <span className="total-time-tooltip-label">Calls</span>
        <span className="total-time-tooltip-value">
          {timing.modelCallCount}
        </span>
      </div>
    );
  }, [reportSummary]);

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
          <ReportOverview
            title={group.groupName}
            dumps={dumps}
            onCaseChange={onReportCaseChange}
          />
        </div>
      );
    })
  ) : (
    <span>no tasks</span>
  );
  const showReportOverview =
    reportViewMode === 'human' || (dumps?.length ?? 0) > 1;

  // Render cell content based on column key
  const renderCellContent = (columnKey: string, task: ExecutionTask) => {
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
            {getDomIncludedTag(task)}
            {getDeepLocateTag(task)}
            {getXPathTag(task)}
            {getDeepThinkTag(task)}
            {getObservedTag(task)}
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
                // Group headers are not selectable; the id only makes them a
                // plain `#group-<index>` scroll target, with no hash sync.
                return (
                  <div
                    key={record.key}
                    id={record.key}
                    className="group-header-row"
                  >
                    <div className="side-sub-title">{record.groupName}</div>
                  </div>
                );
              }

              const task = record.task!;
              const isSelected = task === activeTask;
              const isPlaying = task === playingTask;
              const taskId = task.taskId;
              // Single source of truth for the anchor format so the row id,
              // the hash we write, and the hash we resolve never drift apart.
              const anchorId = anchorIdForTask(task);

              return (
                <div
                  key={record.key}
                  id={anchorId}
                  data-task-id={taskId}
                  className={`task-row ${isSelected ? 'selected' : ''} ${isPlaying ? 'playing' : ''}`}
                  onClick={() => {
                    setActiveTask(task);
                    setReplayAllMode?.(false);
                    setPlayingTaskId(null); // Clear playing state when user clicks a task
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
          <div className="table-summary">
            <div className="side-seperator side-seperator-line side-seperator-space-up" />
            {/* Grand total: timing is always visible; tokens appear in pro mode. */}
            <div className="summary-row total-summary-row">
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
                className="summary-cell column-time"
                style={{ width: dynamicWidths.time }}
              >
                <Tooltip
                  title={timingSummaryTooltip}
                  rootClassName="total-time-tooltip"
                  placement="topLeft"
                >
                  <div className="summary-time-values">
                    <span className="summary-time-item">
                      <span className="summary-time-label">Elapsed</span>
                      <span className="summary-time-value">
                        {timeCostStrElement(reportSummary?.timing.wallTimeMs)}
                      </span>
                    </span>
                    <span className="summary-time-item">
                      <span className="summary-time-label">Model</span>
                      <span className="summary-time-value">
                        {timeCostStrElement(
                          reportSummary?.timing.modelCallTimeMs,
                        )}
                      </span>
                    </span>
                  </div>
                </Tooltip>
              </div>
              {proModeEnabled && (
                <>
                  <div
                    className="summary-cell column-intent"
                    style={{ width: dynamicWidths.intent }}
                  />
                  <div
                    className="summary-cell column-model"
                    style={{ width: dynamicWidths.model }}
                  />
                  <div
                    className="summary-cell column-prompt"
                    style={{ width: dynamicWidths.prompt }}
                  >
                    <span className="token-value">
                      {reportSummary?.tokens.promptTokens ?? 0}
                    </span>
                  </div>
                  {hasCachedInput && (
                    <div
                      className="summary-cell column-cached"
                      style={{ width: dynamicWidths.cached }}
                    >
                      <span className="token-value">
                        {reportSummary?.tokens.cachedInputTokens ?? 0}
                      </span>
                    </div>
                  )}
                  <div
                    className="summary-cell column-completion"
                    style={{ width: dynamicWidths.completion }}
                  >
                    <span className="token-value">
                      {reportSummary?.tokens.completionTokens ?? 0}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Keep per-model subtotals when the report used multiple models. */}
            {proModeEnabled &&
              reportSummary &&
              reportSummary.models.length > 1 &&
              reportSummary.models.map((model) => (
                <div key={model.modelName} className="summary-row">
                  <div
                    className="summary-cell column-type"
                    style={{
                      minWidth: typeColumnMinWidth,
                      flex: 1,
                    }}
                  >
                    <div className="token-total-label">
                      {model.modelName}
                      <Tag bordered={false} style={{ marginLeft: '8px' }}>
                        Subtotal
                      </Tag>
                    </div>
                  </div>
                  <div
                    className="summary-cell column-prompt"
                    style={{ width: dynamicWidths.prompt }}
                  >
                    <span className="token-value">{model.promptTokens}</span>
                  </div>
                  {hasCachedInput && (
                    <div
                      className="summary-cell column-cached"
                      style={{ width: dynamicWidths.cached }}
                    >
                      <span className="token-value">
                        {model.cachedInputTokens}
                      </span>
                    </div>
                  )}
                  <div
                    className="summary-cell column-completion"
                    style={{ width: dynamicWidths.completion }}
                  >
                    <span className="token-value">
                      {model.completionTokens}
                    </span>
                  </div>
                </div>
              ))}
          </div>
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

  let agentMarkdownContent: JSX.Element;
  if (reportMarkdownView?.status === 'ready') {
    agentMarkdownContent = (
      <div className="agent-markdown-sidebar">
        <MarkdownSource
          markdown={reportMarkdownView.markdown}
          onImageClick={onMarkdownImageClick}
          scrollContainerRef={markdownScrollContainerRef}
        />
      </div>
    );
  } else if (reportMarkdownView?.status === 'error') {
    agentMarkdownContent = (
      <div className="agent-markdown-sidebar">
        <Alert
          type="error"
          showIcon
          message="Failed to render markdown"
          description={reportMarkdownView.errorMessage}
        />
      </div>
    );
  } else {
    agentMarkdownContent = (
      <div className="agent-markdown-sidebar empty">No report markdown</div>
    );
  }

  const pageNavToolbar =
    reportViewMode === 'markdown' ? (
      <div className="page-nav-toolbar report-markdown-sidebar-actions">
        <Tooltip title="Copy report.md markdown">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            disabled={reportMarkdownActionsDisabled}
            onClick={onCopyReportMarkdown}
            aria-label="Copy report markdown"
          />
        </Tooltip>
        <Tooltip title={markdownZipDownloadTooltip}>
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            disabled={reportMarkdownActionsDisabled}
            onClick={onDownloadReportMarkdownZip}
            aria-label="Download markdown and images ZIP"
          />
        </Tooltip>
      </div>
    ) : (
      <div className="page-nav-toolbar">
        <button
          type="button"
          className="icon-button"
          aria-label="Replay all tasks"
          onClick={() => {
            setReplayAllMode?.(true);
          }}
        >
          <PlayIcon />
        </button>
      </div>
    );

  const reportViewModeSwitch = (
    <fieldset className="report-view-mode-switch" aria-label="Report view">
      <Tooltip title="Human View">
        <button
          type="button"
          className={`report-view-mode-button ${
            reportViewMode === 'human' ? 'active' : ''
          }`}
          aria-label="Human View"
          aria-pressed={reportViewMode === 'human'}
          onClick={() => onReportViewModeChange?.('human')}
        >
          <MessageIcon width={16} height={16} />
        </button>
      </Tooltip>
      <Tooltip title="Markdown View">
        <button
          type="button"
          className={`report-view-mode-button ${
            reportViewMode === 'markdown' ? 'active' : ''
          }`}
          aria-label="Markdown View"
          aria-pressed={reportViewMode === 'markdown'}
          onClick={() => onReportViewModeChange?.('markdown')}
        >
          <FileMarkdownOutlined />
        </button>
      </Tooltip>
    </fieldset>
  );

  return (
    <div className={`side-bar ${reportViewMode}-view`}>
      <div className="page-nav">
        <div className="page-nav-left">
          <div className="page-nav-top">
            <div className="page-nav-leading">
              {reportViewModeSwitch}
              {reportViewMode === 'human' && (
                <div className="page-nav-title">
                  Switch: Command + Up / Down
                </div>
              )}
            </div>
            {pageNavToolbar}
          </div>
        </div>
      </div>
      {showReportOverview && sideList}
      {reportViewMode === 'markdown' ? agentMarkdownContent : executionContent}
    </div>
  );
};

export default Sidebar;
