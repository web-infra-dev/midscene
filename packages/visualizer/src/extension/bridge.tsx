import { ChromeExtensionPageBrowserSide } from '@midscene/web/chrome-extension';
import { Button } from 'antd';
import { useEffect, useState } from 'react';

export default function Bridge() {
  const [bridgePage, setBridgePage] =
    useState<ChromeExtensionPageBrowserSide | null>(null);

  const [bridgeStatus, setBridgeStatus] = useState<
    'init' | 'connecting' | 'connected' | 'error' | 'closed'
  >('init');

  const startConnection = async () => {
    const bridgePage = new ChromeExtensionPageBrowserSide(() => {
      setBridgeStatus('closed');
    });
    try {
      setBridgeStatus('connecting');
      await bridgePage.connect();
      console.log('bridgePage connected !', bridgePage);
      setBridgePage(bridgePage);
      setBridgeStatus('connected');
    } catch (e) {
      console.error(e);
      setBridgeStatus('error');
    }
  };

  return (
    <div>
      <h1>Bridge Mode ({bridgeStatus})</h1>
      <Button
        onClick={() => {
          if (
            bridgeStatus === 'init' ||
            bridgeStatus === 'closed' ||
            bridgeStatus === 'error'
          ) {
            startConnection();
          } else {
            console.warn('bridge is already connected, will not connect again');
          }
        }}
      >
        Connect
      </Button>
    </div>
  );
}
