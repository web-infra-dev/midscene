import './index.less';
import { MobileOutlined } from '@ant-design/icons';
import { useServerValid } from '@midscene/visualizer';
import { Button, Divider, Dropdown, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import type { ScrcpyRefMethods } from '../scrcpy-player';

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
  scrcpyPlayerRef: RefObject<ScrcpyRefMethods>;
}

const AdbDevice: React.FC<AdbDeviceProps> = ({
  devices,
  loadingDevices,
  selectedDeviceId,
  onDeviceSelect,
  socketRef,
  scrcpyPlayerRef,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const lastSelectedDeviceRef = useRef<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const serverValid = useServerValid(true);

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

  // disconnect device
  const disconnectDevice = useCallback(() => {
    // call ScrcpyPlayer's disconnectDevice method
    if (scrcpyPlayerRef.current) {
      scrcpyPlayerRef.current.disconnectDevice();
      messageApi.info('Device disconnected');
    }
  }, [scrcpyPlayerRef, messageApi]);

  // check if selected device is offline
  const isSelectedDeviceOffline = selectedDeviceId
    ? devices.find((d) => d.id === selectedDeviceId)?.status.toLowerCase() !==
      'device'
    : false;

  // automatically unlink when device goes offline
  useEffect(() => {
    if (isSelectedDeviceOffline && selectedDeviceId) {
      disconnectDevice();
    }
  }, [isSelectedDeviceOffline, selectedDeviceId, disconnectDevice, messageApi]);

  return (
    <div className="device-header">
      {contextHolder}
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
              {selectedDeviceId && serverValid && (
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
            {selectedDeviceId && !isSelectedDeviceOffline && serverValid ? (
              <span className="device-name">
                {devices.find((d) => d.id === selectedDeviceId)?.name ||
                  selectedDeviceId}
              </span>
            ) : (
              <span className="device-name no-device">No device</span>
            )}
            <span className="dropdown-arrow">▼</span>
          </Button>
        </Dropdown>
      </div>
    </div>
  );
};

export default AdbDevice;
