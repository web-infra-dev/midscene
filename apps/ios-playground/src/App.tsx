import './App.less';
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
import IOSPlayer, { type IOSPlayerRefMethods } from './ios-player';

import './ios-device/index.less';

const { Content } = Layout;

export default function App() {
  const [form] = Form.useForm();
  const selectedType = Form.useWatch('type', form);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
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

  // iOS Player ref
  const iosPlayerRef = useRef<IOSPlayerRefMethods>(null);

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

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config);
    overrideServerConfig(config);
  }, [config]);

  // handle run button click
  const handleRun = useCallback(async () => {
    if (!serverValid) {
      messageApi.warning(
        'Playground server is not ready, please try again later',
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
      // Use a fixed context string for iOS since we don't have device selection
      const res = await requestPlaygroundServer('ios-device', type, prompt, {
        requestId: thisRunningId,
        deepThink,
      });

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
    messageApi,
    serverValid,
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
                          runButtonEnabled={serverValid && configAlreadySet}
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
                                npx --yes @midscene/ios-playground
                              </strong>
                              <br />
                              And make sure PyAutoGUI server is running on port
                              1412
                            </span>
                          }
                        />
                      </div>
                    </div>
                  </Form>
                </div>
              </Col>

              {/* right panel: IOSPlayer */}
              <Col className="app-panel right-panel">
                <div className="panel-content right-panel-content">
                  <IOSPlayer
                    ref={iosPlayerRef}
                    serverUrl="http://localhost:1412"
                    autoConnect={true}
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
