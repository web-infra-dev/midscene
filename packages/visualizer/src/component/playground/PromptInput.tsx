import { Form, Input, Radio } from 'antd';
import type React from 'react';
import type { HistoryItem } from '../store';
import { ControlPanel } from './ControlPanel';
import type { RunType } from './playground-types';
import type { ServiceModeType } from './playground-types';
import { actionNameForType, getPlaceholderForType } from './playground-utils';

const { TextArea } = Input;

interface PromptInputProps {
  initialValues: {
    type: RunType;
    prompt: string;
  };
  runButtonEnabled: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  form: any;
  // Control panel related props
  serviceMode: ServiceModeType;
  selectedType: RunType;
  dryMode: boolean;
  stoppable: boolean;
  loading: boolean;
  onRun: () => void;
  onStop: () => void;
  onSelectHistory: (history: HistoryItem) => void;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  initialValues,
  runButtonEnabled,
  onKeyDown,
  form,
  // Control panel related props
  serviceMode,
  selectedType,
  dryMode,
  stoppable,
  loading,
  onRun,
  onStop,
  onSelectHistory,
}) => {
  const placeholder = getPlaceholderForType(selectedType);

  return (
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
            onKeyDown={onKeyDown}
          />
        </Form.Item>

        <ControlPanel
          serviceMode={serviceMode}
          selectedType={selectedType}
          dryMode={dryMode}
          stoppable={stoppable}
          runButtonEnabled={runButtonEnabled}
          loading={loading}
          onRun={onRun}
          onStop={onStop}
          onSelectHistory={onSelectHistory}
        />
      </div>
    </div>
  );
};
