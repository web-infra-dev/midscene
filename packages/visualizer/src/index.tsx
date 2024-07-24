import './index.less';
import { ConfigProvider, message, Upload, Button } from 'antd';
import type { UploadProps } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Helmet } from '@modern-js/runtime/head';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Timeline from './component/timeline';
import DetailPanel from './component/detail-panel';
import Logo from './component/assets/logo-plain.svg';
import { useExecutionDump, useInsightDump } from '@/component/store';
import DetailSide from '@/component/detail-side';
import Sidebar from '@/component/sidebar';
import GlobalHoverPreview from './component/global-hover-preview';

const { Dragger } = Upload;
const Index = (): JSX.Element => {
  const executionDump = useExecutionDump((store) => store.dump);
  const setGroupedDump = useExecutionDump((store) => store.setGroupedDump);
  const reset = useExecutionDump((store) => store.reset);
  const [mainLayoutChangFlag, setMainLayoutChangFlag] = useState(0);
  const mainLayoutChangedRef = useRef(false);

  useEffect(() => {
    return () => {
      reset();
    };
  }, []);

  // TODO
  // const loadInsightDump = (dump: InsightDump) => {
  //   console.log('will convert insight dump to execution dump');
  //   const data = insightDumpToExecutionDump(dump);
  //   console.log(data);

  //   setExecutionDump(data);
  // };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    customRequest: () => {
      // noop
    },
    beforeUpload(file) {
      const ifValidFile = file.name.endsWith('all-logs.json'); // || file.name.endsWith('.insight.json');
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
            // setMainLayoutChangFlag((prev) => prev + 1);
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

  const loadTasksDemo = () => {
    // setExecutionDump(actionDemo);
    // message.info('Your are viewing the demo data.');
  };

  const loadInsightDemo = () => {
    // loadInsightDump(InsightDemo);
    // message.info('Your are viewing the demo data.');
  };

  let mainContent: JSX.Element;
  if (!executionDump) {
    mainContent = (
      <div className="main-right uploader-wrapper">
        <Dragger className="uploader" {...uploadProps}>
          <p className="ant-upload-drag-icon">
            {/* @ts-expect-error */}
            <Logo style={{ width: 100, height: 100, margin: 'auto' }} />
            {/* <img src={logo} alt="logo" style={{ width: 100, margin: 'auto' }} /> */}
          </p>
          <p className="ant-upload-text">
            Click or drag the{' '}
            <b>
              <i>.all-logs.json</i>
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
              <i>./midscene_run/</i>
            </b>
          </p>
          <p className="ant-upload-text">
            All data will be processed locally by the browser. No data will be sent to the server.
          </p>
        </Dragger>
        <div className="demo-loader">
          <Button type="link" onClick={loadTasksDemo}>
            Load Tasks Demo
          </Button>
          <Button type="link" onClick={loadInsightDemo}>
            Load Insight Demo
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
          if (mainLayoutChangFlag === 0) {
            requestAnimationFrame(() => {
              setMainLayoutChangFlag(1); // first layout
            });
          }
        }}
      >
        <Panel maxSize={95}>
          <Sidebar />
        </Panel>
        <PanelResizeHandle
          onDragging={(isChanging) => {
            if (mainLayoutChangedRef.current && !isChanging) {
              // not changing anymore
              setMainLayoutChangFlag((prev) => prev + 1);
            }
            mainLayoutChangedRef.current = isChanging;
          }}
        />
        <Panel defaultSize={80} maxSize={95}>
          <div className="main-right">
            {mainLayoutChangFlag > 0 ? <Timeline key={mainLayoutChangFlag} /> : null}
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
      <div className="page-container">{mainContent}</div>
      <GlobalHoverPreview />
    </ConfigProvider>
  );
};

export default Index;
