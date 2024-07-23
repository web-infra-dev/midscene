import './index.less';
import { Layout, ConfigProvider, message, Upload, Button } from 'antd';
import type { UploadProps } from 'antd';
import { useEffect } from 'react';
import { Helmet } from '@modern-js/runtime/head';
import Sider from 'antd/es/layout/Sider';
import Timeline from './component/timeline';
import DetailPanel from './component/detail-panel';
import Logo from './component/assets/logo-plain.svg';
import { useExecutionDump, useInsightDump } from '@/component/store';
import DetailSide from '@/component/detail-side';
import Sidebar from '@/component/sidebar';

const { Content } = Layout;
const { Dragger } = Upload;
const Index = (): JSX.Element => {
  const executionDump = useExecutionDump((store) => store.dump);
  const setGroupedDump = useExecutionDump((store) => store.setGroupedDump);
  const reset = useExecutionDump((store) => store.reset);

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
              <i>.insight.json</i>
            </b>{' '}
            or{' '}
            <b>
              <i>.actions.json</i>
            </b>{' '}
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
      <div className="main-right">
        <Timeline />
        <div className="main-content">
          <div className="main-side">
            <DetailSide />
          </div>

          <div className="main-canvas-container">
            <DetailPanel />
          </div>
        </div>
      </div>
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
      <div className="page-container">
        <Layout style={{ height: '100' }}>
          <Sider width={240} style={{ background: 'none', display: executionDump ? 'block' : 'none' }}>
            <Sidebar />
          </Sider>
          <Layout>
            <Content>{mainContent}</Content>
          </Layout>
        </Layout>
      </div>
    </ConfigProvider>
  );
};

export default Index;
