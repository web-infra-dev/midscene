import { MobileOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Empty,
  List,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { type Socket, io } from 'socket.io-client';

const { Text } = Typography;

interface Device {
  id: string;
  name: string;
  status: string;
}

interface DeviceListProps {
  serverUrl: string;
  onDeviceSelect?: (deviceId: string) => void;
}

const DeviceList: React.FC<DeviceListProps> = ({
  serverUrl,
  onDeviceSelect,
}) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [selectionTriggered, setSelectionTriggered] = useState(false);

  // connect to device server
  useEffect(() => {
    const newSocket = io(serverUrl, {
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    newSocket.on('connect', () => {
      console.log('connected to device server');
      // after connected, request devices list
      newSocket.emit('get-devices');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('disconnected from device server:', reason);
      setLoading(true);
    });

    newSocket.on(
      'devices-list',
      (data: { devices: Device[]; currentDeviceId: string | null }) => {
        setDevices(data.devices);
        setCurrentDeviceId(data.currentDeviceId);
        setLoading(false);
      },
    );

    newSocket.on('global-device-switched', (data: { deviceId: string }) => {
      setCurrentDeviceId(data.deviceId);
      // do not show the message here, avoid duplicate
      console.log(`device switched to: ${data.deviceId}`);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      message.error(
        'waiting for connection to device server, please try again later',
      );
      setLoading(false);
    });

    // add error listener
    newSocket.on('error', (error) => {
      console.error('Socket.IO error:', error);
      message.error(
        `error occurred while communicating with the server: ${error.message || 'unknown error'}`,
      );
    });

    setSocket(newSocket);

    // request devices list periodically, prevent the initial request from being ignored
    const timer = setTimeout(() => {
      if (newSocket.connected) {
        newSocket.emit('get-devices');
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      console.log('disconnect Socket.IO connection');
      newSocket.disconnect();
    };
  }, [serverUrl]);

  // refresh devices list
  const refreshDevices = () => {
    setLoading(true);

    // if the Socket connection is disconnected, try to reconnect
    if (!socket?.connected) {
      console.log('try to reconnect Socket');

      // reconnect to device server
      const newSocket = io(serverUrl, {
        withCredentials: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 5000,
        forceNew: true, // force create a new connection
      });

      newSocket.on('connect', () => {
        console.log('reconnected to device server');
        newSocket.emit('get-devices');
        setSocket(newSocket);
      });

      newSocket.on(
        'devices-list',
        (data: { devices: Device[]; currentDeviceId: string | null }) => {
          setDevices(data.devices);
          setCurrentDeviceId(data.currentDeviceId);
          setLoading(false);
        },
      );

      newSocket.on('connect_error', (error) => {
        console.error('error occurred while reconnecting Socket:', error);
        message.error(
          'waiting for connection to device server, please try again later',
        );
        setLoading(false);
      });

      // if the connection is not established after 5 seconds, cancel the loading state
      setTimeout(() => {
        if (!newSocket.connected) {
          setLoading(false);
          message.error('connection timeout, please check the server status');
        }
      }, 5000);

      return;
    }

    // if connected, request devices list directly
    socket.emit('get-devices');

    // if the loading state is still active after 10 seconds, cancel the loading state
    setTimeout(() => {
      if (loading) {
        setLoading(false);
        message.warning('device list fetching timeout, please try again');
      }
    }, 10000);
  };

  // listen to the device list update, automatically connect the device
  useEffect(() => {
    // if the selection has been triggered before, or the loading state is still active, or there is no device, skip
    if (selectionTriggered || loading || devices.length !== 1) return;

    const device = devices[0];
    // if the device is online and the socket is connected, automatically select the device
    if (device.status.toLowerCase() === 'device' && socket?.connected) {
      // add a delay to ensure the connection is fully established
      setTimeout(() => {
        handleDeviceSelect(device.id);
        // mark the selection as triggered
        setSelectionTriggered(true);
      }, 1000);
    }
  }, [devices, loading, socket?.connected]);

  // switch device
  const handleDeviceSelect = (deviceId: string) => {
    if (!socket) {
      message.warning(
        'waiting for connection to device server, please try again later',
      );
      return;
    }

    if (!socket.connected) {
      message.warning('connecting to device server, please try again later');
      return;
    }

    setLoading(true);
    socket.emit('switch-device', deviceId);

    // add timeout handling
    const timeoutId = setTimeout(() => {
      setLoading(false);
      message.error('device switching timeout, please try again');
    }, 10000);

    socket.once('device-switched', () => {
      clearTimeout(timeoutId);
      setCurrentDeviceId(deviceId);
      setLoading(false);
      // message is displayed in the App component, do not show it here
      if (onDeviceSelect) {
        onDeviceSelect(deviceId);
      }
    });

    socket.once('error', (error) => {
      clearTimeout(timeoutId);
      setLoading(false);
      message.error(`device switching failed: ${error.message}`);
    });
  };

  // get device status badge
  const getDeviceStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'device':
        return <Badge status="success" text="online" />;
      case 'offline':
        return <Badge status="error" text="offline" />;
      case 'unauthorized':
        return <Badge status="warning" text="unauthorized" />;
      default:
        return <Badge status="default" text={status} />;
    }
  };

  return (
    <Card
      title={
        <Space>
          <MobileOutlined />
          <span>devices list</span>
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={refreshDevices}
          loading={loading}
          size="small"
        >
          Refresh
        </Button>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin>loading devices list...</Spin>
        </div>
      ) : devices.length > 0 ? (
        <List
          dataSource={devices}
          renderItem={(device) => (
            <List.Item key={device.id}>
              <List.Item.Meta
                title={device.name || device.id}
                description={
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text type="secondary">device ID: {device.id}</Text>
                    {getDeviceStatusBadge(device.status)}
                    <Button
                      key="select-button"
                      type={
                        currentDeviceId === device.id ? 'primary' : 'default'
                      }
                      disabled={device.status.toLowerCase() !== 'device'}
                      onClick={() => handleDeviceSelect(device.id)}
                      style={{ marginTop: 8 }}
                    >
                      {currentDeviceId === device.id
                        ? 'Current device'
                        : 'Select'}
                    </Button>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty
          description="no Android device found, please ensure the device is connected and USB debugging is enabled"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </Card>
  );
};

export default DeviceList;
