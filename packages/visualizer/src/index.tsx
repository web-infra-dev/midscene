import './index.less';
import DetailSide from '@/component/detail-side';
import Sidebar from '@/component/sidebar';
import { useExecutionDump } from '@/component/store';
import { CaretRightOutlined, DownOutlined } from '@ant-design/icons';
import type { GroupedActionDump } from '@midscene/core';
import { Helmet } from '@modern-js/runtime/head';
import { Alert, Button, ConfigProvider, Dropdown, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import logo from './component/assets/logo-plain.png';
import DetailPanel from './component/detail-panel';
import GlobalHoverPreview from './component/global-hover-preview';
import { iconForStatus, timeCostStrElement } from './component/misc';
import Player from './component/player';
import Timeline from './component/timeline';

const { Dragger } = Upload;
let globalRenderCount = 1;

interface ExecutionDumpWithPlaywrightAttributes extends GroupedActionDump {
  attributes: Record<string, any>;
}

export function Visualizer(props: {
  logoAction?: () => void;
  hideLogo?: boolean;
  dumps?: ExecutionDumpWithPlaywrightAttributes[];
}): JSX.Element {
  const { dumps, hideLogo = false } = props;

  const executionDump = useExecutionDump((store) => store.dump);
  const executionDumpLoadId = useExecutionDump(
    (store) => store._executionDumpLoadId,
  );
  const replayAllMode = useExecutionDump((store) => store.replayAllMode);
  const setReplayAllMode = useExecutionDump((store) => store.setReplayAllMode);
  const replayAllScripts = useExecutionDump(
    (store) => store.allExecutionAnimation,
  );
  const insightWidth = useExecutionDump((store) => store.insightWidth);
  const insightHeight = useExecutionDump((store) => store.insightHeight);
  const setGroupedDump = useExecutionDump((store) => store.setGroupedDump);
  const reset = useExecutionDump((store) => store.reset);
  const [mainLayoutChangeFlag, setMainLayoutChangeFlag] = useState(0);
  const mainLayoutChangedRef = useRef(false);

  useEffect(() => {
    if (dumps) {
      setGroupedDump(dumps[0]);
    }
    return () => {
      reset();
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      setMainLayoutChangeFlag((prev) => prev + 1);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    capture: false,
    customRequest: () => {
      // noop
    },
    beforeUpload(file) {
      const ifValidFile = file.name.endsWith('web-dump.json'); // || file.name.endsWith('.insight.json');
      if (!ifValidFile) {
        message.error('invalid file extension');
        return false;
      }
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          try {
            const data = JSON.parse(result);
            setGroupedDump(data[0]);
          } catch (e: any) {
            console.error(e);
            message.error('failed to parse dump data', e.message);
          }
        } else {
          message.error('Invalid dump file');
        }
      };
      return false;
    },
  };

  let mainContent: JSX.Element;
  if (!executionDump) {
    mainContent = (
      <div className="main-right uploader-wrapper">
        <Dragger className="uploader" {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <img
              alt="Midscene_logo"
              style={{ width: 80, margin: 'auto' }}
              src={logo}
            />
          </p>
          <p className="ant-upload-text">
            Click or drag the{' '}
            <b>
              <i>.web-dump.json</i>
            </b>{' '}
            {/* or{' '}
            <b>
              <i>.actions.json</i>
            </b>{' '} */}
            file into this area.
          </p>
          <p className="ant-upload-text">
            The latest dump file is usually placed in{' '}
            <b>
              <i>./midscene_run/report</i>
            </b>
          </p>
          <p className="ant-upload-text">
            All data will be processed locally by the browser. No data will be
            sent to the server.
          </p>
        </Dragger>
      </div>
    );

    // dump
  } else {
    const content = replayAllMode ? (
      <div className="replay-all-mode-wrapper">
        <Player
          key={`${executionDumpLoadId}`}
          replayScripts={replayAllScripts!}
          imageWidth={insightWidth!}
          imageHeight={insightHeight!}
        />
      </div>
    ) : (
      <PanelGroup autoSaveId="page-detail-layout-v2" direction="horizontal">
        <Panel defaultSize={75} maxSize={95}>
          <div className="main-content-container">
            <DetailPanel />
          </div>
        </Panel>
        <PanelResizeHandle />
        <Panel maxSize={95}>
          <div className="main-side">
            <DetailSide />
          </div>
        </Panel>
      </PanelGroup>
    );

    mainContent = (
      <PanelGroup
        autoSaveId="main-page-layout"
        direction="horizontal"
        onLayout={() => {
          if (!mainLayoutChangedRef.current) {
            setMainLayoutChangeFlag((prev) => prev + 1);
          }
        }}
      >
        <Panel maxSize={95} defaultSize={20}>
          <div className="page-side">
            <Sidebar logoAction={props?.logoAction} />
          </div>
        </Panel>
        <PanelResizeHandle
          onDragging={(isChanging) => {
            if (mainLayoutChangedRef.current && !isChanging) {
              // not changing anymore
              setMainLayoutChangeFlag((prev) => prev + 1);
            }
            mainLayoutChangedRef.current = isChanging;
          }}
        />
        <Panel defaultSize={80} maxSize={95}>
          <div className="main-right">
            <Timeline key={mainLayoutChangeFlag} />
            <div className="main-content">{content}</div>
          </div>
        </Panel>
      </PanelGroup>
    );
  }

  const [containerHeight, setContainerHeight] = useState('100%');
  useEffect(() => {
    const ifInRspressPage = document.querySelector('.rspress-nav');

    // modify rspress theme
    const navHeightKey = '--rp-nav-height';
    const originalNavHeight = getComputedStyle(
      document.documentElement,
    ).getPropertyValue(navHeightKey);

    if (ifInRspressPage) {
      const newNavHeight = '42px';
      setContainerHeight(`calc(100vh - ${newNavHeight})`);
      document.documentElement.style.setProperty(navHeightKey, newNavHeight);
    }

    // Cleanup function to revert the change
    return () => {
      if (ifInRspressPage) {
        document.documentElement.style.setProperty(
          navHeightKey,
          originalNavHeight,
        );
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      globalRenderCount += 1;
    };
  }, []);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#06b1ab',
        },
        components: {
          Layout: {
            headerHeight: 60,
            headerPadding: '0 30px',
            headerBg: '#FFF',
            bodyBg: '#FFF',
          },
        },
      }}
    >
      <Helmet>
        <title>Visualization - Midscene.js</title>
      </Helmet>
      <div
        className="page-container"
        key={`render-${globalRenderCount}`}
        style={{ height: containerHeight }}
      >
        <div className="page-nav">
          <div className="page-nav-left">
            <div className="logo">
              <img
                alt="Midscene_logo"
                src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/logo-light-with-text.png"
              />
            </div>
            <div className="page-nav-toolbar">
              <ConfigProvider
                theme={{
                  components: {
                    Button: { textHoverBg: '#bfc4da80' },
                  },
                }}
              >
                <Button
                  type="text"
                  icon={<CaretRightOutlined />}
                  disabled={!replayAllScripts || replayAllScripts.length === 0}
                  style={{
                    background: replayAllMode ? '#bfc4da80' : undefined,
                  }}
                  onClick={() => {
                    setReplayAllMode(true);
                  }}
                >
                  Replay All
                </Button>
              </ConfigProvider>
            </div>
          </div>
          <PlaywrightCaseSelector
            dumps={props.dumps}
            selected={executionDump}
            onSelect={(dump) => {
              setGroupedDump(dump);
            }}
          />
        </div>
        {mainContent}
      </div>
      <GlobalHoverPreview />
    </ConfigProvider>
  );
}

function PlaywrightCaseSelector(props: {
  dumps?: ExecutionDumpWithPlaywrightAttributes[];
  selected?: GroupedActionDump | null;
  onSelect?: (dump: GroupedActionDump) => void;
}) {
  if (!props.dumps || props.dumps.length <= 1) return null;

  const nameForDump = (dump: GroupedActionDump) =>
    `${dump.groupName} - ${dump.groupDescription}`;
  const items = (props.dumps || []).map((dump, index) => {
    const status = iconForStatus(dump.attributes?.playwright_test_status);
    const costStr = dump.attributes?.playwright_test_duration;
    const cost = costStr ? (
      <span key={index} className="cost-str">
        {' '}
        ({timeCostStrElement(Number.parseInt(costStr, 10))})
      </span>
    ) : null;
    return {
      key: index,
      label: (
        <a
          // biome-ignore lint/a11y/useValidAnchor: <explanation>
          onClick={(e) => {
            e.preventDefault();
            if (props.onSelect) {
              props.onSelect(dump);
            }
          }}
        >
          <div>
            {status}
            {'  '}
            {nameForDump(dump)}
            {cost}
          </div>
        </a>
      ),
    };
  });

  const btnName = props.selected
    ? nameForDump(props.selected)
    : 'Select a case';

  return (
    <div className="playwright-case-selector">
      <Dropdown menu={{ items }}>
        {/* biome-ignore lint/a11y/useValidAnchor: <explanation> */}
        <a onClick={(e) => e.preventDefault()}>
          {btnName}&nbsp;
          <DownOutlined />
        </a>
      </Dropdown>
    </div>
  );
}

function mount(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`failed to get element for id: ${id}`);
  }
  const root = ReactDOM.createRoot(element);

  const dumpElements = document.querySelectorAll(
    'script[type="midscene_web_dump"]',
  );
  if (dumpElements.length === 1 && dumpElements[0].textContent?.trim() === '') {
    const errorPanel = (
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: '100px',
          boxSizing: 'border-box',
        }}
      >
        <Alert
          message="Midscene.js - Error"
          description="There is no dump data to display."
          type="error"
          showIcon
        />
      </div>
    );
    return root.render(errorPanel);
  }

  const reportDump: ExecutionDumpWithPlaywrightAttributes[] = [];
  Array.from(dumpElements)
    .filter((el) => {
      const textContent = el.textContent;
      if (!textContent) {
        console.warn('empty content in script tag', el);
      }
      return !!textContent;
    })
    .forEach((el) => {
      const attributes: Record<string, any> = {};
      Array.from(el.attributes).forEach((attr) => {
        const { name, value } = attr;
        const valueDecoded = decodeURIComponent(value);
        if (name.startsWith('playwright_')) {
          attributes[attr.name] = valueDecoded;
        }
      });

      const content = el.textContent;
      let jsonContent: ExecutionDumpWithPlaywrightAttributes;
      try {
        jsonContent = JSON.parse(content!);
        jsonContent.attributes = attributes;
        reportDump.push(jsonContent);
      } catch (e) {
        console.error(el);
        console.error('failed to parse json content', e);
      }
    });

  root.render(<Visualizer dumps={reportDump} />);
}

export default {
  mount,
  Visualizer,
};
