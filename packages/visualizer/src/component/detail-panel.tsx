'use client';
import './detail-panel.less';
import { Segmented, ConfigProvider } from 'antd';
import { CameraOutlined, FileTextOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import BlackBoard from './blackboard';
import { useExecutionDump, useInsightDump } from '@/component/store';
import { timeStr, filterBase64Value } from '@/utils';

const ScreenshotItem = (props: { time: string; img: string }) => {
  return (
    <div className="screenshot-item">
      <div className="screenshot-item-title">{props.time}</div>
      <div>
        <img src={props.img} />
      </div>
    </div>
  );
};

const VIEW_TYPE_SCREENSHOT = 'screenshot';
const VIEW_TYPE_JSON = 'json';
const VIEW_TYPE_BLACKBOARD = 'blackboard';

const DetailPanel = (): JSX.Element => {
  const dumpId = useInsightDump((store) => store._loadId);
  const blackboardViewAvailable = Boolean(dumpId);
  const activeTask = useExecutionDump((store) => store.activeTask);
  const [preferredViewType, setViewType] = useState(dumpId ? VIEW_TYPE_BLACKBOARD : VIEW_TYPE_SCREENSHOT);

  const viewType =
    preferredViewType === VIEW_TYPE_BLACKBOARD && !dumpId ? VIEW_TYPE_SCREENSHOT : preferredViewType;

  let content;
  if (!activeTask) {
    content = <div>please select a task</div>;
  } else if (viewType === VIEW_TYPE_JSON) {
    content = (
      <div className="json-content">{filterBase64Value(JSON.stringify(activeTask, undefined, 2))}</div>
    );
  } else if (viewType === VIEW_TYPE_BLACKBOARD) {
    if (dumpId) {
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
              const str = item.timing ? `${fullTime} / ${item.timing}` : fullTime;
              return <ScreenshotItem key={index} time={str} img={item.screenshot!} />;
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
          setViewType(blackboardViewAvailable ? VIEW_TYPE_BLACKBOARD : VIEW_TYPE_SCREENSHOT);
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
    { label: 'Screenshots', value: VIEW_TYPE_SCREENSHOT, icon: <CameraOutlined /> },
    { label: 'JSON View', value: VIEW_TYPE_JSON, icon: <FileTextOutlined /> },
  ];
  if (blackboardViewAvailable) {
    options.unshift({ label: 'Visualization', value: VIEW_TYPE_BLACKBOARD, icon: <ScheduleOutlined /> });
  }
  return (
    <div className="detail-panel">
      <div className="view-switcher">
        <ConfigProvider
          theme={{
            components: {
              Segmented: {
                itemSelectedBg: '#D7D7D7',
                itemSelectedColor: '#000000',
                // itemHoverColor: '#ffffff',
                // itemHoverBg: '#A3D6D2', // @sub-blue
                /* 这里是你的组件 token */
              },
            },
          }}
        >
          <Segmented
            options={options}
            value={viewType}
            onChange={(value) => {
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
