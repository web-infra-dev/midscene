import { LoadingOutlined } from '@ant-design/icons';
import { ChromeExtensionPageBrowserSide } from '@midscene/web/bridge-mode-browser';
import { Button, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import './bridge.less';
import { iconForStatus } from '@/component/misc';
import dayjs from 'dayjs';

interface BridgeLogItem {
  time: string;
  content: string;
}

const connectTimeout = 30 * 1000;
const connectRetryInterval = 300;
export default function Bridge() {
  const activeBridgePageRef = useRef<ChromeExtensionPageBrowserSide | null>(
    null,
  );

  const [bridgeStatus, setBridgeStatus] = useState<
    'closed' | 'open-for-connection' | 'connected'
  >('closed');

  const [bridgeLog, setBridgeLog] = useState<BridgeLogItem[]>([]);
  const [bridgeAgentStatus, setBridgeAgentStatus] = useState<string>('');
  const appendBridgeLog = (content: string) => {
    setBridgeLog((prev) => [
      ...prev,
      {
        time: dayjs().format('HH:mm:ss.SSS'),
        content,
      },
    ]);
  };

  const destroyBridgePage = () => {};

  useEffect(() => {
    return () => {
      destroyBridgePage();
    };
  }, []);

  const stopConnection = () => {
    if (activeBridgePageRef.current) {
      appendBridgeLog('Bridge disconnected');
      activeBridgePageRef.current.destroy();
      activeBridgePageRef.current = null;
    }
    setBridgeStatus('closed');
  };

  const stopListeningFlag = useRef(false);
  const stopListening = () => {
    stopListeningFlag.current = true;
  };

  const startConnection = async (timeout = connectTimeout) => {
    if (activeBridgePageRef.current) {
      console.error('activeBridgePage', activeBridgePageRef.current);
      throw new Error('There is already a connection, cannot start a new one');
    }
    const startTime = Date.now();
    setBridgeLog([]);
    setBridgeAgentStatus('');
    appendBridgeLog('Listening for connection...');
    setBridgeStatus('open-for-connection');
    stopListeningFlag.current = false;

    while (Date.now() - startTime < timeout) {
      try {
        if (stopListeningFlag.current) {
          break;
        }
        const activeBridgePage = new ChromeExtensionPageBrowserSide(
          () => {
            stopConnection();
          },
          (message, type) => {
            appendBridgeLog(message);
            if (type === 'status') {
              setBridgeAgentStatus(message);
            }
          },
        );
        await activeBridgePage.connect();
        activeBridgePageRef.current = activeBridgePage;
        setBridgeStatus('connected');
        appendBridgeLog('Bridge connected');
        return;
      } catch (e) {
        console.warn('failed to connect to bridge server', e);
      }
      console.log('will retry...');
      await new Promise((resolve) => setTimeout(resolve, connectRetryInterval));
    }

    setBridgeStatus('closed');
    appendBridgeLog('No connection found within timeout');
  };

  let statusElement: any;
  let statusBtn: any;
  if (bridgeStatus === 'closed') {
    statusElement = (
      <span>
        {iconForStatus('closed')}
        {'  '}
        Closed
      </span>
    );
    statusBtn = (
      <Button type="primary" onClick={() => startConnection()}>
        Allow connection
      </Button>
    );
  } else if (bridgeStatus === 'open-for-connection') {
    statusElement = (
      <span>
        <Spin indicator={<LoadingOutlined spin />} size="small" />
        {'  '}
        <span style={{ marginLeft: '6px', display: 'inline-block' }}>
          Listening for connection...
        </span>
      </span>
    );
    statusBtn = <Button onClick={stopListening}>Stop</Button>;
  } else if (bridgeStatus === 'connected') {
    statusElement = (
      <span>
        {iconForStatus('connected')}
        {'  '}
        Connected
        <span
          style={{
            marginLeft: '6px',
            display: bridgeAgentStatus ? 'inline-block' : 'none',
          }}
        >
          - {bridgeAgentStatus}
        </span>
      </span>
    );
    statusBtn = <Button onClick={stopConnection}>Stop</Button>;
  } else {
    statusElement = <span>Unknown Status - {bridgeStatus}</span>;
    statusBtn = <Button onClick={stopConnection}>Stop</Button>;
  }

  const logs = [...bridgeLog].reverse().map((log, index) => {
    return (
      <div className="bridge-log-item" key={index}>
        <div
          className="bridge-log-item-content"
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: 'tnum',
          }}
        >
          {log.time} - {log.content}
        </div>
      </div>
    );
  });

  return (
    <div>
      <p>
        In Bridge Mode, you can control this browser by the Midscene SDK running
        in the local terminal. This is useful for interacting both through
        scripts and manually, or to reuse cookies.
      </p>

      <div className="playground-form-container">
        <div className="form-part">
          <h3>Bridge Status</h3>
          <div className="bridge-status-bar">
            <div>{statusElement}</div>
            <div className="bridge-status-btn">{statusBtn}</div>
          </div>
        </div>
        <div className="form-part">
          <h3>
            Bridge Log{' '}
            <Button
              type="text"
              onClick={() => setBridgeLog([])}
              style={{
                marginLeft: '6px',
                display: logs.length > 0 ? 'inline-block' : 'none',
              }}
            >
              clear
            </Button>
          </h3>
          <div className="bridge-log-container">{logs}</div>
        </div>
      </div>
    </div>
  );
}
