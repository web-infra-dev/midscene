import './App.css';
import { MobileOutlined } from '@ant-design/icons';
import { overrideAIConfig } from '@midscene/core/env';
import { SCRCPY_SERVER_PORT } from '@midscene/shared/constants';
import {
  EnvConfig,
  Logo,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  getTaskProgress,
  globalThemeConfig,
  overrideServerConfig,
  requestPlaygroundServer,
  useEnvConfig,
  useServerValid,
} from '@midscene/visualizer';
import {
  Button,
  Col,
  ConfigProvider,
  Divider,
  Dropdown,
  Form,
  Layout,
  Row,
  Space,
  message,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Socket, io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import ScrcpyPlayer from './scrcpy-player';

import '@midscene/visualizer/index.css';

const { Content } = Layout;
const SERVER_URL = `http://localhost:${SCRCPY_SERVER_PORT}`;

const onlineStatus = (color: string) => (
  <span
    style={{
      color: color,
      marginRight: '4px',
      fontSize: '12px',
    }}
  >
    ●
  </span>
);
export default function App() {
  const [form] = Form.useForm();
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const serverValid = useServerValid(true);

  // Socket 连接及设备管理
  const socketRef = useRef<Socket | null>(null);

  // clear the polling interval
  const clearPollingInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // 连接到设备服务器
  useEffect(() => {
    const socket = io(SERVER_URL, {
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      console.log('connected to device server');
      socket.emit('get-devices');
    });

    socket.on('disconnect', (reason: string) => {
      console.log('disconnected from device server:', reason);
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
            handleDeviceSelect(data.devices[0].id);
          }
        }
        setLoadingDevices(false);
      },
    );

    socket.on('global-device-switched', (data: { deviceId: string }) => {
      setSelectedDeviceId(data.deviceId);
      console.log(`device switched to: ${data.deviceId}`);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('Socket.IO connection error:', error);
      messageApi.error('等待连接设备服务器，请稍后再试');
      setLoadingDevices(false);
    });

    socket.on('error', (error: Error) => {
      console.error('Socket.IO error:', error);
      messageApi.error(
        `与服务器通信时发生错误: ${error.message || '未知错误'}`,
      );
    });

    socketRef.current = socket;

    // 定期请求设备列表
    const timer = setTimeout(() => {
      if (socket.connected) {
        socket.emit('get-devices');
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      console.log('disconnect Socket.IO connection');
      socket.disconnect();
    };
  }, [messageApi]);

  // 切换设备
  const handleDeviceSelect = useCallback(
    (deviceId: string) => {
      if (deviceId === lastSelectedDeviceRef.current) {
        return;
      }

      if (!socketRef.current) {
        messageApi.warning(
          'Waiting for device server connection, please try again later',
        );
        return;
      }

      if (!socketRef.current.connected) {
        messageApi.warning(
          'Waiting for device server connection, please try again later',
        );
        return;
      }

      console.log(`开始切换设备到: ${deviceId}`);

      // 关闭下拉菜单
      setDropdownOpen(false);

      // 先断开当前连接，并重置相关状态
      setConnectToDevice(false);
      setConnectionReady(false);

      // 清理当前会话状态
      setResult(null);
      setReplayScriptsInfo(null);
      setLoading(false);
      clearPollingInterval();

      // 使用短暂延迟确保资源已清理
      setTimeout(() => {
        // 然后设置新的设备ID
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

            // 设备切换成功后，触发新设备连接
            console.log(`设备切换成功，准备连接: ${deviceId}`);
            setTimeout(() => {
              setConnectToDevice(true);
              messageApi.success(`Device selected: ${deviceId}`);
            }, 500); // 增加延迟，确保有足够时间完成切换
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
      }, 500); // 增加延迟，确保先断开连接
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
        // 只有当设备未切换时才重置 connectToDevice
        // 这样确保设备切换过程中不会重置连接状态
        if (selectedDeviceId === lastSelectedDeviceRef.current) {
          setConnectToDevice(false);
        }
      }, 800); // 增加延迟，确保有足够时间连接

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
      messageApi.warning('请先选择一个设备');
      return;
    }

    if (!connectionReady) {
      messageApi.warning('等待连接建立，请稍后再试');
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
      const res = await requestPlaygroundServer(
        selectedDeviceId,
        type,
        prompt,
        requestId,
      );

      // stop polling
      clearPollingInterval();

      setResult(res);
      setLoading(false);

      if (!res) {
        throw new Error('server returned empty response');
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
      messageApi.success('命令已执行');
    } catch (error) {
      clearPollingInterval();
      setLoading(false);
      console.error('execute command error:', error);
      messageApi.error(
        `执行命令失败: ${error instanceof Error ? error.message : '未知错误'}`,
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
    messageApi.info('操作已停止');
  }, [messageApi, clearPollingInterval]);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      {contextHolder}
      <Layout className="app-container">
        <Content style={{ height: '100vh', overflow: 'hidden' }}>
          <div className="app-grid-layout">
            <Row
              style={{
                height: '100%',
                display: 'flex',
                flexWrap: 'nowrap',
                width: '100%',
              }}
            >
              {/* left panel: PromptInput */}
              <Col
                className="app-panel"
                style={{
                  width: '480px',
                  flex: 'none',
                  borderTopLeftRadius: '20px',
                  borderBottomLeftRadius: '20px',
                }}
              >
                <div
                  className="panel-content"
                  style={{
                    borderTopLeftRadius: '20px',
                    borderBottomLeftRadius: '20px',
                  }}
                >
                  <Logo />
                  <h2 style={{ color: '#000', fontSize: 18 }}>Command input</h2>
                  <Form form={form}>
                    <Space direction="vertical" size="middle">
                      <EnvConfig />
                      <PromptInput
                        runButtonEnabled={
                          !!selectedDeviceId && configAlreadySet
                        }
                        form={form}
                        serviceMode="Server"
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
                        serverValid={serverValid}
                        serviceMode={'Server'}
                        replayScriptsInfo={replayScriptsInfo}
                        replayCounter={replayCounter}
                        loadingProgressText={loadingProgressText}
                        verticalMode={true}
                      />
                    </Space>
                  </Form>
                </div>
              </Col>

              {/* right panel: ScrcpyPlayer */}
              <Col
                className="app-panel"
                style={{
                  borderRadius: '0',
                  flex: '1',
                  overflow: 'hidden',
                  boxShadow: '-4px 0px 20px 0px #0000000A',
                }}
              >
                <div className="panel-content" style={{ borderRadius: '0' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: '18px',
                          color: '#000',
                          marginRight: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          height: '32px',
                        }}
                      >
                        Device
                      </h2>
                      <Dropdown
                        trigger={['click']}
                        placement="bottomLeft"
                        open={dropdownOpen}
                        onOpenChange={setDropdownOpen}
                        dropdownRender={() => (
                          <div
                            style={{
                              width: '430px',
                              background: '#fff',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              boxShadow: '0px 10px 20px 0px #00000005',
                              border: '1px solid #EAEDF1',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '16px 16px 12px',
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 'bold',
                                  fontSize: '16px',
                                  color: '#333',
                                }}
                              >
                                Devices list
                              </span>
                            </div>
                            <div>
                              {devices.map((device) => (
                                <div
                                  key={device.id}
                                  onClick={() => {
                                    if (
                                      device.status.toLowerCase() === 'device'
                                    ) {
                                      handleDeviceSelect(device.id);
                                    }
                                  }}
                                  style={{
                                    padding: '5px 17px 9px 6px',
                                    background:
                                      device.status.toLowerCase() ===
                                        'device' &&
                                      selectedDeviceId === device.id
                                        ? '#00B4AC14'
                                        : 'transparent',
                                    cursor:
                                      device.status.toLowerCase() === 'device'
                                        ? 'pointer'
                                        : 'not-allowed',
                                    opacity:
                                      device.status.toLowerCase() === 'device'
                                        ? 1
                                        : 0.5,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: '34px',
                                        height: '34px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: '12px',
                                      }}
                                    >
                                      <MobileOutlined
                                        style={{
                                          fontSize: '22px',
                                          color: '#666',
                                        }}
                                      />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div
                                        style={{
                                          fontWeight: 'bold',
                                          fontSize: '15px',
                                          color: '#333',
                                        }}
                                      >
                                        {device.name || device.id}
                                      </div>
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          marginTop: '4px',
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            marginRight: '12px',
                                          }}
                                        >
                                          {device.status.toLowerCase() ===
                                          'device' ? (
                                            <>
                                              {onlineStatus('#52c41a')}
                                              <span
                                                style={{
                                                  color: '#666',
                                                  fontSize: '12px',
                                                }}
                                              >
                                                Online
                                              </span>
                                            </>
                                          ) : (
                                            <>
                                              {onlineStatus('#f5222d')}
                                              <span
                                                style={{
                                                  color: '#666',
                                                  fontSize: '12px',
                                                }}
                                              >
                                                Offline
                                              </span>
                                            </>
                                          )}
                                        </div>
                                        <Divider
                                          type="vertical"
                                          style={{
                                            margin: '0 4px',
                                          }}
                                        />
                                        <div
                                          style={{
                                            color: '#999',
                                            fontSize: '12px',
                                          }}
                                        >
                                          Device ID: {device.id}
                                        </div>
                                      </div>
                                    </div>
                                    {device.status.toLowerCase() === 'device' &&
                                      selectedDeviceId === device.id && (
                                        <div
                                          style={{
                                            marginLeft: 'auto',
                                            color: '#1890ff',
                                            fontWeight: 'bold',
                                            fontSize: '13px',
                                          }}
                                        >
                                          Current device
                                        </div>
                                      )}
                                  </div>
                                </div>
                              ))}
                              {devices.length === 0 && (
                                <div
                                  style={{
                                    padding: '20px',
                                    textAlign: 'center',
                                    color: '#999',
                                  }}
                                >
                                  No devices found
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      >
                        <Button
                          style={{
                            border: 'none',
                            padding: '4px 12px 4px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            background: '#f0f0f0',
                            borderRadius: '20px',
                            boxShadow: 'none',
                            height: '32px',
                          }}
                        >
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: '#3b82f6',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                            }}
                          >
                            <MobileOutlined
                              style={{
                                fontSize: '14px',
                                color: 'white',
                              }}
                            />
                            {selectedDeviceId && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: '-5px',
                                  bottom: '-5px',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                {devices
                                  .find((d) => d.id === selectedDeviceId)
                                  ?.status.toLowerCase() === 'device' ? (
                                  <>{onlineStatus('#52c41a')}</>
                                ) : (
                                  <>{onlineStatus('#f5222d')}</>
                                )}
                              </div>
                            )}
                          </div>
                          <span
                            style={{
                              fontWeight: 'bold',
                              fontSize: '16px',
                              color: '#333',
                              maxWidth: '120px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {selectedDeviceId
                              ? devices.find((d) => d.id === selectedDeviceId)
                                  ?.name || selectedDeviceId
                              : ''}
                          </span>
                          <span
                            style={{
                              color: '#666',
                              fontSize: '12px',
                              transform: 'scaleY(0.6)',
                              fontWeight: 'bold',
                            }}
                          >
                            ▼
                          </span>
                        </Button>
                      </Dropdown>
                    </div>
                  </div>
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
