import { Button, Card, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import './index.less';

const { Text, Title } = Typography;

interface IOSDeviceProps {
  serverUrl?: string;
  onServerStatusChange?: (connected: boolean) => void;
}

export default function IOSDevice({
  serverUrl = 'http://localhost:1412',
  onServerStatusChange,
}: IOSDeviceProps) {
  const [serverConnected, setServerConnected] = useState(false);
  const [checking, setChecking] = useState(false);

  // Helper function to get the appropriate URL for API calls
  const getApiUrl = (endpoint: string) => {
    // In development, use proxy; in production or when server is not localhost:1412, use direct URL
    if (
      serverUrl === 'http://localhost:1412' &&
      process.env.NODE_ENV === 'development'
    ) {
      return `/api/pyautogui${endpoint}`;
    }
    return `${serverUrl}${endpoint}`;
  };

  const checkServerStatus = async () => {
    setChecking(true);
    try {
      // Use proxy endpoint to avoid CORS issues
      const response = await fetch(getApiUrl('/health'));
      const connected = response.ok;
      setServerConnected(connected);
      onServerStatusChange?.(connected);
    } catch (error) {
      console.error('Failed to check server status:', error);
      setServerConnected(false);
      onServerStatusChange?.(false);
    } finally {
      setChecking(false);
    }
  };

  const startPyAutoGUIServer = () => {
    // Show instructions to user since we can't start server from frontend
    const message = `Please start the PyAutoGUI server manually:

1. Open Terminal
2. Run: npx @midscene/ios server
3. Make sure iPhone Mirroring app is open and connected`;

    alert(message);
  };

  useEffect(() => {
    checkServerStatus();
    // Check server status every 3 seconds
    const interval = setInterval(checkServerStatus, 3000);
    return () => clearInterval(interval);
  }, [serverUrl]);

  return (
    <div className="ios-device-container">
      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              iOS Device Connection
            </Title>
          </Space>
        }
        size="small"
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div className="server-status">
            <Space>
              <Text strong>PyAutoGUI Server:</Text>
              <div
                className={`status-indicator ${
                  serverConnected ? 'connected' : 'disconnected'
                }`}
              />
              <Text type={serverConnected ? 'success' : 'danger'}>
                {serverConnected ? 'Connected' : 'Disconnected'}
              </Text>
            </Space>
          </div>

          <div className="server-url">
            <Space>
              <Text>Server URL:</Text>
              <Text code>{serverUrl}</Text>
            </Space>
          </div>

          {!serverConnected && (
            <div className="connection-actions">
              <Space
                direction="vertical"
                size="small"
                style={{ width: '100%' }}
              >
                <Button
                  type="primary"
                  loading={checking}
                  onClick={checkServerStatus}
                  style={{ width: '100%' }}
                >
                  {checking ? 'Checking...' : 'Retry Connection'}
                </Button>
                <Button
                  type="default"
                  onClick={startPyAutoGUIServer}
                  style={{ width: '100%' }}
                >
                  Server Setup Instructions
                </Button>
              </Space>
            </div>
          )}

          {serverConnected && (
            <div className="connection-info">
              <Text type="success">✅ Ready for iOS automation</Text>
            </div>
          )}
        </Space>
      </Card>
    </div>
  );
}
