import { ConfigModal, type ConfigModalTab } from '@midscene/visualizer';
import type { StudioAgentOptions } from '../../../shared/agent-options';
import {
  FIXED_MODEL_ENV_FIELDS,
  getModelEnvConfigError,
  parseEnvText,
  setEnvFieldValue,
} from './connectivity-env';

export interface ModelEnvConfigModalProps {
  open: boolean;
  initialTab?: ConfigModalTab;
  textValue?: string;
  agentOptionsValue?: StudioAgentOptions;
  onClose: () => void;
  onSave?: (payload: {
    text: string;
    agentOptions: StudioAgentOptions;
  }) => void | Promise<void>;
}

export function ModelEnvConfigModal({
  open,
  initialTab = 'text',
  textValue = '',
  agentOptionsValue = {},
  onClose,
  onSave,
}: ModelEnvConfigModalProps) {
  return (
    <ConfigModal
      agentOptionsValue={agentOptionsValue}
      envFields={FIXED_MODEL_ENV_FIELDS}
      initialTab={initialTab}
      onClose={onClose}
      onSave={async (payload) => {
        await onSave?.({
          text: payload.text,
          agentOptions: payload.agentOptions,
        });
      }}
      onVerify={async (env) => {
        if (!window.studioRuntime) {
          throw new Error('Studio runtime is not available.');
        }
        return window.studioRuntime.runConnectivityTest(env);
      }}
      open={open}
      parseEnvText={parseEnvText}
      setEnvFieldValue={setEnvFieldValue}
      showEnvStyleSelect
      textValue={textValue}
      validateEnvText={getModelEnvConfigError}
    />
  );
}
