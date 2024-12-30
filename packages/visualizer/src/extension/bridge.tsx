import { ChromeExtensionPageBrowserSide } from '@midscene/web/chrome-extension';
import { Button } from 'antd';
import { useEffect, useMemo, useState } from 'react';

export default function Bridge() {
  const [bridgePage, setBridgePage] =
    useState<ChromeExtensionPageBrowserSide | null>(null);

  const [bridgeStatus, setBridgeStatus] = useState<
    'closed' | 'open-for-connection' | 'connected'
  >('closed');

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

  const btnText = useMemo(() => {
    if (bridgeStatus === 'open-for-connection') {
      return 'Waiting for Connection...';
    }
    if (bridgeStatus === 'connected') {
      return 'Connected';
    }

    // closed
    return 'Allow Connection';
  }, [bridgeStatus]);

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
          <p>{bridgeStatus}</p>
          <Button
            type="primary"
            onClick={() => {
              if (bridgeStatus === 'closed') {
                startConnection();
              } else {
                console.warn(
                  'bridge is already connected, will not connect again',
                );
              }
            }}
          >
            {btnText}
          </Button>
        </div>
      </div>
    </div>
  );
}
