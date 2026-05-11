import { ExclamationCircleFilled } from '@ant-design/icons';
import { useT } from '@midscene/i18n';
import { useEnvConfig } from '../../store/store';
import { EnvConfig } from '../env-config';

import './index.less';

interface EnvConfigReminderProps {
  className?: string;
}

export const EnvConfigReminder: React.FC<EnvConfigReminderProps> = ({
  className = '',
}) => {
  const t = useT();
  const { config } = useEnvConfig();
  const configAlreadySet = Object.keys(config || {}).length >= 1;

  if (configAlreadySet) {
    return null;
  }

  return (
    <div className={`env-config-reminder ${className}`}>
      <ExclamationCircleFilled className="reminder-icon" />
      <span className="reminder-text">
        {t('envConfigReminder.setupReminder')}
      </span>
      <EnvConfig mode="text" showTooltipWhenEmpty={false} />
    </div>
  );
};
