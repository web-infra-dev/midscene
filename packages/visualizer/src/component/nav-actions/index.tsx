import { GithubOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import type { PlaygroundSDKLike } from '../../types';
import {
  type CommonAgentOptions,
  EnvConfig,
  type EnvConfigProps,
} from '../env-config';
import './style.less';

export interface NavActionsProps {
  showEnvConfig?: boolean;
  showTooltipWhenEmpty?: boolean;
  showModelName?: boolean;
  githubUrl?: string;
  helpUrl?: string;
  className?: string;
  playgroundSDK?: PlaygroundSDKLike | null;
  onVerify?: EnvConfigProps['onVerify'];
  agentOptions?: CommonAgentOptions;
  onAgentOptionsSave?: (options: CommonAgentOptions) => void | Promise<void>;
  configModalClassName?: EnvConfigProps['configModalClassName'];
  configModalWidth?: EnvConfigProps['configModalWidth'];
  envTextareaAutoSize?: EnvConfigProps['envTextareaAutoSize'];
  envTextareaMinRows?: EnvConfigProps['envTextareaMinRows'];
}

export function NavActions({
  showEnvConfig = true,
  showTooltipWhenEmpty = false,
  showModelName = false,
  githubUrl = 'https://github.com/web-infra-dev/midscene',
  helpUrl = 'https://midscenejs.com/quick-start.html#chrome-extension',
  className = '',
  playgroundSDK,
  onVerify,
  agentOptions,
  onAgentOptionsSave,
  configModalClassName,
  configModalWidth,
  envTextareaAutoSize,
  envTextareaMinRows,
}: NavActionsProps) {
  return (
    <div className={`nav-actions ${className}`}>
      <Typography.Link href={githubUrl} target="_blank">
        <GithubOutlined className="nav-icon" />
      </Typography.Link>
      <Typography.Link href={helpUrl} target="_blank">
        <QuestionCircleOutlined className="nav-icon" />
      </Typography.Link>
      {showEnvConfig && (
        <EnvConfig
          showTooltipWhenEmpty={showTooltipWhenEmpty}
          showModelName={showModelName}
          playgroundSDK={playgroundSDK}
          onVerify={onVerify}
          agentOptions={agentOptions}
          configModalClassName={configModalClassName}
          configModalWidth={configModalWidth}
          envTextareaAutoSize={envTextareaAutoSize}
          envTextareaMinRows={envTextareaMinRows}
          onAgentOptionsSave={onAgentOptionsSave}
        />
      )}
    </div>
  );
}
