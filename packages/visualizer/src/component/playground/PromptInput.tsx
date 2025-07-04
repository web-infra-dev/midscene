import { BorderOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Form, Input, Radio, Space, Tooltip } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [promptValue, setPromptValue] = useState('');
  const placeholder = getPlaceholderForType(selectedType);
  const textAreaRef = useRef<any>(null);

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
      setPromptValue(lastHistory.prompt || '');
    } else {
      form.setFieldsValue({
        type: 'aiAction',
        prompt: '',
      });
      setPromptValue('');
    }
  }, []);

  // Handle history selection internally
  const handleSelectHistory = useCallback(
    (historyItem: HistoryItem) => {
      form.setFieldsValue({
        prompt: historyItem.prompt,
        type: historyItem.type,
      });
      setPromptValue(historyItem.prompt);
    },
    [form],
  );

  // Handle prompt input change
  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPromptValue(value);
      form.setFieldValue('prompt', value);
    },
    [form],
  );

  // Calculate if run button should be enabled
  const isRunButtonEnabled = runButtonEnabled && promptValue.trim().length > 0;

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

    // Clear input after running
    setPromptValue('');
    form.setFieldValue('prompt', '');
  }, [form, addHistory, onRun]);

  // Handle key events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.metaKey && isRunButtonEnabled) {
        handleRunWithHistory();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Enter') {
        setTimeout(() => {
          if (textAreaRef.current) {
            const textarea = textAreaRef.current.resizableTextArea.textArea;
            const selectionStart = textarea.selectionStart;
            const value = textarea.value;

            // check if cursor is at the end of the text
            const lastNewlineIndex = value.lastIndexOf('\n');
            const isAtLastLine =
              lastNewlineIndex === -1 || selectionStart > lastNewlineIndex;

            // only scroll to bottom when cursor is at the end of the text
            if (isAtLastLine) {
              textarea.scrollTop = textarea.scrollHeight;
            }
          }
        }, 0);
      }
    },
    [handleRunWithHistory, isRunButtonEnabled],
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
        style={{ borderRadius: 20, zIndex: 999 }}
        onClick={handleRunWithHistory}
        disabled={!isRunButtonEnabled}
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
        <Button
          icon={<BorderOutlined />}
          onClick={onStop}
          style={{ borderRadius: 20, zIndex: 999 }}
        >
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
    isRunButtonEnabled,
    selectedType,
    stoppable,
  ]);

  return (
    <div className="prompt-input-wrapper">
      {/* top operation button area */}
      <Space className="mode-radio-group-wrapper">
        <Form.Item name="type" style={{ margin: 0 }}>
          <Radio.Group
            buttonStyle="solid"
            disabled={!runButtonEnabled}
            className="mode-radio-group"
          >
            <Tooltip title="Auto Planning: plan the steps and execute">
              <Radio.Button value="aiAction">
                {actionNameForType('aiAction')}
              </Radio.Button>
            </Tooltip>
            <Tooltip title="Extract data directly from the UI">
              <Radio.Button value="aiQuery">
                {actionNameForType('aiQuery')}
              </Radio.Button>
            </Tooltip>
            <Tooltip title="Understand the UI and determine if the assertion is true">
              <Radio.Button value="aiAssert">
                {actionNameForType('aiAssert')}
              </Radio.Button>
            </Tooltip>
            <Tooltip title="Instant Action: click something">
              <Radio.Button value="aiTap">
                {actionNameForType('aiTap')}
              </Radio.Button>
            </Tooltip>
          </Radio.Group>
        </Form.Item>

        <div className="action-icons">
          <HistorySelector onSelect={handleSelectHistory} />
          <div
            className={
              hoveringSettings
                ? 'settings-wrapper settings-wrapper-hover'
                : 'settings-wrapper'
            }
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <ConfigSelector
              enableTracking={serviceMode === 'In-Browser-Extension'}
              showDeepThinkOption={selectedType === 'aiTap'}
            />
          </div>
        </div>
      </Space>

      {/* input box area */}
      <div
        className={`main-side-console-input ${!runButtonEnabled ? 'disabled' : ''} ${loading ? 'loading' : ''}`}
      >
        <Form.Item name="prompt" style={{ margin: 0 }}>
          <TextArea
            className="main-side-console-input-textarea"
            disabled={!runButtonEnabled}
            rows={4}
            placeholder={placeholder}
            autoFocus
            onKeyDown={handleKeyDown}
            onChange={handlePromptChange}
            value={promptValue}
            ref={textAreaRef}
          />
        </Form.Item>

        <div className="form-controller-wrapper">{renderActionButton()}</div>
      </div>
    </div>
  );
};
