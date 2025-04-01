import { Button, Tooltip } from 'antd';
import type React from 'react';
import { EnvConfig } from '../env-config';
import { iconForStatus } from '../misc';
import { useEnvConfig } from '../store';
import type { ServiceModeType } from './playground-types';
import { useServerValid } from './useServerValid';

interface ServiceModeControlProps {
  serviceMode: ServiceModeType;
}

export const ServiceModeControl: React.FC<ServiceModeControlProps> = ({
  serviceMode,
}) => {
  const { setServiceMode } = useEnvConfig();
  const serverValid = useServerValid(serviceMode === 'Server');

  const serverTip = !serverValid ? (
    <div className="server-tip">
      {iconForStatus('failed')} Connection failed
    </div>
  ) : (
    <div className="server-tip">{iconForStatus('connected')} Connected</div>
  );

  const switchBtn =
    serviceMode === 'In-Browser-Extension' ? null : (
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
            setServiceMode(serviceMode === 'Server' ? 'In-Browser' : 'Server');
          }}
        >
          {serviceMode === 'Server'
            ? 'Switch to In-Browser Mode'
            : 'Switch to Server Mode'}
        </Button>
      </Tooltip>
    );

  const statusContent = serviceMode === 'Server' ? serverTip : <EnvConfig />;

  return (
    <>
      <h3>
        {serviceMode === 'Server'
          ? 'Server Status'
          : 'In-Browser Request Config'}
      </h3>
      {statusContent}
      <div className="switch-btn-wrapper">{switchBtn}</div>
    </>
  );
};
