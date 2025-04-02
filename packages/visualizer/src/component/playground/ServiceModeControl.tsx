import { Button, Tooltip } from 'antd';
import type React from 'react';
import { EnvConfig } from '../env-config';
import { iconForStatus } from '../misc';
import { useEnvConfig } from '../store/store';
import type { ServiceModeType } from './playground-types';
import { useServerValid } from './useServerValid';

interface ServiceModeControlProps {
  serviceMode: ServiceModeType;
}

// Centralized text constants
const TITLE_TEXT = {
  Server: 'Server Status',
  'In-Browser': 'In-Browser Request Config',
  'In-Browser-Extension': 'In-Browser Request Config',
};

const SWITCH_BUTTON_TEXT = {
  Server: 'Switch to In-Browser Mode',
  'In-Browser': 'Switch to Server Mode',
};

export const ServiceModeControl: React.FC<ServiceModeControlProps> = ({
  serviceMode,
}) => {
  const { setServiceMode } = useEnvConfig();
  const serverValid = useServerValid(serviceMode === 'Server');

  // Render server tip based on connection status
  const renderServerTip = () => {
    if (serverValid) {
      return (
        <div className="server-tip">{iconForStatus('connected')} Connected</div>
      );
    }
    return (
      <div className="server-tip">
        {iconForStatus('failed')} Connection failed
      </div>
    );
  };

  // Render switch button if not in extension mode
  const renderSwitchButton = () => {
    if (serviceMode === 'In-Browser-Extension') {
      return null;
    }

    const nextMode = serviceMode === 'Server' ? 'In-Browser' : 'Server';
    const buttonText = SWITCH_BUTTON_TEXT[serviceMode];

    return (
      <Tooltip
        title={
          <span>
            Server Mode: send the request through the server <br />
            In-Browser Mode: send the request through the browser fetch API (The
            AI service should support CORS in this case)
          </span>
        }
      >
        <Button
          type="link"
          onClick={(e) => {
            e.preventDefault();
            setServiceMode(nextMode);
          }}
        >
          {buttonText}
        </Button>
      </Tooltip>
    );
  };

  // Determine content based on service mode
  const statusContent =
    serviceMode === 'Server' ? renderServerTip() : <EnvConfig />;
  const title = TITLE_TEXT[serviceMode];

  return (
    <>
      <h3>{title}</h3>
      {statusContent}
      <div className="switch-btn-wrapper">{renderSwitchButton()}</div>
    </>
  );
};
