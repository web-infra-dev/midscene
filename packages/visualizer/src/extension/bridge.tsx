import { LoadingOutlined } from '@ant-design/icons';
import { ExtensionBridgePageBrowserSide } from '@midscene/web/bridge-mode-browser';
import { Button, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import './bridge.less';
import { iconForStatus } from '@/component/misc';
import dayjs from 'dayjs';

interface BridgeLogItem {
  time: string;
  content: string;
}

enum BridgeStatus {
  Closed = 'closed',
  OpenForConnection = 'open-for-connection',
  Connected = 'connected',
}

const connectTimeout = 60 * 1000;
const connectRetryInterval = 300;
export default function Bridge() {
  const activeBridgePageRef = useRef<ExtensionBridgePageBrowserSide | null>(
    null,
  );
  const allowAutoConnectionRef = useRef(false);

  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(
    BridgeStatus.Closed,
  );

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
    setBridgeStatus(BridgeStatus.Closed);
  };

  const stopListeningFlag = useRef(false);
  const stopListening = () => {
    allowAutoConnectionRef.current = false;
    stopListeningFlag.current = true;
  };

  const startConnection = async (timeout = connectTimeout) => {
    if (activeBridgePageRef.current) {
      console.error('activeBridgePage', activeBridgePageRef.current);
      throw new Error('There is already a connection, cannot start a new one');
    }
    const startTime = Date.now();
    setBridgeAgentStatus('');
    appendBridgeLog('Listening for connection...');
    setBridgeStatus(BridgeStatus.OpenForConnection);
    stopListeningFlag.current = false;

    let noConnectionTip = 'No connection found within timeout';
    console.log('startConnection');
    while (true) {
      try {
        if (stopListeningFlag.current) {
          noConnectionTip = 'Listening stopped by user';
          break;
        }
        const activeBridgePage = new ExtensionBridgePageBrowserSide(
          () => {
            console.log('stopConnection');
            stopConnection();
            if (allowAutoConnectionRef.current) {
              setTimeout(() => {
                startConnection();
              }, connectRetryInterval);
            }
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
        setBridgeStatus(BridgeStatus.Connected);
        return;
      } catch (e) {
        console.warn('failed to setup connection', e);
      }
      console.log('will retry...');
      await new Promise((resolve) => setTimeout(resolve, connectRetryInterval));
    }

    setBridgeStatus(BridgeStatus.Closed);
    appendBridgeLog(noConnectionTip);
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
      <Button
        type="primary"
        onClick={() => {
          allowAutoConnectionRef.current = true;
          startConnection();
        }}
      >
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
    statusBtn = (
      <Button
        onClick={() => {
          allowAutoConnectionRef.current = false;
          stopConnection();
        }}
      >
        Stop
      </Button>
    );
  } else {
    statusElement = <span>Unknown Status - {bridgeStatus}</span>;
    statusBtn = (
      <Button
        onClick={() => {
          allowAutoConnectionRef.current = false;
          stopConnection();
        }}
      >
        Stop
      </Button>
    );
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
        scripts and manually, or to reuse cookies.{' '}
        <a
          href="https://www.midscenejs.com/bridge-mode-by-chrome-extension"
          target="_blank"
          rel="noreferrer"
        >
          More about bridge mode
        </a>
      </p>

      <div className="playground-form-container">
        <div className="form-part">
          <h3>Bridge Status</h3>
          <div className="bridge-status-bar">
            <div className="bridge-status-text">{statusElement}</div>
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
