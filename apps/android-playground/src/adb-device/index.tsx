import './index.less';
import { MobileOutlined } from '@ant-design/icons';
import { Button, Divider, Dropdown } from 'antd';
import { useCallback, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

// status dot indicator
const onlineStatus = (color: string) => (
  <span
    className="status-dot"
    style={{
      color: color,
    }}
  >
    ●
  </span>
);

export interface Device {
  id: string;
  name: string;
  status: string;
}

export interface AdbDeviceProps {
  devices: Device[];
  loadingDevices: boolean;
  selectedDeviceId: string | null;
  onDeviceSelect: (deviceId: string) => void;
  socketRef: React.RefObject<Socket | null>;
}

const AdbDevice: React.FC<AdbDeviceProps> = ({
  devices,
  loadingDevices,
  selectedDeviceId,
  onDeviceSelect,
  socketRef,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const lastSelectedDeviceRef = useRef<string | null>(null);

  // handle device selection
  const handleDeviceSelect = useCallback(
    (deviceId: string) => {
      if (deviceId === lastSelectedDeviceRef.current) {
        return;
      }

      // check socket connection status
      if (!socketRef.current || !socketRef.current.connected) {
        return;
      }

      // close dropdown
      setDropdownOpen(false);

      // call the parent component's device selection handler
      onDeviceSelect(deviceId);

      // update the last selected device id
      lastSelectedDeviceRef.current = deviceId;
    },
    [onDeviceSelect, socketRef],
  );

  return (
    <div className="device-header">
      <div className="device-title-container">
        <h2 className="device-title">Device</h2>
        <Dropdown
          trigger={['click']}
          placement="bottomLeft"
          open={dropdownOpen}
          onOpenChange={setDropdownOpen}
          dropdownRender={() => (
            <div className="device-dropdown">
              <div className="dropdown-header">
                <span className="dropdown-title">Devices list</span>
              </div>
              <div className="device-list">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    onClick={() => {
                      if (device.status.toLowerCase() === 'device') {
                        handleDeviceSelect(device.id);
                      }
                    }}
                    className={`device-list-item ${
                      device.status.toLowerCase() === 'device' &&
                      selectedDeviceId === device.id
                        ? 'selected'
                        : ''
                    } ${
                      device.status.toLowerCase() !== 'device' ? 'offline' : ''
                    }`}
                  >
                    <div className="device-item-content">
                      <div className="device-item-icon-container">
                        <MobileOutlined className="device-item-icon" />
                      </div>
                      <div className="device-item-info">
                        <div className="device-item-name">
                          {device.name || device.id}
                        </div>
                        <div className="device-item-status">
                          <div className="status-badge">
                            {device.status.toLowerCase() === 'device' ? (
                              <>
                                {onlineStatus('#52c41a')}
                                <span className="status-text">Online</span>
                              </>
                            ) : (
                              <>
                                {onlineStatus('#f5222d')}
                                <span className="status-text">Offline</span>
                              </>
                            )}
                          </div>
                          <Divider type="vertical" className="status-divider" />
                          <div className="device-id-container">
                            Device ID: {device.id}
                          </div>
                        </div>
                      </div>
                      {device.status.toLowerCase() === 'device' &&
                        selectedDeviceId === device.id && (
                          <div className="current-device-indicator">
                            Current device
                          </div>
                        )}
                    </div>
                  </div>
                ))}
                {devices.length === 0 && (
                  <div className="device-list-empty">No devices found</div>
                )}
              </div>
            </div>
          )}
        >
          <Button className="device-dropdown-button">
            <div className="device-icon-container">
              <MobileOutlined className="device-icon" />
              {selectedDeviceId && (
                <div className="status-indicator">
                  {devices
                    .find((d) => d.id === selectedDeviceId)
                    ?.status.toLowerCase() === 'device' ? (
                    <>{onlineStatus('#52c41a')}</>
                  ) : (
                    <>{onlineStatus('#f5222d')}</>
                  )}
                </div>
              )}
            </div>
            <span className="device-name">
              {selectedDeviceId
                ? devices.find((d) => d.id === selectedDeviceId)?.name ||
                  selectedDeviceId
                : ''}
            </span>
            <span className="dropdown-arrow">▼</span>
          </Button>
        </Dropdown>
      </div>
    </div>
  );
};

export default AdbDevice;
