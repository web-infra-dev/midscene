import { Alert, Button, Modal, Spin, message } from 'antd';
import React, { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { usePlayground } from './component/store';
import './playground.less';
import { LoadingOutlined, SendOutlined } from '@ant-design/icons';
import { Form, Input } from 'antd';
import { Radio } from 'antd';
import type { GroupedActionDump, UIContext } from '../../midscene/dist/types';
import Blackboard from './component/blackboard';
import { iconForStatus } from './component/misc';
import Player from './component/player';
import type { ReplayScriptsInfo } from './component/replay-scripts';
import { allScriptsFromDump } from './component/replay-scripts';

const serverBase = 'http://localhost:5800';
const requestPlaygroundServer = async (
  context: UIContext,
  type: string,
  prompt: string,
) => {
  const res = await fetch(`${serverBase}/playground/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context, type, prompt }),
  });
  return res.json();
};

const checkServerStatus = async () => {
  try {
    const res = await fetch(`${serverBase}/playground/status`);
    return res.status === 200;
  } catch (e) {
    return false;
  }
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

const { TextArea } = Input;
export default function Playground(props: { uiContext: UIContext }) {
  const { open, setOpen } = usePlayground();
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

  const [serverStatus, setServerStatus] = useState<
    'connected' | 'pending' | 'failed'
  >('pending');

  useEffect(() => {
    let interruptFlag = false;
    Promise.resolve(
      (async () => {
        while (!interruptFlag) {
          const status = await checkServerStatus();
          if (status) {
            setServerStatus('connected');
          } else {
            setServerStatus('failed');
          }
          // sleep 1s
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      })(),
    );

    return () => {
      interruptFlag = true;
    };
  }, []);

  useEffect(() => {
    if (!props.uiContext) {
      message.error('Context is missing, the playground is not ready');
    }
  }, [props.uiContext]);

  const handleRun = async () => {
    const value = form.getFieldsValue();
    if (!value.prompt) {
      message.error('Prompt is required');
      return;
    }

    setCache(value.prompt, value.type);
    setLoading(true);

    setResult(null);
    const res = await requestPlaygroundServer(
      props.uiContext,
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
  };

  let placeholder = 'What do you want to do?';
  const selectedType = Form.useWatch('type', form);

  if (selectedType === 'aiQuery') {
    placeholder = 'What do you want to query?';
  } else if (selectedType === 'aiAssert') {
    placeholder = 'What do you want to assert?';
  }

  const runButtonDisabled = loading || serverStatus !== 'connected';

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
  }, []);

  let resultDataToShow: any = '';
  if (replayScriptsInfo) {
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
      typeof result?.result === 'string'
        ? result?.result
        : JSON.stringify(result?.result, null, 2);
  } else if (result?.error) {
    resultDataToShow = result?.error;
  }

  const serverTip =
    serverStatus === 'failed' ? (
      <>
        {iconForStatus(serverStatus)} Failed to connect to server. Please launch
        the local server first.
      </>
    ) : (
      <>
        {iconForStatus(serverStatus)} {serverStatus}
      </>
    );

  return (
    <>
      <Modal
        title="Playground"
        centered
        open={open}
        width="88%"
        height="80%"
        destroyOnClose
        onCancel={() => {
          setOpen(false);
          return true;
        }}
        footer={null}
        forceRender
      >
        <div className="playground-container">
          <PanelGroup autoSaveId="playground-layout" direction="horizontal">
            <Panel defaultSize={50} maxSize={75}>
              <Form
                form={form}
                onFinish={handleRun}
                initialValues={{
                  type: getCachedType() || 'aiAction',
                  prompt: getCachedPrompt() || '',
                }}
              >
                <div className="form-part">
                  <h3>Server</h3>
                  <div>{serverTip}</div>
                </div>
                <div className="form-part context-panel">
                  <h3>UI Context</h3>
                  {open && (
                    <Blackboard
                      uiContext={props.uiContext}
                      hideController
                      disableInteraction
                    />
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
              </Form>
            </Panel>
            <PanelResizeHandle className="panel-resize-handle" />
            <Panel maxSize={75}>
              <div className="main-side form-part">
                <h3>Result</h3>
                <Spin
                  spinning={loading}
                  indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />}
                >
                  <div className="main-side-result">
                    <pre>{resultDataToShow}</pre>
                  </div>
                </Spin>
              </div>
            </Panel>
          </PanelGroup>
        </div>
      </Modal>
    </>
  );
}
