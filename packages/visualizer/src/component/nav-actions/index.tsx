import { GithubOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { EnvConfig } from '../env-config';
import './style.less';

export interface NavActionsProps {
  showEnvConfig?: boolean;
  showTooltipWhenEmpty?: boolean;
  showModelName?: boolean;
  githubUrl?: string;
  helpUrl?: string;
  className?: string;
}

export function NavActions({
  showEnvConfig = true,
  showTooltipWhenEmpty = false,
  showModelName = false,
  githubUrl = 'https://github.com/web-infra-dev/midscene',
  helpUrl = 'https://midscenejs.com/quick-experience.html',
  className = '',
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
        />
      )}
    </div>
  );
}
