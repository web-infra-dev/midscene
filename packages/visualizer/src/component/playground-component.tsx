import {
  BorderOutlined,
  HistoryOutlined,
  LoadingOutlined,
  SendOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { GroupedActionDump, UIContext } from '@midscene/core';
import { Helmet } from '@modern-js/runtime/head';
import { Alert, Button, Checkbox, Select, Spin, Tooltip, message } from 'antd';
import { Form, Input } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Blackboard from './blackboard';
import { iconForStatus } from './misc';
import Player from './player';
import DemoData from './playground-demo-ui-context.json';
import type { ReplayScriptsInfo } from './replay-scripts';
import { allScriptsFromDump } from './replay-scripts';
import './playground-component.less';
import Logo from './logo';
import { serverBase, useServerValid } from './open-in-playground';

import { overrideAIConfig } from '@midscene/core/env';
import {
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
  StaticPage,
  StaticPageAgent,
} from '@midscene/web/playground';
import type { WebUIContext } from '@midscene/web/utils';
import type { MenuProps } from 'antd';
import { Dropdown, Space } from 'antd';
import { EnvConfig } from './env-config';
import { type HistoryItem, useChromeTabInfo, useEnvConfig } from './store';

import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
import { buildYaml } from '@midscene/web/yaml';
import ButtonGroup from 'antd/es/button/button-group';

interface PlaygroundResult {
  result: any;
  dump: GroupedActionDump | null;
  reportHTML: string | null;
  error: string | null;
}

const requestPlaygroundServer = async (
  context: UIContext,
  type: string,
  prompt: string,
) => {
  const res = await fetch(`${serverBase}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context, type, prompt }),
  });
  return res.json();
};

const actionNameForType = (type: string) => {
  if (type === 'aiAction') return 'Action';
  if (type === 'aiQuery') return 'Query';
  if (type === 'aiAssert') return 'Assert';
  return type;
};

const { TextArea } = Input;

export const staticAgentFromContext = (context: WebUIContext) => {
  const page = new StaticPage(context);
  return new StaticPageAgent(page);
};

export const useStaticPageAgent = (
  context: WebUIContext | undefined | null,
): StaticPageAgent | null => {
  const agent = useMemo(() => {
    if (!context) return null;

    return staticAgentFromContext(context);
  }, [context]);
  return agent;
};

const useHistorySelector = (onSelect: (history: HistoryItem) => void) => {
  const history = useEnvConfig((state) => state.history);
  const clearHistory = useEnvConfig((state) => state.clearHistory);

  const items: MenuProps['items'] = history.map((item, index) => ({
    label: (
      <a onClick={() => onSelect(item)}>
        {actionNameForType(item.type)} - {item.prompt.slice(0, 50)}
        {item.prompt.length > 50 ? '...' : ''}
      </a>
    ),
    key: String(index),
  }));

  items.push({
    type: 'divider',
  });

  items.push({
    label: (
      <a onClick={() => clearHistory()}>
        <Space>Clear History</Space>
      </a>
    ),
    key: 'clear',
  });

  return history.length > 0 ? (
    <div className="history-selector">
      <Dropdown menu={{ items }}>
        <Space>
          <HistoryOutlined />
          history
        </Space>
      </Dropdown>
    </div>
  ) : null;
};

const errorMessageServerNotReady = (
  <span>
    Don't worry, just one more step to launch the playground server.
    <br />
    Please run one of the commands under the midscene project directory:
    <br />
    a. <strong>npx midscene-playground</strong>
    <br />
    b. <strong>npx --yes @midscene/web</strong>
  </span>
);

const serverLaunchTip = (
  <div className="server-tip">
    <Alert
      message="Playground Server Not Ready"
      description={errorMessageServerNotReady}
      type="warning"
    />
  </div>
);

// remember to destroy the agent when the tab is destroyed: agent.page.destroy()
export const extensionAgentForTab = (forceSameTabNavigation = true) => {
  const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
  return new ChromeExtensionProxyPageAgent(page);
};

const blankResult: PlaygroundResult = {
  result: null,
  dump: null,
  reportHTML: null,
  error: null,
};

export function Playground({
  getAgent,
  hideLogo,
  showContextPreview = true,
  dryMode = false,
}: {
  getAgent: (
    forceSameTabNavigation?: boolean,
  ) => StaticPageAgent | ChromeExtensionProxyPageAgent | null;
  hideLogo?: boolean;
  showContextPreview?: boolean;
  dryMode?: boolean;
}) {
  const [uiContextPreview, setUiContextPreview] = useState<
    UIContext | undefined
  >(undefined);

  const [loading, setLoading] = useState(false);
  const [loadingProgressText, setLoadingProgressText] = useState('');
  const [stepCount, setStepCount] = useState(5);
  const [curStep, setCurStep] = useState(0);
  const [result, setResult] = useState<(PlaygroundResult | null)[]>([]);
  const [verticalMode, setVerticalMode] = useState(false);
  const { tabUrl } = useChromeTabInfo();
  const [form] = Form.useForm();
  const { config, serviceMode, setServiceMode } = useEnvConfig();
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );
  const setForceSameTabNavigation = useEnvConfig(
    (state) => state.setForceSameTabNavigation,
  );
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const runResultRef = useRef<HTMLHeadingElement>(null);
  const addHistory = useEnvConfig((state) => state.addHistory);

  // if the screen is narrow, we use vertical mode
  useEffect(() => {
    const sizeThreshold = 750;
    setVerticalMode(window.innerWidth < sizeThreshold);

    const handleResize = () => {
      setVerticalMode(window.innerWidth < sizeThreshold);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // override AI config
  useEffect(() => {
    overrideAIConfig(config as any);
  }, [config]);

  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);
  const serverValid = useServerValid(serviceMode === 'Server');

  const resetResult = (stepIndex: number) => {
    setResult((prev) => {
      const newResult = [...prev];
      newResult[stepIndex] = null;
      return newResult;
    });
    setLoading(false);
    setReplayScriptsInfo(null);
  };

  // setup context preview
  useEffect(() => {
    if (uiContextPreview) return;
    if (!showContextPreview) return;

    getAgent(forceSameTabNavigation)
      ?.getUIContext()
      .then((context: UIContext) => {
        setUiContextPreview(context);
      })
      .catch((e) => {
        message.error('Failed to get UI context');
        console.error(e);
      });
  }, [uiContextPreview, showContextPreview, getAgent]);

  const trackingTip = 'limit popup to current tab';
  const configItems = [
    {
      label: (
        <Checkbox
          onChange={(e) => setForceSameTabNavigation(e.target.checked)}
          checked={forceSameTabNavigation}
        >
          {trackingTip}
        </Checkbox>
      ),
      key: 'config',
    },
  ];

  const configSelector =
    serviceMode === 'In-Browser-Extension' ? (
      <div className="config-selector">
        <Dropdown menu={{ items: configItems }}>
          <Space>
            <SettingOutlined />
            {forceSameTabNavigation ? trackingTip : "don't track popup"}
          </Space>
        </Dropdown>
      </div>
    ) : null;

  const currentAgentRef = useRef<
    StaticPageAgent | ChromeExtensionProxyPageAgent | null
  >(null);

  const currentRunningIdRef = useRef<number | null>(0);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});
  const handleRun = useCallback(
    async (stepIndex: number) => {
      const _value = form.getFieldsValue();
      const value = {
        type: _value[`type-${stepIndex}`],
        prompt: _value[`prompt-${stepIndex}`],
      };
      console.log('step', stepIndex, 'value', value);

      if (!value.prompt) {
        return false;
      }

      const startTime = Date.now();

      setResult((prev) => {
        const newResult = [...prev];
        newResult[stepIndex] = null;
        return newResult;
      });
      addHistory({
        type: value.type,
        prompt: value.prompt,
        timestamp: Date.now(),
      });
      let result: PlaygroundResult = { ...blankResult };

      const activeAgent = getAgent(forceSameTabNavigation);
      const thisRunningId = Date.now();
      try {
        if (!activeAgent) {
          throw new Error('No agent found');
        }
        currentAgentRef.current = activeAgent;

        currentRunningIdRef.current = thisRunningId;
        interruptedFlagRef.current[thisRunningId] = false;
        activeAgent.resetDump();
        activeAgent.opts.onTaskStartTip = (tip: string) => {
          if (interruptedFlagRef.current[thisRunningId]) {
            return;
          }
          setLoadingProgressText(tip);
        };
        if (serviceMode === 'Server') {
          const uiContext = await activeAgent?.getUIContext();
          result = await requestPlaygroundServer(
            uiContext!,
            value.type,
            value.prompt,
          );
        } else {
          if (value.type === 'aiAction') {
            // const yamlString = buildYaml(
            //   {
            //     url: tabUrl || '',
            //   },
            //   [
            //     {
            //       name: 'aiAction',
            //       flow: [{ aiAction: value.prompt }],
            //     },
            //   ],
            // );
            // const parsedYamlScript = parseYamlScript(yamlString);
            // console.log('yamlString', parsedYamlScript, yamlString);

            result.result = await activeAgent?.aiAction(value.prompt);
          } else if (value.type === 'aiQuery') {
            result.result = await activeAgent?.aiQuery(value.prompt);
          } else if (value.type === 'aiAssert') {
            result.result = await activeAgent?.aiAssert(
              value.prompt,
              undefined,
              {
                keepRawResponse: true,
              },
            );
          }
        }
      } catch (e: any) {
        const errorMessage = e?.message || '';
        console.error(e);
        if (errorMessage.includes('of different extension')) {
          result.error =
            'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
        } else if (
          !errorMessage?.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)
        ) {
          result.error = errorMessage;
        } else {
          result.error = 'Unknown error';
        }
      }
      if (interruptedFlagRef.current[thisRunningId]) {
        console.log('interrupted, result is', result);
        return false;
      }

      try {
        if (
          serviceMode === 'In-Browser' ||
          serviceMode === 'In-Browser-Extension'
        ) {
          result.dump = activeAgent?.dumpDataString()
            ? JSON.parse(activeAgent.dumpDataString())
            : null;

          result.reportHTML = activeAgent?.reportHTMLString() || null;
        }
      } catch (e) {
        console.error(e);
      }

      try {
        console.log('destroy agent.page', activeAgent?.page);
        await activeAgent?.page?.destroy();
        console.log('destroy agent.page done', activeAgent?.page);
      } catch (e) {
        console.error(e);
      }

      currentAgentRef.current = null;
      setResult((prev) => {
        const newResult = [...prev];
        newResult[stepIndex] = result;
        return newResult;
      });
      if (value.type === 'aiAction' && result?.dump) {
        const info = allScriptsFromDump(result.dump);
        setReplayScriptsInfo(info);
        setReplayCounter((c) => c + 1);
      } else {
        setReplayScriptsInfo(null);
      }
      console.log(`time taken: ${Date.now() - startTime}ms`);

      // Scroll the Run header into view
      // setTimeout(() => {
      //   runResultRef.current?.scrollIntoView({ behavior: 'smooth' });
      // }, 50);
    },
    [form, getAgent, serviceMode, serverValid, forceSameTabNavigation],
  );

  const handleRunFromStep = async (stepIndex: number) => {
    setLoading(true);
    for (let i = stepIndex; i < stepCount - 1; i++) {
      const pass = await handleRun(i);
      if (pass === false) {
        // not pass, return to prev step
        setCurStep((prev) => prev - 1);
      } else {
        // active next step
        setCurStep(i + 1);
      }
    }
    setLoading(false);
  };

  const runButtonEnabled =
    (serviceMode === 'In-Browser' && !!getAgent && configAlreadySet) ||
    (serviceMode === 'Server' && serverValid) ||
    (serviceMode === 'In-Browser-Extension' && !!getAgent && configAlreadySet);

  let resultDataToShow: any = (
    <div className="result-empty-tip">
      <span>The result will be shown here</span>
    </div>
  );
  const curResult = result[curStep];
  if (!serverValid && serviceMode === 'Server') {
    resultDataToShow = serverLaunchTip;
  } else if (loading) {
    resultDataToShow = (
      <div className="loading-container">
        <Spin spinning={loading} indicator={<LoadingOutlined spin />} />
        {/* <div className="loading-progress-text loading-progress-text-tab-info">
          {tabInfoString}
        </div> */}
        <div className="loading-progress-text loading-progress-text-progress">
          {loadingProgressText}
        </div>
      </div>
    );
  } else if (replayScriptsInfo) {
    resultDataToShow = (
      <Player
        key={`${curStep}-${replayCounter}`}
        replayScripts={replayScriptsInfo.scripts}
        imageWidth={replayScriptsInfo.width}
        imageHeight={replayScriptsInfo.height}
        reportFileContent={
          serviceMode === 'In-Browser-Extension' && curResult?.reportHTML
            ? curResult?.reportHTML
            : null
        }
      />
    );
  } else if (curResult?.result) {
    resultDataToShow =
      typeof curResult?.result === 'string' ? (
        <pre>{curResult?.result}</pre>
      ) : (
        <pre>{JSON.stringify(curResult?.result, null, 2)}</pre>
      );
  } else if (curResult?.error) {
    resultDataToShow = <pre>{curResult?.error}</pre>;
  }

  const serverTip = !serverValid ? (
    <div className="server-tip">
      {iconForStatus('failed')} Connection failed
    </div>
  ) : (
    <div className="server-tip">{iconForStatus('connected')} Connected</div>
  );

  const switchBtn =
    serviceMode === 'In-Browser-Extension' ? null : (
      <Tooltip
        title={
          <span>
            Server Mode: send the request through the server <br />
            In-Browser Mode: send the request through the browser fetch API (The
            AI service should support CORS in this case)
          </span>
        }
      >
        <Button
          type="link"
          onClick={(e) => {
            e.preventDefault();
            setServiceMode(serviceMode === 'Server' ? 'In-Browser' : 'Server');
          }}
        >
          {serviceMode === 'Server'
            ? 'Switch to In-Browser Mode'
            : 'Switch to Server Mode'}
        </Button>
      </Tooltip>
    );

  const statusContent = serviceMode === 'Server' ? serverTip : <EnvConfig />;

  const stoppable =
    !dryMode && serviceMode === 'In-Browser-Extension' && loading;

  const handleStop = async (stepIndex: number) => {
    const thisRunningId = currentRunningIdRef.current;
    if (thisRunningId) {
      await currentAgentRef.current?.destroy();
      interruptedFlagRef.current[thisRunningId] = true;
      resetResult(stepIndex);
      console.log('destroy agent done');
    }
  };

  let renderActionBtn: (stepIndex: number) => React.ReactNode = () => null;
  if (dryMode) {
    renderActionBtn = (stepIndex: number) => (
      <Tooltip title="Start executing until some interaction actions need to be performed. You can see the process of planning and locating.">
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => handleRunFromStep(stepIndex)}
          disabled={!runButtonEnabled}
          loading={loading}
        >
          Dry Run
        </Button>
      </Tooltip>
    );
  } else if (stoppable) {
    renderActionBtn = (stepIndex: number) => (
      <Button icon={<BorderOutlined />} onClick={() => handleStop(stepIndex)}>
        Stop
      </Button>
    );
  } else {
    renderActionBtn = (stepIndex: number) => (
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={() => handleRunFromStep(stepIndex)}
        disabled={!runButtonEnabled}
        loading={loading}
      >
        Run
      </Button>
    );
  }

  const historySelector = useHistorySelector((historyItem) => {
    form.setFieldsValue({
      [`prompt-${curStep}`]: historyItem.prompt,
      [`type-${curStep}`]: historyItem.type,
    });
  });

  const logo = !hideLogo && (
    <div className="playground-header">
      <Logo />
    </div>
  );

  const history = useEnvConfig((state) => state.history);
  const lastHistory = history[0];
  const historyInitialValues = useMemo(() => {
    return {
      type: lastHistory?.type || 'aiAction',
      prompt: lastHistory?.prompt || '',
    };
  }, []);

  async function copyCode(format: 'js' | 'yaml') {
    try {
      const stepContent = [];
      const fullValue = form.getFieldsValue();
      for (let i = 0; i < stepCount; i++) {
        const type = fullValue[`type-${i}`];
        const prompt = fullValue[`prompt-${i}`];
        if (!prompt) continue;
        if (format === 'yaml') {
          stepContent.push({ [type]: prompt });
        } else if (format === 'js') {
          stepContent.push(`await ${type}('${prompt}');`);
        }
      }
      if (stepContent.length) {
        let text = '';
        if (format === 'yaml') {
          text = buildYaml(
            {
              url: tabUrl || '',
            },
            [
              {
                name: 'aiAction',
                flow: stepContent as { [type: string]: string }[],
              },
            ],
          );
        } else if (format === 'js') {
          text = stepContent.join('\n');
        }
        await navigator.clipboard.writeText(text);
        message.success('Copy success');
      } else {
        message.info('No code to copy');
      }
    } catch (error) {
      message.success('Copy failed');
      console.error('Copy failed:', error);
    }
  }

  const [hoveringSettings, setHoveringSettings] = useState(false);
  const formSection = (
    <Form
      form={form}
      // onFinish={handleRun}
      initialValues={{ ...historyInitialValues }}
    >
      <div className="playground-form-container">
        <div className="form-part">
          <h3>
            {serviceMode === 'Server'
              ? 'Server Status'
              : 'In-Browser Request Config'}
          </h3>
          {statusContent}
          <div className="switch-btn-wrapper">{switchBtn}</div>
        </div>
        <div
          className="form-part context-panel"
          style={{ display: showContextPreview ? 'block' : 'none' }}
        >
          <h3>UI Context</h3>
          {uiContextPreview ? (
            <Blackboard
              uiContext={uiContextPreview}
              hideController
              disableInteraction
            />
          ) : (
            <div>
              {iconForStatus('failed')} No UI context
              <Button
                type="link"
                onClick={(e) => {
                  e.preventDefault();
                  setUiContextPreview(DemoData as any);
                }}
              >
                Load Demo
              </Button>
              <div>
                To load the UI context, you can either use the demo data above,
                or click the 'Send to Playground' in the report page.
              </div>
            </div>
          )}
        </div>
        <div className="form-part input-wrapper">
          <h3>Run Steps</h3>
          {new Array(stepCount).fill(1).map((_, i) => {
            return (
              <Input.Group
                compact
                className={
                  result[i]?.error ? 'fail' : curStep === i ? 'active' : ''
                }
                key={i.toString()}
              >
                <Form.Item name={`type-${i}`} initialValue={'aiAction'} noStyle>
                  <Select>
                    <Select.Option value="aiAction">
                      {actionNameForType('aiAction')}
                    </Select.Option>
                    <Select.Option value="aiQuery">
                      {actionNameForType('aiQuery')}
                    </Select.Option>
                    <Select.Option value="aiAssert">
                      {actionNameForType('aiAssert')}
                    </Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name={`prompt-${i}`} noStyle>
                  <Input
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.metaKey) {
                        handleRunFromStep(i);
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onFocus={() => {
                      if (!loading) {
                        setCurStep(i);
                        const dump = result[i]?.dump;
                        if (dump) {
                          const info = allScriptsFromDump(dump);
                          setReplayScriptsInfo(info);
                        } else {
                          setReplayScriptsInfo(null);
                        }
                      }
                    }}
                  />
                </Form.Item>
                {curStep === i ? renderActionBtn(i) : null}
              </Input.Group>
            );
          })}
          <div className="form-controller-wrapper">
            <Tooltip title="aiAction report use a lot of memory, suggest step count less than 5">
              <Button
                type="primary"
                onClick={() => {
                  setStepCount(stepCount + 1);
                }}
              >
                + Step
              </Button>
            </Tooltip>
            <ButtonGroup>
              <Button onClick={() => copyCode('js')}>Copy as JS</Button>
              <Button onClick={() => copyCode('yaml')}>Copy as Yaml</Button>
            </ButtonGroup>
          </div>
          <div
            className={
              hoveringSettings
                ? 'settings-wrapper settings-wrapper-hover'
                : 'settings-wrapper'
            }
            onMouseEnter={() => setHoveringSettings(true)}
            onMouseLeave={() => setHoveringSettings(false)}
          >
            {historySelector}
            {configSelector}
          </div>
        </div>
      </div>
    </Form>
  );

  let resultWrapperClassName = 'result-wrapper';
  if (verticalMode) {
    resultWrapperClassName += ' vertical-mode-result';
  }
  if (replayScriptsInfo && verticalMode) {
    resultWrapperClassName += ' result-wrapper-compact';
  }

  return verticalMode ? (
    <div className="playground-container vertical-mode">
      {formSection}
      <div className="form-part">
        <div className={resultWrapperClassName}>{resultDataToShow}</div>
        <div ref={runResultRef} />
      </div>
    </div>
  ) : (
    <div className="playground-container">
      <Helmet>
        <title>Playground - Midscene.js</title>
      </Helmet>
      <PanelGroup autoSaveId="playground-layout" direction="horizontal">
        <Panel
          defaultSize={32}
          maxSize={60}
          minSize={20}
          className="playground-left-panel"
        >
          {logo}
          {formSection}
        </Panel>
        <PanelResizeHandle className="panel-resize-handle" />
        <Panel>
          <div className={resultWrapperClassName}>{resultDataToShow}</div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

export function StaticPlayground({
  context,
}: {
  context: WebUIContext | null;
}) {
  const agent = useStaticPageAgent(context);
  return (
    <Playground
      getAgent={() => {
        return agent;
      }}
      dryMode={true}
    />
  );
}
