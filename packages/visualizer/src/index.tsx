import './index.less';
import { ConfigProvider, message, Upload, Button } from 'antd';
import type { UploadProps } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Helmet } from '@modern-js/runtime/head';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { GroupedActionDump } from '@midscene/core';
import Timeline from './component/timeline';
import DetailPanel from './component/detail-panel';
import Logo from './component/assets/logo-plain.svg';
import GlobalHoverPreview from './component/global-hover-preview';
import demoDump from './demo-dump.json';
import { useExecutionDump } from '@/component/store';
import DetailSide from '@/component/detail-side';
import Sidebar from '@/component/sidebar';

const { Dragger } = Upload;

let globalRenderCount = 1;

export function Visualizer(props: {
  hideLogo?: boolean;
  logoAction?: () => void;
  dump?: GroupedActionDump[];
}): JSX.Element {
  const { dump } = props;

  const executionDump = useExecutionDump((store) => store.dump);
  const setGroupedDump = useExecutionDump((store) => store.setGroupedDump);
  const reset = useExecutionDump((store) => store.reset);
  const [mainLayoutChangeFlag, setMainLayoutChangeFlag] = useState(0);
  const mainLayoutChangedRef = useRef(false);

  useEffect(() => {
    if (dump) {
      setGroupedDump(dump);
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
      // const ifActionFile =
      //   file.name.endsWith('.actions.json') || /_force_regard_as_action_file/.test(location.href);
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
            // setMainLayoutChangeFlag((prev) => prev + 1);
            setGroupedDump(data);
            // if (ifActionFile) {
            // } else {
            //   loadInsightDump(data);
            // }
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

  const loadDemoDump = () => {
    setGroupedDump(demoDump as any);
  };

  let mainContent: JSX.Element;
  if (!executionDump) {
    mainContent = (
      <div className="main-right uploader-wrapper">
        <Dragger className="uploader" {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <Logo style={{ width: 100, height: 100, margin: 'auto' }} />
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
            All data will be processed locally by the browser. No data will be sent to the server.
          </p>
        </Dragger>
        <div className="demo-loader">
          <Button type="link" onClick={loadDemoDump}>
            Load Demo
          </Button>
        </div>
      </div>
    );

    // dump
  } else {
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
          <Sidebar hideLogo={props?.hideLogo} logoAction={props?.logoAction} />
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
            <div className="main-content">
              <PanelGroup autoSaveId="page-detail-layout" direction="horizontal">
                <Panel maxSize={95}>
                  <div className="main-side">
                    <DetailSide />
                  </div>
                </Panel>
                <PanelResizeHandle />

                <Panel defaultSize={75} maxSize={95}>
                  <div className="main-canvas-container">
                    <DetailPanel />
                  </div>
                </Panel>
              </PanelGroup>
            </div>
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
    const originalNavHeight = getComputedStyle(document.documentElement).getPropertyValue(navHeightKey);

    if (ifInRspressPage) {
      const newNavHeight = '42px';
      setContainerHeight(`calc(100vh - ${newNavHeight})`);
      document.documentElement.style.setProperty(navHeightKey, newNavHeight);
    }

    // Cleanup function to revert the change
    return () => {
      if (ifInRspressPage) {
        document.documentElement.style.setProperty(navHeightKey, originalNavHeight);
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
        <title>MidScene.js - Visualization Tool</title>
      </Helmet>
      <div className="page-container" key={`render-${globalRenderCount}`} style={{ height: containerHeight }}>
        {mainContent}
      </div>
      <GlobalHoverPreview />
    </ConfigProvider>
  );
}

export default Visualizer;
