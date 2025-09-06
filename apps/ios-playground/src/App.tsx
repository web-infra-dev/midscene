import './App.less';
import type { DeviceAction } from '@midscene/core';
import { PlaygroundSDK } from '@midscene/playground';
import { overrideAIConfig } from '@midscene/shared/env';
import {
  EnvConfig,
  Logo,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  globalThemeConfig,
  useEnvConfig,
  useServerValid,
} from '@midscene/visualizer';
import { Col, ConfigProvider, Form, Layout, Row, message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [actionSpace, setActionSpace] = useState<DeviceAction<any>[]>([]);

  // Initialize PlaygroundSDK only once
  const playgroundSDK = useMemo(() => {
    return new PlaygroundSDK({
      type: 'remote-execution',
    });
  }, []);

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
          const data = await playgroundSDK.getTaskProgress(requestId);

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
  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config);
    playgroundSDK.overrideConfig(config);
  }, [config, playgroundSDK]);

  // Initialize actionSpace
  useEffect(() => {
    const loadActionSpace = async () => {
      try {
        const space = await playgroundSDK.getActionSpace('ios-device');
        setActionSpace(space || []);
      } catch (error) {
        console.error('Failed to load actionSpace:', error);
        setActionSpace([]);
      }
    };

    if (serverValid) {
      loadActionSpace();
    }
  }, [serverValid]);

  // handle run button click
  const handleRun = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setReplayScriptsInfo(null);
    setLoadingProgressText('');

    const value = form.getFieldsValue();
    const { type, prompt, params } = value;

    // Dynamic validation using actionSpace like Chrome Extension
    const action = actionSpace?.find(
      (a: DeviceAction<any>) => a.interfaceAlias === type || a.name === type,
    );

    // Check if this action needs structured params (has paramSchema with actual fields)
    const needsStructuredParams = (() => {
      if (!action?.paramSchema) return false;

      // Check if paramSchema actually has fields
      if (
        typeof action.paramSchema === 'object' &&
        'shape' in action.paramSchema
      ) {
        const shape = (action.paramSchema as any).shape || {};
        const shapeKeys = Object.keys(shape);
        return shapeKeys.length > 0; // Only need structured params if there are actual fields
      }

      // If paramSchema exists but not in expected format, assume it needs params
      return true;
    })();

    // Check if this method needs any input at all
    const needsAnyInput = (() => {
      // If action exists in actionSpace, check if it has required parameters
      if (action) {
        // Check if the paramSchema has any required fields
        if (
          action.paramSchema &&
          typeof action.paramSchema === 'object' &&
          'shape' in action.paramSchema
        ) {
          const shape = (action.paramSchema as any).shape || {};

          // Check if any field is required (not optional)
          // For this we need to implement the unwrapZodType logic here or import it
          // For now, let's assume if shape is empty, no input is needed
          const shapeKeys = Object.keys(shape);
          if (shapeKeys.length === 0) {
            return false; // No parameters = no input needed
          }

          // If has parameters, assume input is needed (can be refined later)
          return true;
        }

        // If has paramSchema but not a proper object, assume it needs input
        return !!action.paramSchema;
      }

      // If not found in actionSpace, assume most methods need input
      return true;
    })();

    // Validate inputs based on method requirements
    if (needsStructuredParams && !params) {
      messageApi.error('Structured parameters are required for this action');
      return;
    } else if (needsAnyInput && !needsStructuredParams && !prompt) {
      messageApi.error('Prompt is required');
      return;
    }
    // Note: methods that don't need any input (needsAnyInput = false) skip validation

    const thisRunningId = Date.now().toString();

    currentRequestIdRef.current = thisRunningId;

    // start polling progress immediately
    startPollingProgress(thisRunningId);

    try {
      const res = (await playgroundSDK.executeAction(
        type,
        {
          type,
          prompt,
          params,
        },
        {
          context: 'ios-device',
          requestId: thisRunningId,
          deepThink,
        },
      )) as PlaygroundResult;

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
  }, [messageApi, form, startPollingProgress, clearPollingInterval, deepThink]);

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
      await playgroundSDK.cancelTask(currentRequestIdRef.current);
    }
    messageApi.info('Operation stopped');
  }, [messageApi, clearPollingInterval, playgroundSDK]);

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
                          actionSpace={actionSpace}
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
