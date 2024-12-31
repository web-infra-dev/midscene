import { LoadingOutlined } from '@ant-design/icons';
import { ChromeExtensionPageBrowserSide } from '@midscene/web/chrome-extension';
import { Button, Spin } from 'antd';
import { useEffect, useState } from 'react';
import './bridge.less';
import dayjs from 'dayjs';

interface BridgeLogItem {
  time: string;
  content: string;
}

const connectTimeout = 30 * 1000;
const connectRetryInterval = 300;
export default function Bridge() {
  const [activeBridgePage, setActiveBridgePage] =
    useState<ChromeExtensionPageBrowserSide | null>(null);

  const [bridgeStatus, setBridgeStatus] = useState<
    'closed' | 'open-for-connection' | 'connected'
  >('closed');

  const [bridgeLog, setBridgeLog] = useState<BridgeLogItem[]>([]);
  const appendBridgeLog = (content: string) => {
    setBridgeLog((prev) => [
      ...prev,
      {
        time: dayjs().format('HH:mm:ss.SSS'),
        content,
      },
    ]);
  };

  useEffect(() => {
    if (bridgeStatus === 'connected') {
      activeBridgePage?.destroy();
    }
  }, [bridgeStatus]);

  const stopConnection = () => {
    if (activeBridgePage) {
      activeBridgePage.destroy();
    }
    setBridgeStatus('closed');
    setActiveBridgePage(null);
  };

  const startConnection = async (timeout = connectTimeout) => {
    if (activeBridgePage) {
      console.error('activeBridgePage', activeBridgePage);
      throw new Error('There is already a connection, cannot start a new one');
    }
    const startTime = Date.now();
    setBridgeStatus('open-for-connection');
    while (Date.now() - startTime < timeout) {
      try {
        const activeBridgePage = new ChromeExtensionPageBrowserSide(() => {
          stopConnection();
        });
        await activeBridgePage.connect();
        setActiveBridgePage(activeBridgePage);
        setBridgeStatus('connected');
        appendBridgeLog('Bridge connected');
        return;
      } catch (e) {
        // console.warn('failed to connect to bridge server', e);
      }
      console.log('waiting for connection...');
      await new Promise((resolve) => setTimeout(resolve, connectRetryInterval));
    }

    setBridgeStatus('closed');
    appendBridgeLog('No connection found within timeout');
  };

  const stopListening = () => {
    console.warn('not implemented');
  };

  let statusText: any;
  let statusBtn: any;
  if (bridgeStatus === 'closed') {
    statusText = 'Closed';
    statusBtn = (
      <Button type="primary" onClick={() => startConnection()}>
        Allow Connection
      </Button>
    );
  } else if (bridgeStatus === 'open-for-connection') {
    statusText = (
      <span>
        <Spin indicator={<LoadingOutlined spin />} size="small" />
        {'  '}
        <span style={{ marginLeft: '6px', display: 'inline-block' }}>
          Listening for Connection...
        </span>
      </span>
    );
    statusBtn = <Button onClick={stopListening}>Stop</Button>;
  } else if (bridgeStatus === 'connected') {
    statusText = <span>Connected</span>;
    statusBtn = <Button onClick={stopConnection}>Stop</Button>;
  } else {
    statusText = <span>Unknown Status - {bridgeStatus}</span>;
    statusBtn = <Button onClick={stopConnection}>Stop</Button>;
  }

  const logs = bridgeLog.map((log) => {
    return (
      <div className="bridge-log-item" key={log.time}>
        <div className="bridge-log-item-time">{log.time}</div>
        <div className="bridge-log-item-content">{log.content}</div>
      </div>
    );
  });

  return (
    <div>
      <p>
        In Bridge Mode, you can control this browser by the Midscene SDK running
        in the local terminal.{' '}
      </p>
      <p>
        This is useful for interacting both through scripts and manually, or to
        reuse cookies.
      </p>

      <div className="playground-form-container">
        <div className="form-part">
          <h3>Bridge Status</h3>
          <div className="bridge-status-bar">
            <div>{statusText}</div>
            <div className="bridge-status-btn">{statusBtn}</div>
          </div>
        </div>
        <div className="form-part">
          <h3>Bridge Log</h3>
          <div className="bridge-log-container">{logs}</div>
        </div>
      </div>
    </div>
  );
}
