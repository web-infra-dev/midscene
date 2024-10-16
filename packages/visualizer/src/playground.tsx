import { Button, Modal, Spin, message } from 'antd';
import React, { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { usePlayground } from './component/store';
import './playground.less';
import { LoadingOutlined, SendOutlined } from '@ant-design/icons';
import { Form, Input } from 'antd';
import { Radio } from 'antd';
import type { UIContext } from '../../midscene/dist/types';
import Blackboard from './component/blackboard';

const requestPlaygroundServer = async (
  context: UIContext,
  type: string,
  prompt: string,
) => {
  const res = await fetch('http://localhost:5800/playground/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context, type, prompt }),
  });
  return res.json();
};

const cacheKeyForType = (type: string) => `playground-user-prompt-${type}`;

const cachePromptWithType = (prompt: string, type: string) => {
  localStorage.setItem(cacheKeyForType(type), prompt);
  localStorage.setItem('playground-user-type', type);
};

const getCachedPromptWithType = (type: string) => {
  return localStorage.getItem(cacheKeyForType(type));
};

const getCachedType = () => {
  return localStorage.getItem('playground-user-type');
};

const { TextArea } = Input;
export default function Playground(props: { uiContext: UIContext }) {
  const { open, setOpen } = usePlayground();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    result: any;
    error: string | null;
  } | null>(null);
  const [form] = Form.useForm();

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

    cachePromptWithType(value.prompt, value.type);
    setLoading(true);
    const res = await requestPlaygroundServer(
      props.uiContext,
      value.type,
      value.prompt,
    );
    setLoading(false);
    setResult(res);
  };

  let placeholder = 'What do you want to do?';
  const selectedType = form.getFieldValue('type');
  if (selectedType === 'aiQuery') {
    placeholder = 'What do you want to query?';
  } else if (selectedType === 'aiAssert') {
    placeholder = 'What do you want to assert?';
  }

  // use cmd + enter to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'Enter') {
        handleRun();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const resultDataToShow =
    typeof result?.result === 'string'
      ? result?.result
      : JSON.stringify(result?.result, null, 2);

  const initType = getCachedType() || 'aiAction';
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
                  type: initType,
                  prompt: getCachedPromptWithType(initType) || '',
                }}
              >
                <div className="form-part context-panel">
                  <h3>UI Context</h3>
                  <Blackboard uiContext={props.uiContext} hideController />
                </div>
                <div className="form-part">
                  <h3>Type</h3>
                  <Form.Item noStyle name="type">
                    <Radio.Group
                      value={form.getFieldValue('type')}
                      onChange={(e) => {
                        form.setFieldValue('type', e.target.value);
                      }}
                      buttonStyle="solid"
                    >
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
                      disabled={loading}
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
