import { Button, Modal, message } from 'antd';
import React, { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { usePlayground } from './component/store';
import './playground.less';
import { SendOutlined } from '@ant-design/icons';
import { Form, Input } from 'antd';
import { Radio } from 'antd';
import type { UIContext } from '../../midscene/dist/types';
import Blackboard from './component/blackboard';

const { TextArea } = Input;
export default function Playground(props: { uiContext: UIContext }) {
  const { open, setOpen } = usePlayground();
  const [form] = Form.useForm();
  const handleRun = () => {
    const value = form.getFieldsValue();
    console.log(value);
  };

  let placeholder = 'What do you want to do?';
  const selectedType = form.getFieldValue('type');
  console.log('selectedType is', selectedType);
  if (selectedType === 'Query') {
    placeholder = 'What do you want to query?';
  } else if (selectedType === 'Assert') {
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
      >
        <div className="playground-container">
          <PanelGroup autoSaveId="playground-layout" direction="horizontal">
            <Panel defaultSize={50} maxSize={75}>
              <Form
                form={form}
                onFinish={handleRun}
                initialValues={{
                  type: 'Action',
                  prompt: '',
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
                      <Radio.Button value="Action">Action</Radio.Button>
                      <Radio.Button value="Query">Query</Radio.Button>
                      <Radio.Button value="Assert">Assert</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                </div>
                <div className="form-part input-wrapper">
                  <h3>Prompt</h3>
                  <Form.Item noStyle name="prompt">
                    <div className="main-side-console-input">
                      <TextArea
                        rows={2}
                        placeholder={placeholder}
                        autoFocus
                        value={form.getFieldValue('prompt')}
                        onChange={(e) => {
                          form.setFieldValue('prompt', e.target.value);
                        }}
                      />
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleRun}
                      >
                        Run
                      </Button>
                    </div>
                  </Form.Item>
                </div>
              </Form>
            </Panel>
            <PanelResizeHandle className="panel-resize-handle" />
            <Panel maxSize={75}>
              <div className="main-side">
                <div className="main-side-result">
                  <div>coming soon...</div>
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </div>
      </Modal>
    </>
  );
}
