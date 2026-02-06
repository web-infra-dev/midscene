/// <reference types="chrome" />
import { globalThemeConfig } from '@midscene/visualizer';
import { Button, Checkbox, ConfigProvider } from 'antd';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { workerMessageTypes } from '../../utils/workerMessageTypes';
import './index.less';

const CONFIRM_TIMEOUT = 30000; // 30 seconds

function ConfirmDialog() {
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [countdown, setCountdown] = useState(
    Math.floor(CONFIRM_TIMEOUT / 1000),
  );
  const [serverUrl, setServerUrl] = useState<string>('');

  useEffect(() => {
    // Get server URL from URL params
    const params = new URLSearchParams(window.location.search);
    const url = params.get('serverUrl') || 'ws://localhost:3766';
    setServerUrl(url);

    // Start countdown timer
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-deny on timeout
          handleDeny();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleAllow = () => {
    chrome.runtime.sendMessage({
      type: workerMessageTypes.BRIDGE_CONFIRM_RESPONSE,
      payload: { allowed: true, alwaysAllow },
    });
    window.close();
  };

  const handleDeny = () => {
    chrome.runtime.sendMessage({
      type: workerMessageTypes.BRIDGE_CONFIRM_RESPONSE,
      payload: { allowed: false },
    });
    window.close();
  };

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div className="confirm-dialog">
        <div className="confirm-header">
          <img src="/icon128.png" alt="Midscene" className="confirm-logo" />
          <h2 className="confirm-title">Midscene Bridge</h2>
        </div>

        <div className="confirm-content">
          <p className="confirm-message">
            Midscene CLI is requesting to control this browser.
          </p>
          <div className="server-info">
            <span className="server-label">Server:</span>
            <span className="server-url">{serverUrl}</span>
          </div>
        </div>

        <div className="confirm-options">
          <Checkbox
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
          >
            Always allow connections
          </Checkbox>
        </div>

        <div className="confirm-footer">
          <div className="confirm-buttons">
            <Button onClick={handleDeny}>Deny ({countdown}s)</Button>
            <Button type="primary" onClick={handleAllow}>
              Allow
            </Button>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<ConfirmDialog />);
}
