import './App.less';
import { SCRCPY_SERVER_PORT } from '@midscene/shared/constants';
import { overrideAIConfig } from '@midscene/shared/env';
import {
  EnvConfig,
  Logo,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  cancelTask,
  getTaskProgress,
  globalThemeConfig,
  overrideServerConfig,
  requestPlaygroundServer,
  useEnvConfig,
  useServerValid,
} from '@midscene/visualizer';
import { Col, ConfigProvider, Form, Layout, Row, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Socket, io } from 'socket.io-client';
import AdbDevice from './adb-device';
import ScrcpyPlayer, { type ScrcpyRefMethods } from './scrcpy-player';

import '@midscene/visualizer/index.css';
import './adb-device/index.less';

const { Content } = Layout;
const SERVER_URL = `http://localhost:${SCRCPY_SERVER_PORT}`;

export default function App() {
  const [form] = Form.useForm();
  const selectedType = Form.useWatch('type', form);
  const [loading, setLoading] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [connectToDevice, setConnectToDevice] = useState(false);
  const [devices, setDevices] = useState<
    { id: string; name: string; status: string }[]
  >([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const lastSelectedDeviceRef = useRef<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [connectionReady, setConnectionReady] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>({
    result: undefined,
    dump: null,
    reportHTML: null,
    error: null,
  });
  const [replayCounter, setReplayCounter] = useState(0);
  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const { config, deepThink } = useEnvConfig();
  const [loadingProgressText, setLoadingProgressText] = useState('');
  const currentRequestIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const serverValid = useServerValid(true);

  // Socket connection and device management
  const socketRef = useRef<Socket | null>(null);
  // Add a ref to ScrcpyPlayer
  const scrcpyPlayerRef = useRef<ScrcpyRefMethods>(null);

  // clear the polling interval
  const clearPollingInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // connect to device server
  useEffect(() => {
    const socket = io(SERVER_URL, {
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      socket.emit('get-devices');
    });

    socket.on('disconnect', (_reason: string) => {
      setLoadingDevices(true);
    });

    socket.on(
      'devices-list',
      (data: {
        devices: { id: string; name: string; status: string }[];
        currentDeviceId: string | null;
      }) => {
        setDevices(data.devices);
        if (data.currentDeviceId) {
          setSelectedDeviceId(data.currentDeviceId);

          if (data.devices.length === 1) {
            handleDeviceSelect(data.devices[0].id, true);
          }
        }
        setLoadingDevices(false);
      },
    );

    socket.on('global-device-switched', (data: { deviceId: string }) => {
      setSelectedDeviceId(data.deviceId);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('Socket.IO connection error:', error);
      messageApi.error(
        'Waiting for device server connection, please try again later',
      );
      setLoadingDevices(false);
    });

    socket.on('error', (error: Error) => {
      console.error('Socket.IO error:', error);
      messageApi.error(
        `Error occurred while communicating with the server: ${error.message || 'Unknown error'}`,
      );
    });

    socketRef.current = socket;

    // request device list periodically
    const timer = setTimeout(() => {
      if (socket.connected) {
        socket.emit('get-devices');
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [messageApi]);

  // switch device
  const handleDeviceSelect = useCallback(
    (deviceId: string, silent = false) => {
      if (deviceId === lastSelectedDeviceRef.current) {
        return;
      }

      if (!socketRef.current || !socketRef.current.connected) {
        messageApi.warning(
          'Waiting for device server connection, please try again later',
        );
        return;
      }

      // disconnect current connection and reset related status
      setConnectToDevice(false);
      setConnectionReady(false);

      // clean current session status
      setResult(null);
      setReplayScriptsInfo(null);
      setLoading(false);
      clearPollingInterval();

      // use a short delay to ensure resources are cleaned
      setTimeout(() => {
        // then set the new device id
        setSelectedDeviceId(deviceId);
        lastSelectedDeviceRef.current = deviceId;

        setLoadingDevices(true);
        if (socketRef.current) {
          socketRef.current.emit('switch-device', deviceId);

          const timeoutId = setTimeout(() => {
            setLoadingDevices(false);
            messageApi.error('Device switch timeout, please try again');
          }, 10000);

          socketRef.current.once('device-switched', () => {
            clearTimeout(timeoutId);
            setLoadingDevices(false);

            // after device switched, trigger new device connection
            setTimeout(() => {
              setConnectToDevice(true);
              if (!silent) {
                messageApi.success(`Device selected: ${deviceId}`);
              }
            }, 500); // add delay to ensure enough time for switch
          });

          socketRef.current.once('error', (error: Error) => {
            clearTimeout(timeoutId);
            setLoadingDevices(false);
            messageApi.error(`Device switch failed: ${error.message}`);
          });
        } else {
          setLoadingDevices(false);
          messageApi.error('Socket connection lost, please refresh the page');
        }
      }, 500); // add delay to ensure enough time for switch
    },
    [messageApi, clearPollingInterval],
  );

  // start polling task progress
  const startPollingProgress = useCallback(
    (requestId: string) => {
      clearPollingInterval();

      // set polling interval to 500ms
      pollIntervalRef.current = setInterval(async () => {
        try {
          const data = await getTaskProgress(requestId);

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
        // only reset connectToDevice when the device is not switched
        // this ensures that the connection status is not reset during device switch
        if (selectedDeviceId === lastSelectedDeviceRef.current) {
          setConnectToDevice(false);
        }
      }, 800); // add delay to ensure enough time for connection

      return () => clearTimeout(timer);
    }
  }, [connectToDevice, selectedDeviceId]);

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config);
    overrideServerConfig(config);
  }, [config]);

  // handle run button click
  const handleRun = useCallback(async () => {
    if (!selectedDeviceId) {
      messageApi.warning('Please select a device first');
      return;
    }

    if (!connectionReady) {
      messageApi.warning(
        'Waiting for connection establishment, please try again later',
      );
      return;
    }

    setLoading(true);
    setResult(null);
    setReplayScriptsInfo(null);
    setLoadingProgressText('');

    const { type, prompt } = form.getFieldsValue();

    const thisRunningId = Date.now().toString();

    currentRequestIdRef.current = thisRunningId;

    // start polling progress immediately
    startPollingProgress(thisRunningId);

    try {
      const res = await requestPlaygroundServer(
        selectedDeviceId,
        type,
        prompt,
        {
          requestId: thisRunningId,
          deepThink,
        },
      );

      // stop polling
      clearPollingInterval();

      setResult(res);
      setLoading(false);

      if (!res) {
        throw new Error('server returned empty response');
      }

      // handle the special case of aiAction type, extract script information
      if (res?.dump && !['aiQuery', 'aiAssert'].includes(type)) {
        const info = allScriptsFromDump(res.dump);
        setReplayScriptsInfo(info);
        setReplayCounter((c) => c + 1);
      } else {
        setReplayScriptsInfo(null);
      }
      messageApi.success('Command executed');
    } catch (error) {
      clearPollingInterval();
      setLoading(false);
      console.error('execute command error:', error);
      messageApi.error(
        `Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }, [
    selectedDeviceId,
    messageApi,
    connectionReady,
    form,
    startPollingProgress,
    clearPollingInterval,
    deepThink,
  ]);

  const resetResult = () => {
    setResult(null);
    setReplayScriptsInfo(null);
    setLoading(false);
  };

  // handle stop button click
  const handleStop = useCallback(async () => {
    clearPollingInterval();
    setLoading(false);
    resetResult();
    if (currentRequestIdRef.current) {
      await cancelTask(currentRequestIdRef.current);
    }
    messageApi.info('Operation stopped');
  }, [messageApi, clearPollingInterval]);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      {contextHolder}
      <Layout className="app-container playground-container vertical-mode">
        <Content className="app-content">
          <div className="app-grid-layout">
            <Row className="app-grid-layout">
              {/* left panel: PromptInput */}
              <Col className="app-panel left-panel">
                <div className="panel-content left-panel-content">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <Logo />
                    <EnvConfig />
                  </div>
                  <h2>Command input</h2>
                  <Form form={form} className="command-form">
                    <div className="form-content">
                      <div className="command-input-wrapper">
                        <PromptInput
                          runButtonEnabled={
                            !!selectedDeviceId && configAlreadySet
                          }
                          form={form}
                          serviceMode="Server"
                          selectedType={selectedType}
                          dryMode={false}
                          stoppable={loading}
                          loading={loading}
                          onRun={handleRun}
                          onStop={handleStop}
                        />
                      </div>
                      <div
                        className="result-container"
                        style={
                          result
                            ? {}
                            : {
                                border: '1px solid #0000001f',
                                borderRadius: '8px',
                              }
                        }
                      >
                        <PlaygroundResultView
                          result={result}
                          loading={loading}
                          serverValid={serverValid}
                          serviceMode="Server"
                          replayScriptsInfo={replayScriptsInfo}
                          replayCounter={replayCounter}
                          loadingProgressText={loadingProgressText}
                          verticalMode={false}
                          notReadyMessage={
                            <span>
                              Don&apos;t worry, just one more step to launch the
                              playground server.
                              <br />
                              <strong>
                                npx --yes @midscene/android-playground
                              </strong>
                            </span>
                          }
                        />
                      </div>
                    </div>
                  </Form>
                </div>
              </Col>

              {/* right panel: ScrcpyPlayer */}
              <Col className="app-panel right-panel">
                <div className="panel-content right-panel-content">
                  <AdbDevice
                    devices={devices}
                    loadingDevices={loadingDevices}
                    selectedDeviceId={selectedDeviceId}
                    onDeviceSelect={handleDeviceSelect}
                    socketRef={socketRef}
                    scrcpyPlayerRef={scrcpyPlayerRef}
                  />
                  <ScrcpyPlayer
                    ref={scrcpyPlayerRef}
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
