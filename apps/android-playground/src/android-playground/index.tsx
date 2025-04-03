import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Tabs } from 'antd';
import { useCallback, useState } from 'react';
import DeviceList from '../adb-devices';
import ScrcpyPlayer from '../scrcpy-player';

interface AdbDevicesProps {
  serverUrl: string;
}

const AdbDevices: React.FC<AdbDevicesProps> = ({ serverUrl }) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // handle device selection
  const handleDeviceSelect = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setError(null);
  }, []);

  // handle connection error
  const handleRetry = useCallback(() => {
    console.log('trying to reconnect...');
    setLoading(true);
    setError(null);

    // simulate reconnect
    setTimeout(() => {
      setLoading(false);
    }, 2000);
  }, []);

  return (
    <Row gutter={[16, 16]}>
      {error && (
        <Col span={24}>
          <Alert
            message="connection error"
            description={
              <div>
                {error}
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={handleRetry}
                  loading={loading}
                  style={{ marginLeft: 16 }}
                >
                  Retry
                </Button>
              </div>
            }
            type="error"
            showIcon
          />
        </Col>
      )}
      <Col span={24} md={8} lg={6}>
        <DeviceList serverUrl={serverUrl} onDeviceSelect={handleDeviceSelect} />
      </Col>
      <Col span={24} md={16} lg={18}>
        <Card>
          <Tabs
            items={[
              {
                key: 'screen',
                label: 'screen projection',
                children: (
                  <ScrcpyPlayer
                    serverUrl={serverUrl}
                    autoConnect={!!selectedDeviceId}
                    autoReconnect={true}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
};

export default AdbDevices;
