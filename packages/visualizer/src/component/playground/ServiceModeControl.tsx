import { overrideAIConfig } from '@midscene/core/env';
import { Button, Tooltip } from 'antd';
import type React from 'react';
import { useEffect } from 'react';
import { EnvConfig } from '../env-config';
import { iconForStatus } from '../misc';
import { useEnvConfig } from '../store/store';
import { useServerValid } from './useServerValid';

interface ServiceModeControlProps {
  serviceMode: 'Server' | 'In-Browser';
}

// Centralized text constants
const TITLE_TEXT = {
  Server: 'Server Status',
  'In-Browser': 'In-Browser',
};

const SWITCH_BUTTON_TEXT = {
  Server: 'Switch to In-Browser Mode',
  'In-Browser': 'Switch to Server Mode',
};

export const ServiceModeControl: React.FC<ServiceModeControlProps> = ({
  serviceMode,
}) => {
  const { setServiceMode, config } = useEnvConfig();
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

  useEffect(() => {
    overrideAIConfig(config);
  }, [config]);

  // Determine content based on service mode
  const statusContent =
    serviceMode === 'Server' ? renderServerTip() : <EnvConfig />;
  const title = TITLE_TEXT[serviceMode];

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <h3
          style={{
            whiteSpace: 'nowrap',
            margin: 0,
            flexShrink: 0,
          }}
        >
          {title}
        </h3>
        {statusContent}
      </div>

      <div className="switch-btn-wrapper">{renderSwitchButton()}</div>
    </>
  );
};
