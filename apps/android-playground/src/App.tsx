import './App.css';
import { overrideAIConfig } from '@midscene/core/env';
import {
  EnvConfig,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import { Col, ConfigProvider, Form, Layout, Row, Space, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import DeviceList from './adb-devices';
import ScrcpyPlayer from './scrcpy-player';

import '@midscene/visualizer/index.css';

const { Content } = Layout;
const SERVER_URL = 'http://localhost:5700';
const PLAYGROUND_SERVER_URL = 'http://localhost:5800';

export default function App() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [connectToDevice, setConnectToDevice] = useState(false);
  const lastSelectedDeviceRef = useRef<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [connectionReady, setConnectionReady] = useState(false);
  const isFirstConnectionRef = useRef(true);
  const [result, setResult] = useState<PlaygroundResult | null>({
    result: null,
    dump: null,
    reportHTML: null,
    error: null,
  });
  const [replayCounter, setReplayCounter] = useState(0);
  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const { config } = useEnvConfig();
  const [loadingProgressText, setLoadingProgressText] = useState('');
  const currentRequestIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // handle device selection
  const handleDeviceSelect = useCallback(
    (deviceId: string) => {
      // if the deviceId is the same as the last selected device and has been selected, skip
      if (deviceId === lastSelectedDeviceRef.current) {
        console.log('device already selected, skip', deviceId);
        return;
      }

      setSelectedDeviceId(deviceId);
      lastSelectedDeviceRef.current = deviceId;

      // check connection ready status and consider whether it is the first connection
      if (connectionReady || isFirstConnectionRef.current) {
        console.log(
          'connection ready or first connection, try to connect device',
        );
        isFirstConnectionRef.current = false;

        setConnectToDevice(true);
        messageApi.success(`device selected: ${deviceId}`);
      } else {
        console.log(
          'connection not ready, wait for connection to device:',
          deviceId,
        );
      }
    },
    [messageApi, connectionReady],
  );

  // clear the polling interval
  const clearPollingInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // start polling task progress
  const startPollingProgress = useCallback(
    (requestId: string) => {
      clearPollingInterval();

      // set polling interval to 500ms
      pollIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch(
            `${PLAYGROUND_SERVER_URL}/task-progress/${requestId}`,
          );
          const data = await response.json();

          if (data.tip) {
            setLoadingProgressText(data.tip);
          }
        } catch (error) {
          console.error('Failed to poll task progress:', error);
        }
      }, 500);
    },
    [clearPollingInterval],
  );

  // clean up the polling when the component unmounts
  useEffect(() => {
    return () => {
      clearPollingInterval();
    };
  }, [clearPollingInterval]);

  // listen to the connection status change
  const handleConnectionStatusChange = useCallback(
    (status: boolean) => {
      setConnectionReady(status);

      // if the connection is ready and there is a selected device but not connected, try to connect
      if (status && selectedDeviceId && !connectToDevice) {
        setTimeout(() => {
          setConnectToDevice(true);
        }, 100);
      }
    },
    [selectedDeviceId],
  );

  // reset the connection flag
  useEffect(() => {
    if (connectToDevice) {
      // reset the connection flag, so that it can be triggered again
      const timer = setTimeout(() => {
        setConnectToDevice(false);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [connectToDevice]);

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config);
    fetch(`${PLAYGROUND_SERVER_URL}/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ aiConfig: config }),
    });
  }, [config]);

  // handle run button click
  const handleRun = useCallback(async () => {
    if (!selectedDeviceId) {
      messageApi.warning('please select a device first');
      return;
    }

    if (!connectionReady) {
      messageApi.warning(
        'waiting for connection to be established, please try again later',
      );
      return;
    }
    setLoading(true);
    setResult(null);
    setReplayScriptsInfo(null);
    setLoadingProgressText('');

    const { type, prompt } = form.getFieldsValue();

    // generate request ID
    const requestId = uuidv4();
    currentRequestIdRef.current = requestId;

    // start polling progress immediately
    startPollingProgress(requestId);

    try {
      const response = await fetch(`${PLAYGROUND_SERVER_URL}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context: selectedDeviceId,
          type,
          prompt,
          requestId,
        }),
      });
      const res = await response.json();

      // stop polling
      clearPollingInterval();

      setResult(res);
      setLoading(false);

      if (!response.ok) {
        throw new Error(`server returned status code: ${response.status}`);
      }

      // handle the special case of aiAction type, extract script information
      if (type === 'aiAction' && res?.dump) {
        console.log('type: ', type);
        const info = allScriptsFromDump(res.dump);
        setReplayScriptsInfo(info);
        setReplayCounter((c) => c + 1);
      } else {
        setReplayScriptsInfo(null);
      }
      messageApi.success('command executed');
    } catch (error) {
      clearPollingInterval();
      setLoading(false);
      console.error('execute command error:', error);
      messageApi.error(
        `execute command failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }, [
    selectedDeviceId,
    messageApi,
    connectionReady,
    form,
    startPollingProgress,
    clearPollingInterval,
  ]);

  const resetResult = () => {
    setResult(null);
    setReplayScriptsInfo(null);
    setLoading(false);
  };

  // handle stop button click
  const handleStop = useCallback(() => {
    clearPollingInterval();
    setLoading(false);
    resetResult();
    messageApi.info('operation stopped');
  }, [messageApi, clearPollingInterval]);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      {contextHolder}
      <Layout className="app-container">
        <Content style={{ padding: '16px', height: '100vh' }}>
          <div className="app-grid-layout">
            <Row gutter={[16, 16]} style={{ height: '100%' }}>
              {/* left panel: PromptInput */}
              <Col xs={24} sm={24} md={8} lg={8} xl={8} className="app-panel">
                <div className="panel-content">
                  <h2>Command input</h2>
                  <Form form={form}>
                    <Space direction="vertical" size="middle">
                      <EnvConfig />
                      <PromptInput
                        runButtonEnabled={!!selectedDeviceId && !loading}
                        form={form}
                        serviceMode="In-Browser"
                        selectedType="aiAction"
                        dryMode={false}
                        stoppable={loading}
                        loading={loading}
                        onRun={handleRun}
                        onStop={handleStop}
                      />
                      <PlaygroundResultView
                        result={result}
                        loading={loading}
                        serviceMode={'In-Browser-Extension'}
                        replayScriptsInfo={replayScriptsInfo}
                        replayCounter={replayCounter}
                        loadingProgressText={loadingProgressText}
                        verticalMode={true}
                      />
                    </Space>
                  </Form>
                </div>
              </Col>

              {/* middle panel: DeviceList */}
              <Col xs={24} sm={24} md={6} lg={6} xl={6} className="app-panel">
                <div className="panel-content">
                  <h2>Device list</h2>
                  <DeviceList
                    serverUrl={SERVER_URL}
                    onDeviceSelect={handleDeviceSelect}
                  />
                </div>
              </Col>

              {/* right panel: ScrcpyPlayer */}
              <Col
                xs={24}
                sm={24}
                md={10}
                lg={10}
                xl={10}
                className="app-panel"
              >
                <div className="panel-content">
                  <h2>
                    Screen Projection
                    {selectedDeviceId ? `(${selectedDeviceId})` : ''}
                  </h2>
                  <ScrcpyPlayer
                    serverUrl={SERVER_URL}
                    autoConnect={connectToDevice}
                    onConnectionStatusChange={handleConnectionStatusChange}
                  />
                </div>
              </Col>
            </Row>
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
