import { ExclamationCircleFilled } from '@ant-design/icons';
import { EnvConfig, useEnvConfig } from '@midscene/visualizer';
import './index.less';

interface EnvConfigReminderProps {
    className?: string;
}

export const EnvConfigReminder: React.FC<EnvConfigReminderProps> = ({
    className = '',
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
            <EnvConfig mode="text" showTooltipWhenEmpty={false} />
        </div>
    );
}; 