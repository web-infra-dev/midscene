import { ExclamationCircleFilled } from '@ant-design/icons';
import { useEnvConfig } from '../../store/store';
import { EnvConfig, type EnvConfigProps } from '../env-config';

import './index.less';

export interface EnvConfigReminderProps
  extends Pick<
    EnvConfigProps,
    | 'playgroundSDK'
    | 'onVerify'
    | 'agentOptions'
    | 'onAgentOptionsSave'
    | 'configModalClassName'
    | 'configModalWidth'
    | 'envTextareaAutoSize'
    | 'envTextareaMinRows'
  > {
  className?: string;
}

export const EnvConfigReminder: React.FC<EnvConfigReminderProps> = ({
  className = '',
  playgroundSDK,
  onVerify,
  agentOptions,
  onAgentOptionsSave,
  configModalClassName,
  configModalWidth,
  envTextareaAutoSize,
  envTextareaMinRows,
}) => {
  const { config } = useEnvConfig();
  const configAlreadySet = Object.keys(config || {}).length >= 1;

  if (configAlreadySet) {
    return null;
  }

  return (
    <div className={`env-config-reminder ${className}`}>
      <ExclamationCircleFilled className="reminder-icon" />
      <span className="reminder-text">
        Please set up your environment variables before using.
      </span>
      <EnvConfig
        agentOptions={agentOptions}
        configModalClassName={configModalClassName}
        configModalWidth={configModalWidth}
        envTextareaAutoSize={envTextareaAutoSize}
        envTextareaMinRows={envTextareaMinRows}
        mode="text"
        onAgentOptionsSave={onAgentOptionsSave}
        onVerify={onVerify}
        playgroundSDK={playgroundSDK}
        showTooltipWhenEmpty={false}
      />
    </div>
  );
};
