'use client';
import './detail-panel.less';
import { useExecutionDump, useInsightDump } from '@/component/store';
import { filterBase64Value, timeStr } from '@/utils';
import {
  CameraOutlined,
  FileTextOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { ConfigProvider, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import BlackBoard from './blackboard';

const ScreenshotItem = (props: { time: string; img: string }) => {
  return (
    <div className="screenshot-item">
      <div className="screenshot-item-title">{props.time}</div>
      <div>
        <img src={props.img} alt="screenshot" />
      </div>
    </div>
  );
};

const VIEW_TYPE_BLACKBOARD = 'blackboard';
const VIEW_TYPE_SCREENSHOT = 'screenshot';
const VIEW_TYPE_JSON = 'json';

const DetailPanel = (): JSX.Element => {
  const dumpContext = useInsightDump(store => store.data);
  const dumpId = useInsightDump((store) => store._loadId);
  const blackboardViewAvailable = Boolean(dumpContext);
  const activeTask = useExecutionDump((store) => store.activeTask);
  const [preferredViewType, setViewType] = useState(VIEW_TYPE_BLACKBOARD);

  const viewType =
    preferredViewType === VIEW_TYPE_BLACKBOARD && !blackboardViewAvailable
      ? VIEW_TYPE_SCREENSHOT
      : preferredViewType;

  let content;
  if (!activeTask) {
    content = <div>please select a task</div>;
  } else if (viewType === VIEW_TYPE_JSON) {
    content = (
      <div className="json-content">
        {filterBase64Value(JSON.stringify(activeTask, undefined, 2))}
      </div>
    );
  } else if (viewType === VIEW_TYPE_BLACKBOARD) {
    if (blackboardViewAvailable) {
      content = <BlackBoard key={`${dumpId}`} />;
    } else {
      content = <div>invalid view</div>;
    }
  } else if (viewType === VIEW_TYPE_SCREENSHOT) {
    if (activeTask.recorder?.length) {
      content = (
        <div>
          {activeTask.recorder
            .filter((item) => item.screenshot)
            .map((item, index) => {
              const fullTime = timeStr(item.ts);
              const str = item.timing
                ? `${fullTime} / ${item.timing}`
                : fullTime;
              return (
                <ScreenshotItem key={index} time={str} img={item.screenshot!} />
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
        if (viewType === VIEW_TYPE_BLACKBOARD) {
          setViewType(VIEW_TYPE_SCREENSHOT);
        } else if (viewType === VIEW_TYPE_SCREENSHOT) {
          setViewType(VIEW_TYPE_JSON);
        } else {
          setViewType(
            blackboardViewAvailable
              ? VIEW_TYPE_BLACKBOARD
              : VIEW_TYPE_SCREENSHOT,
          );
        }
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  });

  const options = [
    {
      label: 'Screenshots',
      value: VIEW_TYPE_SCREENSHOT,
      icon: <CameraOutlined />,
    },
    { label: 'JSON View', value: VIEW_TYPE_JSON, icon: <FileTextOutlined /> },
  ];
  if (blackboardViewAvailable) {
    options.unshift({
      label: 'Visualization',
      value: VIEW_TYPE_BLACKBOARD,
      icon: <ScheduleOutlined />,
    });
  }
  return (
    <div className="detail-panel">
      <div className="view-switcher">
        <ConfigProvider
          theme={{
            components: {
              Segmented: {
                itemSelectedBg: '#bfc4da50',
                itemSelectedColor: '#000000',
                // itemHoverColor: '#ffffff',
                // itemHoverBg: '#A3D6D2',
              },
            },
          }}
        >
          <Segmented
            options={options}
            value={viewType}
            onChange={(value: any) => {
              setViewType(value);
            }}
          />
        </ConfigProvider>
      </div>
      <div className="detail-content">{content}</div>
    </div>
  );
};

export default DetailPanel;
