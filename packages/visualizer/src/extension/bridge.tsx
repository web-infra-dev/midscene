import { LoadingOutlined } from '@ant-design/icons';
import { ChromeExtensionPageBrowserSide } from '@midscene/web/chrome-extension';
import { Button, Spin } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import './bridge.less';
export default function Bridge() {
  const [bridgePage, setBridgePage] =
    useState<ChromeExtensionPageBrowserSide | null>(null);

  const [bridgeStatus, setBridgeStatus] = useState<
    'closed' | 'open-for-connection' | 'connected'
  >('closed');

  useEffect(() => {
    if (bridgeStatus === 'connected') {
      bridgePage?.destroy();
    }
  }, [bridgeStatus]);

  const startConnection = async () => {
    const bridgePage = new ChromeExtensionPageBrowserSide(() => {
      setBridgeStatus('closed');
    });
    try {
      setBridgeStatus('open-for-connection');
      await bridgePage.connect();
      console.log('bridgePage connected !', bridgePage);
      setBridgePage(bridgePage);
      setBridgeStatus('connected');
    } catch (e) {
      // TODO: log error
      console.error(e);
      setBridgeStatus('closed');
    }
  };

  const stopListening = () => {
    console.warn('not implemented');
  };

  const stopConnection = () => {
    if (bridgePage) {
      bridgePage.destroy();
    }
  };

  let statusText: any;
  let statusBtn: any;
  if (bridgeStatus === 'closed') {
    statusText = 'Closed';
    statusBtn = (
      <Button type="primary" onClick={startConnection}>
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
          <div className="bridge-log-container">
            <div className="bridge-log-item">
              <div className="bridge-log-item-time">12:00:00</div>
              <div className="bridge-log-item-content">
                <div className="bridge-log-item-content-title">
                  Bridge Connected
                </div>
                <div className="bridge-log-item-content-detail">
                  Bridge connected successfully
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
