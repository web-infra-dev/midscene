import { BorderOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import type React from 'react';
import type { RunType } from './playground-types';

interface ActionButtonsProps {
  selectedType: RunType;
  dryMode: boolean;
  stoppable: boolean;
  runButtonEnabled: boolean;
  loading: boolean;
  onRun: () => void;
  onStop: () => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  selectedType,
  dryMode,
  stoppable,
  runButtonEnabled,
  loading,
  onRun,
  onStop,
}) => {
  const runBtn = (text: string) => {
    return (
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={onRun}
        disabled={!runButtonEnabled}
        loading={loading}
      >
        {text}
      </Button>
    );
  };

  if (dryMode) {
    return selectedType === 'aiAction' ? (
      <Tooltip title="Start executing until some interaction actions need to be performed. You can see the process of planning and locating.">
        {runBtn('Dry Run')}
      </Tooltip>
    ) : (
      runBtn('Run')
    );
  }
  if (stoppable) {
    return (
      <Button icon={<BorderOutlined />} onClick={onStop}>
        Stop
      </Button>
    );
  }
  return runBtn('Run');
};
