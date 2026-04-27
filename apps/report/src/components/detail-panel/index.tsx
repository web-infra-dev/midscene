'use client';
import './index.less';
import { isElementField, useExecutionDump } from '@/components/store';
import {
  CameraOutlined,
  DownloadOutlined,
  FileMarkdownOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { ExecutionTaskPlanningLocate } from '@midscene/core';
import type { MarkdownAttachment } from '@midscene/core';
import { executionToMarkdown } from '@midscene/core';
import { filterBase64Value } from '@midscene/visualizer';
import { Blackboard, Player } from '@midscene/visualizer';
import { Segmented } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { fullTimeStrWithMilliseconds } from '../../../../../packages/visualizer/src/utils';
import { getExecutionMarkdownView } from './markdown-view';

const ScreenshotDisplay = (props: {
  title: string;
  img?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div className="screenshot-item">
      <div className="screenshot-item-title">{props.title}</div>
      {props.img && (
        <div>
          <img src={props.img} alt="screenshot" loading="lazy" />
        </div>
      )}
      {props.children && <div>{props.children}</div>}
    </div>
  );
};

const VIEW_TYPE_REPLAY = 'replay';
const VIEW_TYPE_MARKDOWN = 'markdown';
const VIEW_TYPE_SCREENSHOT = 'screenshot';
const VIEW_TYPE_JSON = 'json';

async function downloadMarkdownZip(
  markdown: string,
  attachments: MarkdownAttachment[],
  fileName: string,
): Promise<void> {
  const { zipSync, strToU8 } = await import('fflate');

  const files: Record<string, Uint8Array> = {};
  files['report.md'] = strToU8(markdown);

  for (const att of attachments) {
    if (!att.base64Data) continue;
    const raw = att.base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    files[`screenshots/${att.suggestedFileName}`] = bytes;
  }

  const zipped = zipSync(files);
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper function to recursively extract all elements from param
const extractElementsFromParam = (param: any): any[] => {
  const elements: any[] = [];

  const traverse = (value: any) => {
    if (!value) return;

    // Check if it's an element field
    if (isElementField(value)) {
      elements.push(value);
      return;
    }

    // Check if it's an array
    if (Array.isArray(value)) {
      value.forEach((item) => traverse(item));
      return;
    }

    // Check if it's an object
    if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach((val) => traverse(val));
      return;
    }
  };

  traverse(param);
  return elements;
};

const capturedAtText = (capturedAt?: number): string => {
  if (typeof capturedAt === 'number') {
    return `captured at ${fullTimeStrWithMilliseconds(capturedAt)}`;
  }
  return 'captured at unknown';
};

const DetailPanel = (): JSX.Element => {
  const insightDump = useExecutionDump((store) => store.insightDump);
  const _contextLoadId = useExecutionDump((store) => store._contextLoadId);
  const activeExecution = useExecutionDump((store) => store.activeExecution);
  const activeExecutionId = useExecutionDump(
    (store) => store._executionDumpLoadId,
  );
  const activeTask = useExecutionDump((store) => store.activeTask);
  const [preferredViewType, setViewType] = useState(VIEW_TYPE_REPLAY);
  const animationScripts = useExecutionDump(
    (store) => store.activeExecutionAnimation,
  );
  const imageWidth = useExecutionDump((store) => store.insightWidth);
  const imageHeight = useExecutionDump((store) => store.insightHeight);

  // Check if page context is frozen
  const isPageContextFrozen = Boolean(activeTask?.uiContext?._isFrozen);

  const markdownResult = useMemo(() => {
    return getExecutionMarkdownView(activeExecution, (execution) =>
      executionToMarkdown(execution, {
        screenshotBaseDir: './screenshots',
      }),
    );
  }, [activeExecution]);

  const hasReplay =
    activeTask?.type === 'Planning' &&
    animationScripts &&
    animationScripts.length > 0;

  const availableViewTypes = [VIEW_TYPE_SCREENSHOT, VIEW_TYPE_JSON];

  if (hasReplay) {
    availableViewTypes.unshift(VIEW_TYPE_REPLAY);
    // Temporary: hide the Markdown segment without removing the implementation.
    // availableViewTypes.push(VIEW_TYPE_MARKDOWN);
  }

  const viewType =
    availableViewTypes.indexOf(preferredViewType) >= 0
      ? preferredViewType
      : availableViewTypes[0];

  let content;
  if (activeExecution && viewType === VIEW_TYPE_REPLAY) {
    content = (
      <Player
        key={`${activeExecutionId}`}
        replayScripts={animationScripts || []}
        imageWidth={imageWidth || 0}
        imageHeight={imageHeight || 0}
      />
    );
  } else if (viewType === VIEW_TYPE_MARKDOWN) {
    if (markdownResult.status === 'ready') {
      content = (
        <div className="markdown-view scrollable">
          <pre className="markdown-source">{markdownResult.markdown}</pre>
        </div>
      );
    } else if (markdownResult.status === 'error') {
      content = (
        <div>Failed to render markdown: {markdownResult.errorMessage}</div>
      );
    } else {
      content = <div>No markdown available</div>;
    }
  } else if (!activeTask) {
    content = <div>please select a task</div>;
  } else if (viewType === VIEW_TYPE_JSON) {
    content = (
      <div className="json-content scrollable">
        {filterBase64Value(JSON.stringify(activeTask, undefined, 2))}
      </div>
    );
  } else if (viewType === VIEW_TYPE_SCREENSHOT) {
    const screenshotItems: {
      timestamp?: number;
      screenshotTimestamp?: number;
      screenshot: string;
      timing?: string;
    }[] = [];

    // locator view
    let contextLocatorView;
    let highlightElements: any[] = [];

    if (
      isElementField(
        (activeTask as ExecutionTaskPlanningLocate).output?.element,
      )
    ) {
      // hit cache
      highlightElements = [activeTask.output.element];
    }

    // Extract elements from param
    if (activeTask.param) {
      // For Planning tasks, extract from output.actions[0].param
      const paramElements = extractElementsFromParam(
        activeTask.output?.actions?.[0]?.param,
      );
      highlightElements = [...highlightElements, ...paramElements];
    }

    // For Action Space tasks (tap, scroll, etc.), extract from param.locate
    if (activeTask.type === 'Action Space' && activeTask.param) {
      const locateElements = extractElementsFromParam(activeTask.param);
      highlightElements = [...highlightElements, ...locateElements];
    }

    const contextScreenshotAt = capturedAtText(
      activeTask.uiContext?.screenshot?.capturedAt,
    );

    contextLocatorView = activeTask.uiContext?.shotSize ? (
      <ScreenshotDisplay
        title={`${isPageContextFrozen ? 'UI Context (Frozen)' : 'UI Context'} / ${contextScreenshotAt}`}
      >
        <Blackboard
          key={`${_contextLoadId}`}
          uiContext={activeTask.uiContext}
          highlightElements={highlightElements}
          highlightRect={insightDump?.taskInfo?.searchArea}
        />
      </ScreenshotDisplay>
    ) : null;

    // screenshot view
    const screenshotFromContext = activeTask.uiContext?.screenshot;
    if (screenshotFromContext?.base64) {
      screenshotItems.push({
        timestamp: activeTask.timing?.start ?? undefined,
        screenshotTimestamp: screenshotFromContext.capturedAt,
        screenshot: screenshotFromContext.base64,
        timing: 'before-calling',
      });
    }

    if (activeTask.recorder?.length) {
      for (const item of activeTask.recorder) {
        if (item.screenshot?.base64) {
          screenshotItems.push({
            timestamp: item.ts,
            screenshotTimestamp: item.screenshot.capturedAt,
            screenshot: item.screenshot.base64,
            timing: item.timing,
          });
        }
      }
    }

    if (screenshotItems.length > 0 || contextLocatorView) {
      content = (
        <div className="screenshot-item-wrapper scrollable">
          {contextLocatorView && <div>{contextLocatorView}</div>}
          {screenshotItems.map((item) => {
            const timeText = item.timing || 'unknown-timing';
            const screenshotAt = capturedAtText(item.screenshotTimestamp);
            const title = `${timeText} / ${screenshotAt}`;
            return (
              <ScreenshotDisplay
                key={item.timestamp}
                title={title}
                img={item.screenshot}
              />
            );
          })}
        </div>
      );
    } else {
      content = <div>No screenshot</div>;
    }
  }

  useEffect(() => {
    // hit `Tab` to toggle viewType
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const ifShift = e.shiftKey;
        const index = availableViewTypes.indexOf(viewType);
        const nextIndex = ifShift
          ? (index - 1 + availableViewTypes.length) % availableViewTypes.length
          : (index + 1) % availableViewTypes.length;
        setViewType(availableViewTypes[nextIndex]);
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  });

  const options = availableViewTypes.map((type) => {
    if (type === VIEW_TYPE_REPLAY) {
      return {
        label: 'Replay',
        value: type,
        icon: <VideoCameraOutlined />,
      };
    }
    if (type === VIEW_TYPE_MARKDOWN) {
      return {
        label: 'Markdown',
        value: type,
        icon: <FileMarkdownOutlined />,
      };
    }
    if (type === VIEW_TYPE_SCREENSHOT) {
      return {
        label: 'Screenshots',
        value: type,
        icon: <CameraOutlined />,
      };
    }
    if (type === VIEW_TYPE_JSON) {
      return {
        label: 'JSON View',
        value: type,
        icon: <FileTextOutlined />,
      };
    }

    return {
      label: 'unknown',
      value: type,
    };
  });
  const safeName = (activeExecution?.name || 'report')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '');

  return (
    <div className="detail-panel">
      <div className="view-switcher">
        <Segmented
          shape="round"
          options={options}
          value={viewType}
          onChange={(value: any) => {
            setViewType(value);
          }}
        />

        <div className="view-switcher-actions">
          {viewType === VIEW_TYPE_MARKDOWN && markdownResult && (
            <a
              className="download-zip-link"
              onClick={() =>
                downloadMarkdownZip(
                  markdownResult.markdown,
                  markdownResult.attachments,
                  safeName || 'report',
                )
              }
            >
              <DownloadOutlined /> Download ZIP
            </a>
          )}
        </div>
      </div>
      <div className="detail-content">{content}</div>
    </div>
  );
};

export default DetailPanel;
