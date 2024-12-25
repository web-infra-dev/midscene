import { DownOutlined, LoadingOutlined, SendOutlined } from '@ant-design/icons';
import type {
  GroupedActionDump,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlTask,
  UIContext,
} from '@midscene/core';
import { Helmet } from '@modern-js/runtime/head';
import { Alert, Button, Spin, Tooltip, message } from 'antd';
import { Form, Input } from 'antd';
import { Radio } from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

import { paramStr, typeStr } from '@midscene/web/ui-utils';
import {
  ScriptPlayer,
  buildYaml,
  flowItemBrief,
  parseYamlScript,
} from '@midscene/web/yaml';

import { overrideAIConfig } from '@midscene/core';
import type { ChromeExtensionProxyPageAgent } from '@midscene/web/chrome-extension';
import {
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
  StaticPage,
  StaticPageAgent,
} from '@midscene/web/playground';
import type { WebUIContext } from '@midscene/web/utils';
import type { MenuProps } from 'antd';
import { Dropdown, Space } from 'antd';
import { EnvConfig } from './env-config';
import { type HistoryItem, useEnvConfig } from './store';

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

// context and agent
const useContextId = () => {
  const path = window.location.pathname;
  const match = path.match(/^\/playground\/([a-zA-Z0-9-]+)$/);
  return match ? match[1] : null;
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
          history <DownOutlined />
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

export function Playground({
  agent,
  hideLogo,
  showContextPreview = true,
}: {
  agent: StaticPageAgent | ChromeExtensionProxyPageAgent | null;
  hideLogo?: boolean;
  showContextPreview?: boolean;
}) {
  // const contextId = useContextId();
  const [uiContextPreview, setUiContextPreview] = useState<
    UIContext | undefined
  >(undefined);

  const [loading, setLoading] = useState(false);
  const [loadingProgressText, setLoadingProgressText] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [form] = Form.useForm();
  const { config, serviceMode, setServiceMode } = useEnvConfig();
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const runResultRef = useRef<HTMLHeadingElement>(null);

  const [verticalMode, setVerticalMode] = useState(false);

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

  const activeAgent = agent;

  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);

  const serverValid = useServerValid(serviceMode === 'Server');

  // setup context preview
  useEffect(() => {
    if (uiContextPreview) return;
    if (!showContextPreview) return;

    agent
      ?.getUIContext()
      .then((context) => {
        setUiContextPreview(context);
      })
      .catch((e) => {
        message.error('Failed to get UI context');
        console.error(e);
      });
  }, [uiContextPreview, showContextPreview, agent]);

  const addHistory = useEnvConfig((state) => state.addHistory);

  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();
    if (!value.prompt) {
      message.error('Prompt is required');
      return;
    }

    const startTime = Date.now();
    setLoading(true);
    setResult(null);
    addHistory({
      type: value.type,
      prompt: value.prompt,
      timestamp: Date.now(),
    });
    let result: PlaygroundResult = {
      result: null,
      dump: null,
      reportHTML: null,
      error: null,
    };

    try {
      activeAgent?.resetDump();
      if (serviceMode === 'Server') {
        const uiContext = await activeAgent?.getUIContext();
        result = await requestPlaygroundServer(
          uiContext!,
          value.type,
          value.prompt,
        );
      } else {
        if (value.type === 'aiAction') {
          const yamlString = buildYaml(
            {
              url: 'https://www.baidu.com',
            },
            [
              {
                name: 'aiAction',
                flow: [{ aiAction: value.prompt }],
              },
            ],
          );

          const parsedYamlScript = parseYamlScript(yamlString);
          console.log('yamlString', parsedYamlScript, yamlString);
          const yamlPlayer = new ScriptPlayer(
            parsedYamlScript,
            async () => {
              if (!activeAgent) throw new Error('Agent is not initialized');

              activeAgent?.resetDump();
              return {
                agent: activeAgent,
                freeFn: [],
              };
            },
            (taskStatus) => {
              let overallStatus = '';
              if (taskStatus.status === 'init') {
                overallStatus = 'initializing...';
              } else if (
                taskStatus.status === 'running' ||
                taskStatus.status === 'error'
              ) {
                const item = taskStatus.flow[0] as MidsceneYamlFlowItemAIAction;
                // const brief = flowItemBrief(item);
                const tips = item?.aiActionProgressTips || [];
                if (tips.length > 0) {
                  overallStatus = tips[tips.length - 1];
                }
              }

              setLoadingProgressText(overallStatus);
            },
          );

          await yamlPlayer.run();
        } else if (value.type === 'aiQuery') {
          result.result = await activeAgent?.aiQuery(value.prompt);
        } else if (value.type === 'aiAssert') {
          result.result = await activeAgent?.aiAssert(value.prompt, undefined, {
            keepRawResponse: true,
          });
        }
      }
    } catch (e: any) {
      console.error(e);
      if (typeof e === 'string') {
        result.error = e;
      } else if (!e.message?.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)) {
        result.error = e.message;
      } else {
        result.error = 'Unknown error';
      }
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

    setResult(result);
    setLoading(false);
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
  }, [form, agent, activeAgent, serviceMode, serverValid]);

  let placeholder = 'What do you want to do?';
  const selectedType = Form.useWatch('type', form);

  if (selectedType === 'aiQuery') {
    placeholder = 'What do you want to query?';
  } else if (selectedType === 'aiAssert') {
    placeholder = 'What do you want to assert?';
  }

  const runButtonEnabled =
    (serviceMode === 'In-Browser' && agent && configAlreadySet) ||
    (serviceMode === 'Server' && serverValid) ||
    (serviceMode === 'In-Browser-Extension' && agent && configAlreadySet);

  let resultDataToShow: any = (
    <div className="result-empty-tip">
      <span>The result will be shown here</span>
    </div>
  );
  if (!serverValid && serviceMode === 'Server') {
    resultDataToShow = serverLaunchTip;
  } else if (loading) {
    resultDataToShow = (
      <div className="loading-container">
        <Spin spinning={loading} indicator={<LoadingOutlined spin />} />
        <div className="loading-progress-text">{loadingProgressText}</div>
      </div>
    );
  } else if (replayScriptsInfo) {
    resultDataToShow = (
      <Player
        key={replayCounter}
        replayScripts={replayScriptsInfo.scripts}
        imageWidth={replayScriptsInfo.width}
        imageHeight={replayScriptsInfo.height}
        reportFileContent={result?.reportHTML}
      />
    );
  } else if (result?.result) {
    resultDataToShow =
      typeof result?.result === 'string' ? (
        <pre>{result?.result}</pre>
      ) : (
        <pre>{JSON.stringify(result?.result, null, 2)}</pre>
      );
  } else if (result?.error) {
    resultDataToShow = <pre>{result?.error}</pre>;
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

  const dryMode = agent?.dryMode;
  const actionBtn = dryMode ? (
    <Tooltip title="Start executing until some interaction actions need to be performed. You can see the process of planning and locating.">
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleRun}
        disabled={!runButtonEnabled}
        loading={loading}
      >
        Dry Run
      </Button>
    </Tooltip>
  ) : (
    <Button
      type="primary"
      icon={<SendOutlined />}
      onClick={handleRun}
      disabled={!runButtonEnabled}
      loading={loading}
    >
      Run
    </Button>
  );

  const historySelector = useHistorySelector((historyItem) => {
    form.setFieldsValue({
      prompt: historyItem.prompt,
      type: historyItem.type,
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

  const formSection = (
    <Form
      form={form}
      onFinish={handleRun}
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
          <h3>Run</h3>
          <Form.Item name="type">
            <Radio.Group buttonStyle="solid" disabled={!runButtonEnabled}>
              <Radio.Button value="aiAction">
                {actionNameForType('aiAction')}
              </Radio.Button>
              <Radio.Button value="aiQuery">
                {actionNameForType('aiQuery')}
              </Radio.Button>
              <Radio.Button value="aiAssert">
                {actionNameForType('aiAssert')}
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
          <div className="main-side-console-input">
            <Form.Item name="prompt">
              <TextArea
                disabled={!runButtonEnabled}
                rows={4}
                placeholder={placeholder}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    handleRun();
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              />
            </Form.Item>
            {actionBtn}
            {historySelector}
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
  return <Playground agent={agent} />;
}
