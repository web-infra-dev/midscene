import './index.less';
import { MobileOutlined } from '@ant-design/icons';
import { useServerValid } from '@midscene/visualizer';

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
  selectedDeviceId: string | null;
}

const AdbDevice: React.FC<AdbDeviceProps> = ({ selectedDeviceId }) => {
  const serverValid = useServerValid(true);

  return (
    <div className="device-header">
      <div className="device-title-container">
        <h2 className="device-title">Device</h2>
        <div className="device-info-display">
          <div className="device-icon-container">
            <MobileOutlined className="device-icon" />
            {selectedDeviceId && serverValid && (
              <div className="status-indicator">{onlineStatus('#52c41a')}</div>
            )}
          </div>
          {selectedDeviceId ? (
            <span className="device-name">{selectedDeviceId}</span>
          ) : (
            <span className="device-name no-device">No device selected</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdbDevice;
