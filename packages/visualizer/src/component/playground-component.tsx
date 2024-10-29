import { LoadingOutlined, SendOutlined } from '@ant-design/icons';
import type { GroupedActionDump, UIContext } from '@midscene/core/.';
import { Helmet } from '@modern-js/runtime/head';
import { Button, Empty, Spin, Tooltip, message } from 'antd';
import { Form, Input } from 'antd';
import { Radio } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

import { overrideAIConfig } from '@midscene/core';
import type { ChromeExtensionProxyPageAgent } from '@midscene/web/chrome-extension';
// import { ChromeExtensionProxyPage } from '@midscene/web/chrome-extension';
import {
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
  StaticPage,
  StaticPageAgent,
} from '@midscene/web/playground';
import { EnvConfig } from './env-config';
import { useEnvConfig } from './store';

interface PlaygroundResult {
  result: any;
  dump: GroupedActionDump | null;
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

overrideAIConfig({
  MIDSCENE_DEBUG_AI_PROFILE: '1',
});

const cacheKeyForPrompt = 'playground-user-prompt';
const cacheKeyForType = 'playground-user-type';
const setCache = (prompt: string, type: string) => {
  localStorage.setItem(cacheKeyForPrompt, prompt);
  localStorage.setItem(cacheKeyForType, type);
};

const getCachedPrompt = () => {
  return localStorage.getItem(cacheKeyForPrompt);
};

const getCachedType = () => {
  return localStorage.getItem(cacheKeyForType);
};

// context and agent
const useContextId = () => {
  const path = window.location.pathname;
  const match = path.match(/^\/playground\/([a-zA-Z0-9-]+)$/);
  return match ? match[1] : null;
};
const { TextArea } = Input;

// TODO: reset agent dump
export const useStaticPageAgent = (
  context: UIContext | undefined,
): StaticPageAgent | null => {
  const agent = useMemo(() => {
    if (!context) return null;

    const page = new StaticPage(context as any);
    return new StaticPageAgent(page);
  }, [context]);
  return agent;
};

export function Playground({
  agent,
  liteUI,
  hideLogo,
}: {
  agent: StaticPageAgent | ChromeExtensionProxyPageAgent | null;
  hideLogo?: boolean;
  liteUI?: boolean;
}) {
  // const contextId = useContextId();
  const [uiContextPreview, setUiContextPreview] = useState<
    UIContext | undefined
  >(undefined);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [form] = Form.useForm();
  const { config, serviceMode, setServiceMode } = useEnvConfig();
  const configAlreadySet = Object.keys(config || {}).length >= 1;

  // override AI config
  useEffect(() => {
    overrideAIConfig(config);
  }, [config]);

  const shouldShowContext = !liteUI;

  const activeAgent = agent;

  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);

  const serverValid = useServerValid(serviceMode === 'Server');

  // setup context preview
  useEffect(() => {
    if (uiContextPreview) return;
    if (!shouldShowContext) return;

    agent
      ?.getUIContext()
      .then((context) => {
        setUiContextPreview(context);
      })
      .catch((e) => {
        message.error('Failed to get UI context');
        console.error(e);
      });

    // TODO: move this out of playground
    // if (serviceMode === 'Server') {
    //   if (!contextId) throw new Error('contextId is required in server mode');
    //   fetch(`${serverBase}/context/${contextId}`)
    //     .then((res) => res.json())
    //     .then((data) => {
    //       const contextObj = JSON.parse(data.context);
    //       setOverrideContext(contextObj);
    //     });
    // }
  }, [uiContextPreview, shouldShowContext, agent]);

  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();
    if (!value.prompt) {
      message.error('Prompt is required');
      return;
    }

    setCache(value.prompt, value.type);
    setLoading(true);
    setResult(null);
    let result: PlaygroundResult = {
      result: null,
      dump: null,
      error: null,
    };
    try {
      const uiContext = await agent?.getUIContext();
      if (serviceMode === 'Server') {
        result = await requestPlaygroundServer(
          uiContext!,
          value.type,
          value.prompt,
        );
      } else if (value.type === 'aiAction') {
        result.result = await activeAgent?.aiAction(value.prompt);
      } else if (value.type === 'aiQuery') {
        result.result = await activeAgent?.aiQuery(value.prompt);
      } else if (value.type === 'aiAssert') {
        result.result = await activeAgent?.aiAssert(value.prompt, undefined, {
          keepRawResponse: true,
        });
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
    // TODO: reset agent dump
    // setResetAgentCounter((c) => c + 1);
  }, [form, agent, activeAgent]);

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

  // use cmd + enter to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRun();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleRun]);

  let resultFilled = false;
  let resultDataToShow: any = (
    <Empty
      image={null}
      description={
        <>
          By dumping the UI context, you can easily debug the prompt in the
          Midscene playground.
          <br />
          The UI context here is static, so we cannot take any action on it.
          <br />
          {runButtonEnabled && 'You can run something now'}
        </>
      }
    />
  );
  if (loading) {
    resultDataToShow = (
      <Spin
        spinning={loading}
        indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />}
      />
    );
  } else if (replayScriptsInfo) {
    resultFilled = true;
    resultDataToShow = (
      <Player
        key={replayCounter}
        replayScripts={replayScriptsInfo.scripts}
        imageWidth={replayScriptsInfo.width}
        imageHeight={replayScriptsInfo.height}
      />
    );
  } else if (result?.result) {
    resultFilled = true;
    resultDataToShow =
      typeof result?.result === 'string' ? (
        <pre>{result?.result}</pre>
      ) : (
        <pre>{JSON.stringify(result?.result, null, 2)}</pre>
      );
  } else if (result?.error) {
    resultFilled = true;
    resultDataToShow = <pre>{result?.error}</pre>;
  }

  const serverTip = !serverValid ? (
    <div>{iconForStatus('failed')} Connection failed</div>
  ) : (
    <div>{iconForStatus('connected')} Connected</div>
  );

  const switchBtn =
    serviceMode === 'In-Browser-Extension' ? null : (
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
    );

  const statusContent = serviceMode === 'Server' ? serverTip : <EnvConfig />;

  const actionBtn =
    selectedType === 'aiAction' ? (
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

  const logo = !hideLogo && !liteUI && (
    <div className="playground-header">
      <Logo />
    </div>
  );

  const formSection = (
    <Form
      form={form}
      onFinish={handleRun}
      initialValues={{
        type: getCachedType() || 'aiAction',
        prompt: getCachedPrompt() || '',
      }}
    >
      <div className="playground-form-container">
        <div className="form-part">
          <h3>
            {serviceMode === 'Server'
              ? 'Server Status'
              : 'In-Browser Request Config'}
          </h3>
          {statusContent}
          <div>{switchBtn}</div>
        </div>
        <div
          className="form-part context-panel"
          style={{ display: shouldShowContext ? 'block' : 'none' }}
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
              {iconForStatus('failed')} No UI context &nbsp;
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
              <Radio.Button value="aiAction">Action</Radio.Button>
              <Radio.Button value="aiQuery">Query</Radio.Button>
              <Radio.Button value="aiAssert">Assert</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <div className="main-side-console-input">
            <Form.Item name="prompt">
              <TextArea
                disabled={!runButtonEnabled}
                rows={2}
                placeholder={placeholder}
                autoFocus
              />
            </Form.Item>
            {actionBtn}
          </div>
        </div>
      </div>
    </Form>
  );

  return liteUI ? (
    <div className="playground-container lite-ui">
      {formSection}
      {resultFilled && <div className="hr" />}
      {resultFilled && (
        <div className="form-part">
          <h3>Result</h3>
          <div className="lite-ui-result">{resultDataToShow}</div>
        </div>
      )}
    </div>
  ) : (
    <div className="playground-container">
      <Helmet>
        <title>Playground - Midscene.js</title>
      </Helmet>
      <PanelGroup
        autoSaveId="playground-layout"
        direction={liteUI ? 'vertical' : 'horizontal'}
      >
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
          <div className="main-side-result">{resultDataToShow}</div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
