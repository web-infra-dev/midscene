import { fileURLToPath } from 'node:url';
import { sleep } from '@midscene/core/utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

const pageUrl = 'https://todomvc.com/examples/react/dist/';
const midsceneImeId = 'com.midscene.ime/.MidsceneIME';
const midsceneImeApkPath = fileURLToPath(
  new URL('../../bin/midscene-ime.apk', import.meta.url),
);

async function waitForKeyboardVisibility(
  device: AndroidDevice,
  expectedVisible: boolean,
  timeoutMs = 15_000,
) {
  const adb = await (device as any).getAdb();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await adb.isSoftKeyboardPresent();
    const visible =
      typeof status === 'boolean' ? status : Boolean(status?.isKeyboardShown);
    if (visible === expectedVisible) {
      return;
    }
    await sleep(300);
  }

  throw new Error(
    `Timed out waiting for keyboard visibility=${expectedVisible}`,
  );
}

describe('android autoDismissKeyboard with MidsceneIME', () => {
  let device: AndroidDevice;
  let agent: AndroidAgent;
  let originalIme = '';

  beforeAll(async () => {
    const devices = await getConnectedDevices();
    device = new AndroidDevice(devices[0].udid, {
      autoDismissKeyboard: false,
      scrcpyConfig: {
        enabled: true,
      },
    });
    agent = new AndroidAgent(device, {
      aiActionContext:
        'If any location, permission, user agreement, or install confirmation popup appears, approve it unless it is clearly unrelated to the current test.',
    });

    await device.connect();

    const adb = await (device as any).getAdb();
    originalIme = (await adb.shell('settings get secure default_input_method'))
      .trim()
      .replace(/\r/g, '');

    await device.launch(pageUrl);
    await sleep(3000);
  });

  afterAll(async () => {
    const adb = await (device as any).getAdb();
    if (originalIme) {
      try {
        await adb.shell(`ime set ${originalIme}`);
      } catch {
        // best effort cleanup
      }
    }
    await device.destroy();
  });

  it('midscene-ime-auto-install hides keyboard without clearing text and keyboard can reopen', async () => {
    const adb = await (device as any).getAdb();
    const inputText = 'midscene-ime-auto-install-e2e';

    try {
      await adb.shell('pm uninstall com.midscene.ime');
    } catch {
      // ignore: helper may not be installed yet
    }
    (device as any).midsceneImeInstalled = false;

    await agent.aiAct(
      'click the todo input box at the top with placeholder "What needs to be done?"',
    );
    await waitForKeyboardVisibility(device, true);

    await device.keyboardType(inputText, {
      autoDismissKeyboard: 'midscene-ime-auto-install',
    });

    await waitForKeyboardVisibility(device, false);
    await agent.aiAssert(
      `the todo input box at the top still contains the exact text "${inputText}"`,
    );

    await agent.aiAct(
      `click the todo input box at the top that contains "${inputText}"`,
    );
    await waitForKeyboardVisibility(device, true);
  });

  it('midscene-ime reuses installed helper and dismisses keyboard without key events', async () => {
    const adb = await (device as any).getAdb();
    const inputText = 'midscene-ime-manual-e2e';

    const packages = await adb.shell('pm list packages com.midscene.ime');
    expect(packages).toContain('com.midscene.ime');

    await device.launch(pageUrl);
    await sleep(3000);
    await agent.aiAct(
      'click the todo input box at the top with placeholder "What needs to be done?"',
    );
    await waitForKeyboardVisibility(device, true);

    await device.keyboardType(inputText, {
      autoDismissKeyboard: 'midscene-ime',
    });

    await waitForKeyboardVisibility(device, false);
    await agent.aiAssert(
      `the todo input box at the top still contains the exact text "${inputText}"`,
    );

    const currentIme = (
      await adb.shell('settings get secure default_input_method')
    ).trim();
    expect(currentIme).not.toBe(midsceneImeId);

    await agent.aiAct(
      `click the todo input box at the top that contains "${inputText}"`,
    );
    await waitForKeyboardVisibility(device, true);
  });

  it('reinstalling an already installed MidsceneIME stays silent', async () => {
    const adb = await (device as any).getAdb();

    await adb.install(midsceneImeApkPath);
    const packages = await adb.shell('pm list packages com.midscene.ime');
    expect(packages).toContain('com.midscene.ime');

    await device.launch(pageUrl);
    await sleep(3000);
    await agent.aiAssert(
      'the current screen is the TodoMVC page in a browser, and there is no install confirmation dialog, package installer page, or permission popup covering the page',
    );

    await adb.install(midsceneImeApkPath);

    await agent.aiAssert(
      'the current screen is still the TodoMVC page in a browser, and there is no install confirmation dialog, package installer page, permission popup, or USB install approval popup',
    );

    const focusDump = await adb.shell(
      "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'",
    );
    expect(focusDump).not.toContain('packageinstaller');
    expect(focusDump).not.toContain('permissioncontroller');
  });
});
