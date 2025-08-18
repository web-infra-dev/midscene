import { BorderOutlined, DownOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Dropdown, Form, Input, Radio, Space, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { HistoryItem } from '../store/history';
import { useHistoryStore } from '../store/history';
import { ConfigSelector } from './ConfigSelector';
import { HistorySelector } from './HistorySelector';
import type { RunType } from './playground-types';
import type { ServiceModeType } from './playground-types';
import { actionNameForType, getPlaceholderForType } from './playground-utils';
import './index.less';

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
  clearPromptAfterRun?: boolean;
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
  clearPromptAfterRun = true,
}) => {
  const [hoveringSettings, setHoveringSettings] = useState(false);
  const [promptValue, setPromptValue] = useState('');
  const placeholder = getPlaceholderForType(selectedType);
  const textAreaRef = useRef<any>(null);

  // Define all available APIs with their metadata
  const apiMetadata = {
    aiAction: {
      group: 'interaction',
      title: 'Auto Planning: plan the steps and execute',
    },
    aiTap: { group: 'interaction', title: 'Click an element' },
    aiHover: { group: 'interaction', title: 'Hover over an element' },
    aiInput: { group: 'interaction', title: 'Input text into an element' },
    aiRightClick: { group: 'interaction', title: 'Right-click an element' },
    aiKeyboardPress: { group: 'interaction', title: 'Press keyboard keys' },
    aiScroll: { group: 'interaction', title: 'Scroll the page or element' },
    aiLocate: { group: 'interaction', title: 'Locate an element on the page' },
    aiQuery: {
      group: 'extraction',
      title: 'Extract data directly from the UI',
    },
    aiBoolean: { group: 'extraction', title: 'Get true/false answer' },
    aiNumber: { group: 'extraction', title: 'Extract numeric value' },
    aiString: { group: 'extraction', title: 'Extract text value' },
    aiAsk: { group: 'extraction', title: 'Ask a question about the UI' },
    aiAssert: { group: 'validation', title: 'Assert a condition is true' },
    aiWaitFor: { group: 'validation', title: 'Wait for a condition to be met' },
  };

  // Define the default main buttons
  const defaultMainButtons = ['aiAction', 'aiTap', 'aiQuery', 'aiAssert'];

  // State to track if a dropdown item is selected
  const [dropdownSelection, setDropdownSelection] = useState<string | null>(
    null,
  );

  // Clear dropdown selection when selectedType changes to a main button
  useEffect(() => {
    if (defaultMainButtons.includes(selectedType)) {
      setDropdownSelection(null);
    }
  }, [selectedType]);

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

    if (clearPromptAfterRun) {
      setPromptValue('');
      form.setFieldValue('prompt', '');
    }
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
            {defaultMainButtons.map((apiType) => (
              <Tooltip
                key={apiType}
                title={
                  apiMetadata[apiType as keyof typeof apiMetadata]?.title || ''
                }
              >
                <Radio.Button value={apiType}>
                  {actionNameForType(apiType)}
                </Radio.Button>
              </Tooltip>
            ))}
            <Dropdown
              menu={(() => {
                // Get all APIs not currently shown in main buttons
                const hiddenAPIs = Object.keys(apiMetadata).filter(
                  (api) => !defaultMainButtons.includes(api),
                );

                // Group hidden APIs by category
                const groupedItems: any[] = [];

                const interactionAPIs = hiddenAPIs.filter(
                  (api) =>
                    apiMetadata[api as keyof typeof apiMetadata].group ===
                    'interaction',
                );
                if (interactionAPIs.length > 0) {
                  groupedItems.push({
                    key: 'interaction-group',
                    type: 'group',
                    label: 'Interaction APIs',
                    children: interactionAPIs.map((api) => ({
                      key: api,
                      label: actionNameForType(api),
                      title: apiMetadata[api as keyof typeof apiMetadata].title,
                      onClick: () => {
                        form.setFieldValue('type', api);
                        setDropdownSelection(api);
                      },
                    })),
                  });
                }

                const extractionAPIs = hiddenAPIs.filter(
                  (api) =>
                    apiMetadata[api as keyof typeof apiMetadata].group ===
                    'extraction',
                );
                if (extractionAPIs.length > 0) {
                  groupedItems.push({
                    key: 'extraction-group',
                    type: 'group',
                    label: 'Data Extraction APIs',
                    children: extractionAPIs.map((api) => ({
                      key: api,
                      label: actionNameForType(api),
                      title: apiMetadata[api as keyof typeof apiMetadata].title,
                      onClick: () => {
                        form.setFieldValue('type', api);
                        setDropdownSelection(api);
                      },
                    })),
                  });
                }

                const validationAPIs = hiddenAPIs.filter(
                  (api) =>
                    apiMetadata[api as keyof typeof apiMetadata].group ===
                    'validation',
                );
                if (validationAPIs.length > 0) {
                  groupedItems.push({
                    key: 'validation-group',
                    type: 'group',
                    label: 'Validation APIs',
                    children: validationAPIs.map((api) => ({
                      key: api,
                      label: actionNameForType(api),
                      title: apiMetadata[api as keyof typeof apiMetadata].title,
                      onClick: () => {
                        form.setFieldValue('type', api);
                        setDropdownSelection(api);
                      },
                    })),
                  });
                }

                return { items: groupedItems } as MenuProps;
              })()}
              placement="bottomLeft"
              trigger={['click']}
              disabled={!runButtonEnabled}
            >
              <Radio.Button
                className={`more-apis-button ${!defaultMainButtons.includes(selectedType) ? 'selected-from-dropdown' : ''}`}
                value={
                  selectedType && !defaultMainButtons.includes(selectedType)
                    ? selectedType
                    : 'more'
                }
              >
                {selectedType && !defaultMainButtons.includes(selectedType)
                  ? actionNameForType(selectedType)
                  : 'More'}{' '}
                <DownOutlined style={{ fontSize: '10px', marginLeft: '2px' }} />
              </Radio.Button>
            </Dropdown>
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
              showDeepThinkOption={
                selectedType === 'aiTap' ||
                selectedType === 'aiHover' ||
                selectedType === 'aiInput' ||
                selectedType === 'aiRightClick' ||
                selectedType === 'aiLocate'
              }
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
