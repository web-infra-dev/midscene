'use client';
import './index.less';
import { useExecutionDump } from '@/components/store';
import {
  CameraOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type {
  ExecutionTaskPlanning,
  ExecutionTaskPlanningLocate,
} from '@midscene/core';
import { filterBase64Value } from '@midscene/visualizer';
import { Blackboard, Player } from '@midscene/visualizer';
import type { WebUIContext } from '@midscene/web';
import { Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { fullTimeStrWithMilliseconds } from '../../../../../packages/visualizer/src/utils';
import OpenInPlayground from '../open-in-playground';

const ScreenshotItem = (props: {
  title: string;
  img?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div className="screenshot-item">
      <div className="screenshot-item-title">{props.title}</div>
      {props.img && (
        <div>
          <img src={props.img} alt="screenshot" />
        </div>
      )}
      {props.children && <div>{props.children}</div>}
    </div>
  );
};

const VIEW_TYPE_REPLAY = 'replay';
const VIEW_TYPE_SCREENSHOT = 'screenshot';
const VIEW_TYPE_JSON = 'json';

const DetailPanel = (): JSX.Element => {
  const insightDump = useExecutionDump((store) => store.insightDump);
  const _contextLoadId = useExecutionDump((store) => store._contextLoadId);
  const activeExecution = useExecutionDump((store) => store.activeExecution);
  const activeExecutionId = useExecutionDump(
    (store) => store._executionDumpLoadId,
  );
  const activeTask = useExecutionDump((store) => store.activeTask);
  const blackboardViewAvailable = Boolean(activeTask?.uiContext);
  const [preferredViewType, setViewType] = useState(VIEW_TYPE_REPLAY);
  const animationScripts = useExecutionDump(
    (store) => store.activeExecutionAnimation,
  );
  const imageWidth = useExecutionDump((store) => store.insightWidth);
  const imageHeight = useExecutionDump((store) => store.insightHeight);

  // Check if page context is frozen
  const isPageContextFrozen = Boolean(
    (activeTask?.uiContext as WebUIContext)?._isFrozen,
  );

  let availableViewTypes = [VIEW_TYPE_SCREENSHOT, VIEW_TYPE_JSON];
  if (blackboardViewAvailable) {
    availableViewTypes = [VIEW_TYPE_SCREENSHOT, VIEW_TYPE_JSON];
  }
  if (
    activeTask?.type === 'Planning' &&
    animationScripts &&
    animationScripts.length > 0
  ) {
    availableViewTypes.unshift(VIEW_TYPE_REPLAY);
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
  } else if (!activeTask) {
    content = <div>please select a task</div>;
  } else if (viewType === VIEW_TYPE_JSON) {
    content = (
      <div className="json-content scrollable">
        {filterBase64Value(JSON.stringify(activeTask, undefined, 2))}
      </div>
    );
  } else if (viewType === VIEW_TYPE_SCREENSHOT) {
    if (activeTask.recorder?.length) {
      const screenshotItems: {
        timestamp?: number;
        screenshot: string;
        timing?: string;
      }[] = [];

      const screenshotFromContext = activeTask.uiContext?.screenshotBase64;
      if (screenshotFromContext) {
        screenshotItems.push({
          timestamp: activeTask.timing?.start ?? undefined,
          screenshot: screenshotFromContext,
          timing: 'before-calling',
        });
      }

      for (const item of activeTask.recorder) {
        if (item.screenshot) {
          screenshotItems.push({
            timestamp: item.ts,
            screenshot: item.screenshot,
            timing: item.timing,
          });
        }
      }

      let contextLocatorView;
      if (blackboardViewAvailable) {
        let highlightElements;

        if (insightDump?.matchedElement) {
          highlightElements = insightDump?.matchedElement;
        } else {
          highlightElements = (activeTask as ExecutionTaskPlanningLocate).output
            ?.element // hit cache
            ? [activeTask.output.element]
            : [];
        }
        contextLocatorView = (
          <ScreenshotItem title="UI Context">
            <Blackboard
              key={`${_contextLoadId}`}
              uiContext={activeTask.uiContext as WebUIContext}
              highlightElements={highlightElements}
              highlightRect={insightDump?.taskInfo?.searchArea}
            />
          </ScreenshotItem>
        );
      }

      content = (
        <div className="screenshot-item-wrapper scrollable">
          <div>{contextLocatorView}</div>
          {screenshotItems.map((item) => {
            const time = item.timing
              ? `${fullTimeStrWithMilliseconds(item.timestamp)} / ${item.timing}`
              : fullTimeStrWithMilliseconds(item.timestamp);
            return (
              <ScreenshotItem
                key={item.timestamp}
                title={time}
                img={item.screenshot}
              />
            );
          })}
        </div>
      );
    } else {
      content = <div>no screenshot</div>; // TODO: pretty error message
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

        <OpenInPlayground
          context={(activeTask as ExecutionTaskPlanning)?.uiContext}
        />
      </div>
      <div className="detail-content">{content}</div>
    </div>
  );
};

export default DetailPanel;
