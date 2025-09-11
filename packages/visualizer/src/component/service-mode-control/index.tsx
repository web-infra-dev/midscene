import { PlaygroundSDK } from '@midscene/playground';
import { overrideAIConfig } from '@midscene/shared/env';
import { Button, Tooltip } from 'antd';
import type React from 'react';
import { useEffect } from 'react';
import { useServerValid } from '../../hooks/useServerValid';
import { useEnvConfig } from '../../store/store';
import { EnvConfig } from '../env-config';
import { iconForStatus } from '../misc';
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
        <Tooltip title="Connected">
          <div className="server-tip">{iconForStatus('connected')}</div>
        </Tooltip>
      );
    }
    return (
      <Tooltip title="Connection failed">
        <div className="server-tip">{iconForStatus('failed')}</div>
      </Tooltip>
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
    if (serviceMode === 'Server') {
      const playgroundSDK = new PlaygroundSDK({
        type: 'remote-execution',
      });
      playgroundSDK.overrideConfig(config);
    }
  }, [config, serviceMode, serverValid]);

  // Determine content based on service mode
  const statusContent = serviceMode === 'Server' && renderServerTip();
  const title = TITLE_TEXT[serviceMode];

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
        <EnvConfig showTooltipWhenEmpty={serviceMode !== 'Server'} />
      </div>

      <div className="switch-btn-wrapper">{renderSwitchButton()}</div>
    </>
  );
};
