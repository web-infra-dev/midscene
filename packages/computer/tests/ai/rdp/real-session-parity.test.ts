import { describe, expect, it } from 'vitest';
import { ComputerAgent, RDPDevice } from '../../../src';

const realRdpEnv = {
  enabled: process.env.MIDSCENE_RDP_REAL_TEST === '1',
  host: process.env.MIDSCENE_RDP_REAL_HOST,
  port: Number(process.env.MIDSCENE_RDP_REAL_PORT || '3389'),
  username: process.env.MIDSCENE_RDP_REAL_USERNAME,
  password: process.env.MIDSCENE_RDP_REAL_PASSWORD,
  ignoreCertificate: process.env.MIDSCENE_RDP_REAL_IGNORE_CERTIFICATE !== '0',
};

const shouldRunRealRdpTest = Boolean(
  realRdpEnv.enabled &&
    realRdpEnv.host &&
    realRdpEnv.username &&
    realRdpEnv.password,
);

const TRANSIENT_REAL_RDP_FAILURE_PATTERN =
  /ERRCONNECT_CONNECT_FAILED|ERRINFO_RPC_INITIATED_DISCONNECT|administrative tool on the server in another session/u;
const MAX_REAL_RDP_ATTEMPTS = 3;

function makeRealReportFileName(scenario: string, attempt: number) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .replace('Z', '');
  return `rdp-real-parity-${scenario}-${timestamp}-attempt-${attempt}`;
}

function createRealRdpDevice() {
  return new RDPDevice({
    host: realRdpEnv.host!,
    port: realRdpEnv.port,
    username: realRdpEnv.username!,
    password: realRdpEnv.password!,
    adminSession: false,
    ignoreCertificate: realRdpEnv.ignoreCertificate,
  });
}

function isTransientRealRdpFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_REAL_RDP_FAILURE_PATTERN.test(message);
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScenario(
  scenario: string,
  aiContext: string,
  run: (agent: ComputerAgent) => Promise<unknown>,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_REAL_RDP_ATTEMPTS; attempt++) {
    let device: RDPDevice | undefined;
    try {
      device = createRealRdpDevice();
      await device.connect();

      const agent = new ComputerAgent(device, {
        aiActionContext: aiContext,
        generateReport: true,
        autoPrintReportMsg: false,
        reportFileName: makeRealReportFileName(scenario, attempt),
      });

      const result = await run(agent);
      expect(result).toBeTruthy();
      return;
    } catch (error) {
      lastError = error;

      if (
        !isTransientRealRdpFailure(error) ||
        attempt === MAX_REAL_RDP_ATTEMPTS
      ) {
        throw error;
      }

      await delay(attempt * 2_000);
    } finally {
      await device?.destroy().catch(() => {});
    }
  }

  throw lastError;
}

describe.skipIf(!shouldRunRealRdpTest)(
  '@midscene/computer real RDP parity actions',
  {
    timeout: 8 * 60 * 1000,
  },
  () => {
    it('scrolls the Start menu all-apps list through segmented wheel events', async () => {
      await runScenario(
        'scroll-all-apps',
        'You are controlling a remote Windows desktop via the RDP protocol. Every screenshot and action comes from the remote machine.',
        (agent) =>
          agent.aiAct(
            'Open the Windows Start menu on the remote desktop, switch to the "全部" (All apps) list, then scroll down several times inside that list until the visible entries have clearly changed from the initial top entries (e.g. 7-Zip, Access) to later ones (e.g. 抖音, Excel, 飞连). Stop once the later entries are clearly visible.',
          ),
      );
    });

    it('middle-clicks the Edge taskbar icon to open a new Edge window', async () => {
      await runScenario(
        'middle-click-edge',
        'You are controlling a remote Windows desktop via the RDP protocol. Prefer the MiddleClick action (mouse middle button) over left or right click when the user explicitly asks for middle-click behavior.',
        (agent) =>
          agent.aiAct(
            'On the remote Windows taskbar, middle-click the Microsoft Edge icon using the MiddleClick action. Stop only once a new Edge browser window is clearly open on the remote desktop.',
          ),
      );
    });

    it('hovers the taskbar clock and keeps the pointer settled', async () => {
      await runScenario(
        'hover-clock',
        'You are controlling a remote Windows desktop via the RDP protocol. Use the Hover action for hover-only behavior — do not click the target.',
        (agent) =>
          agent.aiAct(
            'Hover the system clock area at the bottom-right of the remote Windows taskbar. Use the Hover action only — do not click. Stop once the pointer is resting on the clock area.',
          ),
      );
    });

    it('walks through tap, scroll, keyboard, hover, and middle click in one session', async () => {
      await runScenario(
        'walkthrough',
        'You are controlling a remote Windows desktop via the RDP protocol. This walkthrough exercises several action types — Tap, Scroll, KeyboardPress, Hover, and MiddleClick — in a single session so the generated report shows them together. Use the action that matches each sub-step literally; do not substitute one for another.',
        async (agent) => {
          await agent.aiAct(
            'Tap the Windows Start button on the remote desktop taskbar to open the Start menu.',
          );
          await agent.aiAct(
            'In the Start menu, switch to the "全部" (All apps) list by tapping the "全部" entry.',
          );
          await agent.aiAct(
            'Scroll down inside the All apps list so the visible entries clearly change from the initial top entries (e.g. 7-Zip, Access) to later ones (e.g. 抖音, Excel, 飞连). Stop once later entries are clearly visible.',
          );
          await agent.aiAct(
            'Press the Escape key to close the Start menu and return focus to the desktop.',
          );
          await agent.aiAct(
            'Hover the system clock area at the bottom-right of the taskbar using the Hover action. Do not click.',
          );
          await agent.aiAct(
            'Middle-click the Microsoft Edge icon on the taskbar using the MiddleClick action so a new Edge browser window opens on the remote desktop. Stop once the new Edge window is clearly visible.',
          );
          return 'walkthrough-complete';
        },
      );
    });
  },
);
