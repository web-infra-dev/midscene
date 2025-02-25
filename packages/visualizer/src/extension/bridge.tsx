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

const connectRetryInterval = 300;

type BridgeStatus =
  | 'listening'
  | 'connected'
  | 'disconnected' /* disconnected unintentionally */
  | 'closed';

class BridgeConnector {
  status: BridgeStatus = 'closed';

  activeBridgePage: ExtensionBridgePageBrowserSide | null = null;

  constructor(
    private onMessage: (message: string, type: 'log' | 'status') => void,
    private onBridgeStatusChange: (status: BridgeStatus) => void,
  ) {
    this.status = 'closed';
  }

  setStatus(status: BridgeStatus) {
    this.status = status;
    this.onBridgeStatusChange(status);
  }

  keepListening() {
    if (this.status === 'listening' || this.status === 'connected') {
      return;
    }

    this.setStatus('listening');

    Promise.resolve().then(async () => {
      while (true) {
        if (this.status === 'connected') {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        if (this.status === 'closed') {
          break;
        }

        if (this.status !== 'listening' && this.status !== 'disconnected') {
          throw new Error(`unexpected status: ${this.status}`);
        }

        let activeBridgePage: ExtensionBridgePageBrowserSide | null = null;
        try {
          activeBridgePage = new ExtensionBridgePageBrowserSide(() => {
            if (this.status !== 'closed') {
              this.setStatus('disconnected');
              this.activeBridgePage = null;
            }
          }, this.onMessage);
          await activeBridgePage.connect();
          this.activeBridgePage = activeBridgePage;

          this.setStatus('connected');
        } catch (e) {
          this.activeBridgePage = null;
          console.warn('failed to setup connection', e);
          await new Promise((resolve) =>
            setTimeout(resolve, connectRetryInterval),
          );
        }
      }
    });
  }

  async stopConnection() {
    if (this.status === 'closed') {
      console.warn('Cannot stop connection if not connected');
      return;
    }

    if (this.activeBridgePage) {
      await this.activeBridgePage.destroy();
      this.activeBridgePage = null;
    }

    this.setStatus('closed');
  }
}

export default function Bridge() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('closed');
  const [taskStatus, setTaskStatus] = useState<string>('');

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

  const activeBridgeConnectorRef = useRef<BridgeConnector | null>(
    new BridgeConnector(
      (message, type) => {
        appendBridgeLog(message);
        if (type === 'status') {
          console.log('status tip changed event', type, message);
          setTaskStatus(message);
        }
      },
      (status) => {
        console.log('status changed event', status);
        setTaskStatus('');
        setBridgeStatus(status);
        if (status !== 'connected') {
          appendBridgeLog(`Bridge status changed to ${status}`);
        }
      },
    ),
  );

  useEffect(() => {
    return () => {
      activeBridgeConnectorRef.current?.stopConnection();
    };
  }, []);

  const stopConnection = () => {
    activeBridgeConnectorRef.current?.stopConnection();
  };

  const startConnection = async () => {
    activeBridgeConnectorRef.current?.keepListening();
  };

  let statusIcon: any;
  let statusTip: string;
  let statusBtn: any;
  if (bridgeStatus === 'closed') {
    statusIcon = iconForStatus('closed');
    statusTip = 'Closed';
    statusBtn = (
      <Button
        type="primary"
        onClick={() => {
          startConnection();
        }}
      >
        Allow connection
      </Button>
    );
  } else if (bridgeStatus === 'listening' || bridgeStatus === 'disconnected') {
    statusIcon = (
      <Spin
        className="bridge-status-icon"
        indicator={<LoadingOutlined spin />}
        size="small"
      />
    );
    statusTip =
      bridgeStatus === 'listening'
        ? 'Listening for connection...'
        : 'Disconnected, listening for a new connection...';
    statusBtn = <Button onClick={stopConnection}>Stop</Button>;
  } else if (bridgeStatus === 'connected') {
    statusIcon = iconForStatus('connected');
    statusTip = taskStatus ? `Connected - ${taskStatus}` : 'Connected';

    statusBtn = (
      <Button
        onClick={() => {
          stopConnection();
        }}
      >
        Stop
      </Button>
    );
  } else {
    statusIcon = iconForStatus('failed');
    statusTip = `Unknown Status - ${bridgeStatus}`;
    statusBtn = null;
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
            <div className="bridge-status-text">
              <span className="bridge-status-icon">{statusIcon}</span>
              <span className="bridge-status-tip">{statusTip}</span>
            </div>
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
