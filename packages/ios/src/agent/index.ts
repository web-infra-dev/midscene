import { PageAgent, type PageAgentOpt } from '@midscene/web/agent';
import { iOSDevice, type iOSDeviceOpt } from '../page';
import { startPyAutoGUIServer } from '../utils';

type iOSAgentOpt = PageAgentOpt;

export class iOSAgent extends PageAgent<iOSDevice> {
  declare page: iOSDevice;
  private connectionPromise: Promise<void> | null = null;

  constructor(page: iOSDevice, opts?: iOSAgentOpt) {
    super(page, opts);
    this.ensureConnected();
  }

  private ensureConnected(): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.page.connect();
    }
    return this.connectionPromise;
  }
}

export async function agentFromPyAutoGUI(opts?: iOSAgentOpt & iOSDeviceOpt) {
  // Start PyAutoGUI server if not already running
  const serverPort = opts?.serverPort || 1412;

  try {
    // Try to test if server is already running
    const fetch = (await import('node-fetch')).default;
    await fetch(`http://localhost:${serverPort}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sleep', seconds: 0 }),
    });
    console.log(`PyAutoGUI server is already running on port ${serverPort}`);
  } catch (error) {
    console.log(`Starting PyAutoGUI server on port ${serverPort}...`);
    await startPyAutoGUIServer(serverPort);
  }

  const page = new iOSDevice({
    serverUrl: opts?.serverUrl,
    serverPort,
    autoDismissKeyboard: opts?.autoDismissKeyboard,
    mirrorConfig: opts?.mirrorConfig,
  });

  await page.connect();

  return new iOSAgent(page, opts);
}
