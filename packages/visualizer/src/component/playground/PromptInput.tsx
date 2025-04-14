import {
  ArrowUpOutlined,
  BorderOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Button, Form, Input, Radio, Space, Tooltip } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import type { HistoryItem } from '../store/history';
import { useHistoryStore } from '../store/history';
import { ConfigSelector } from './ConfigSelector';
import { HistorySelector } from './HistorySelector';
import type { RunType } from './playground-types';
import type { ServiceModeType } from './playground-types';
import { actionNameForType, getPlaceholderForType } from './playground-utils';

const { TextArea } = Input;

interface PromptInputProps {
  runButtonEnabled: boolean;
  form: any;
  serviceMode: ServiceModeType;
  selectedType: RunType;
  dryMode: boolean;
  stoppable: boolean;
  loading: boolean;
  onRun: () => void;
  onStop: () => void;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  runButtonEnabled,
  form,
  serviceMode,
  selectedType,
  dryMode,
  stoppable,
  loading,
  onRun,
  onStop,
}) => {
  const [hoveringSettings, setHoveringSettings] = useState(false);
  const placeholder = getPlaceholderForType(selectedType);

  // Get history from store
  const history = useHistoryStore((state) => state.history);
  const addHistory = useHistoryStore((state) => state.addHistory);
  const lastHistory = history[0];

  // Initialize form values from history only when lastHistory changes
  useEffect(() => {
    if (lastHistory) {
      form.setFieldsValue({
        type: lastHistory.type || 'aiAction',
        prompt: lastHistory.prompt || '',
      });
    } else {
      form.setFieldsValue({
        type: 'aiAction',
        prompt: '',
      });
    }
  }, [lastHistory, form]);

  // Handle history selection internally
  const handleSelectHistory = useCallback(
    (historyItem: HistoryItem) => {
      form.setFieldsValue({
        prompt: historyItem.prompt,
        type: historyItem.type,
      });
    },
    [form],
  );

  // Handle run with history addition
  const handleRunWithHistory = useCallback(() => {
    const values = form.getFieldsValue();
    if (values.prompt) {
      addHistory({
        type: values.type,
        prompt: values.prompt,
        timestamp: Date.now(),
      });
    }
    onRun();
  }, [form, addHistory, onRun]);

  // Handle key events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.metaKey) {
        handleRunWithHistory();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [handleRunWithHistory],
  );

  // Handle settings hover state
  const handleMouseEnter = useCallback(() => {
    setHoveringSettings(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveringSettings(false);
  }, []);

  // Render action button based on current state
  const renderActionButton = useCallback(() => {
    const runButton = (text: string) => (
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleRunWithHistory}
        disabled={!runButtonEnabled}
        loading={loading}
      >
        {text}
      </Button>
    );

    if (dryMode) {
      return selectedType === 'aiAction' ? (
        <Tooltip title="Start executing until some interaction actions need to be performed. You can see the process of planning and locating.">
          {runButton('Dry Run')}
        </Tooltip>
      ) : (
        runButton('Run')
      );
    }

    if (stoppable) {
      return (
        <Button icon={<BorderOutlined />} onClick={onStop}>
          Stop
        </Button>
      );
    }

    return runButton('Run');
  }, [
    dryMode,
    loading,
    handleRunWithHistory,
    onStop,
    runButtonEnabled,
    selectedType,
    stoppable,
  ]);

  return (
    <div className="form-part input-wrapper">
      <Space className="mode-radio-group-wrapper">
        <Form.Item name="type" style={{ margin: 0 }}>
          <Radio.Group
            buttonStyle="solid"
            disabled={!runButtonEnabled}
            className="mode-radio-group"
          >
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
        <HistorySelector onSelect={handleSelectHistory} />
      </Space>
      <div className="main-side-console-input">
        <Form.Item name="prompt" style={{ margin: 0 }}>
          <TextArea
            className="main-side-console-input-textarea"
            disabled={!runButtonEnabled}
            rows={4}
            placeholder={placeholder}
            autoFocus
            onKeyDown={handleKeyDown}
          />
        </Form.Item>

        <div className="form-controller-wrapper">
          <div
            className={
              hoveringSettings
                ? 'settings-wrapper settings-wrapper-hover'
                : 'settings-wrapper'
            }
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <ConfigSelector serviceMode={serviceMode} />
          </div>
          {renderActionButton()}
        </div>
      </div>
    </div>
  );
};
