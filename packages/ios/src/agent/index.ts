import { vlLocateMode } from '@midscene/shared/env';
import { PageAgent, type PageAgentOpt } from '@midscene/web/agent';
import { iOSDevice, type iOSDeviceOpt } from '../page';
import { debugPage } from '../page';
import { getScreenSize, startPyAutoGUIServer } from '../utils';

type iOSAgentOpt = PageAgentOpt;

export class iOSAgent extends PageAgent<iOSDevice> {
  declare page: iOSDevice;

  async launch(uri: string): Promise<void> {
    const device = this.page;
    await device.launch(uri);
  }

  async back(): Promise<void> {
    await this.page.back();
  }

  async home(): Promise<void> {
    await this.page.home();
  }

  async recentApps(): Promise<void> {
    await this.page.recentApps();
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
