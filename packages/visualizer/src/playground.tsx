import { LoadingOutlined, SendOutlined } from '@ant-design/icons';
import { Helmet } from '@modern-js/runtime/head';
import { Button, Spin, message } from 'antd';
import { Form, Input } from 'antd';
import { Radio } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { GroupedActionDump, UIContext } from '../../midscene/dist/types';
import Blackboard from './component/blackboard';
import { iconForStatus } from './component/misc';
import Player from './component/player';
import DemoData from './component/playground-demo-ui-context.json';
import type { ReplayScriptsInfo } from './component/replay-scripts';
import { allScriptsFromDump } from './component/replay-scripts';

import './playground.less';
import Logo from './component/logo';
import { serverBase, useServerValid } from './component/send-to-playground';

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

const useContextId = () => {
  const path = window.location.pathname;
  const match = path.match(/^\/playground\/([a-zA-Z0-9-]+)$/);
  return match ? match[1] : null;
};

const { TextArea } = Input;
function Playground() {
  const contextId = useContextId();
  const [uiContext, setUiContext] = useState<UIContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    result: any;
    dump: GroupedActionDump | null;
    error: string | null;
  } | null>(null);
  const [form] = Form.useForm();

  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);

  const serverValid = useServerValid();

  useEffect(() => {
    if (contextId) {
      fetch(`${serverBase}/context/${contextId}`)
        .then((res) => res.json())
        .then((data) => {
          const contextObj = JSON.parse(data.context);
          setUiContext(contextObj);
        });
    }
  }, [contextId]);

  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();
    if (!value.prompt) {
      message.error('Prompt is required');
      return;
    }

    setCache(value.prompt, value.type);
    setLoading(true);

    setResult(null);
    const res = await requestPlaygroundServer(
      uiContext!,
      value.type,
      value.prompt,
    );
    setLoading(false);
    setResult(res);

    if (value.type === 'aiAction' && res?.dump) {
      const info = allScriptsFromDump(res.dump);
      setReplayScriptsInfo(info);
      setReplayCounter((c) => c + 1);
    } else {
      setReplayScriptsInfo(null);
    }
  }, [form, uiContext]);

  let placeholder = 'What do you want to do?';
  const selectedType = Form.useWatch('type', form);

  if (selectedType === 'aiQuery') {
    placeholder = 'What do you want to query?';
  } else if (selectedType === 'aiAssert') {
    placeholder = 'What do you want to assert?';
  }

  const runButtonDisabled = !uiContext || loading || !serverValid;

  // use cmd + enter to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRun();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleRun]);

  let resultDataToShow: any = '';
  if (loading) {
    resultDataToShow = (
      <Spin
        spinning={loading}
        indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />}
      />
    );
  } else if (replayScriptsInfo) {
    resultDataToShow = (
      <Player
        key={replayCounter}
        replayScripts={replayScriptsInfo.scripts}
        imageWidth={replayScriptsInfo.width}
        imageHeight={replayScriptsInfo.height}
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
    <>
      {iconForStatus('failed')} Failed to connect to server. Please launch the
      local server first.
    </>
  ) : (
    <>{iconForStatus('connected')} Connected to server</>
  );

  return (
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
          <div className="playground-header">
            <Logo />
          </div>

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
                <h3>Playground Server</h3>
                <div>{serverTip}</div>
              </div>
              <div className="form-part context-panel">
                <h3>UI Context</h3>
                {uiContext ? (
                  <Blackboard
                    uiContext={uiContext}
                    hideController
                    disableInteraction
                  />
                ) : (
                  <div>
                    {iconForStatus('failed')} No UI Context{' '}
                    <Button
                      type="link"
                      onClick={() => setUiContext(DemoData as any)}
                    >
                      Load Demo
                    </Button>
                  </div>
                )}
              </div>
              <div className="form-part">
                <h3>Type</h3>
                <Form.Item name="type">
                  <Radio.Group buttonStyle="solid">
                    <Radio.Button value="aiAction">Action</Radio.Button>
                    <Radio.Button value="aiQuery">Query</Radio.Button>
                    <Radio.Button value="aiAssert">Assert</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </div>

              <div className="form-part input-wrapper">
                <h3>Prompt</h3>
                <div className="main-side-console-input">
                  <Form.Item name="prompt">
                    <TextArea rows={2} placeholder={placeholder} />
                  </Form.Item>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleRun}
                    disabled={runButtonDisabled}
                  >
                    Run
                  </Button>
                </div>
              </div>
            </div>
          </Form>
        </Panel>
        <PanelResizeHandle className="panel-resize-handle" />
        <Panel>
          <div className="main-side-result">{resultDataToShow}</div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

function mount(id: string) {
  const element = document.getElementById(id);
  const root = ReactDOM.createRoot(element!);

  root.render(<Playground />);
}

export default {
  mount,
  Playground,
};
