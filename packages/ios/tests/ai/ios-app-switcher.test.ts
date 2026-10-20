import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { afterAll, beforeAll, describe, expect, it, rs } from '@rstest/core';
import {
  type IOSAgent,
  agentFromWebDriverAgent,
  checkIOSEnvironment,
} from '../../src';

const RUN_APP_SWITCHER_AI_E2E =
  process.env.AI_TEST_TYPE === 'iOS' &&
  process.env.MIDSCENE_IOS_APP_SWITCHER_AI_E2E === '1';
const REPORT_FILE_NAME = 'ios-app-switcher-ai-e2e';
const diagnosticsDir = process.env.MIDSCENE_IOS_DIAGNOSTICS_DIR;

rs.setConfig({
  testTimeout: 300_000,
  hookTimeout: 60_000,
});

function screenshotBuffer(base64: string): Buffer {
  const match = /^data:image\/\w+;base64,(.+)$/s.exec(base64);
  if (!match) {
    throw new Error('iOS App Switcher screenshot is not a base64 data URL');
  }
  return Buffer.from(match[1], 'base64');
}

describe.skipIf(!RUN_APP_SWITCHER_AI_E2E)('IOSAppSwitcher AI E2E', () => {
  let agent: IOSAgent | undefined;

  beforeAll(async () => {
    const envCheck = await checkIOSEnvironment();
    if (!envCheck.available) {
      throw new Error(`iOS environment check failed: ${envCheck.error}`);
    }

    agent = await agentFromWebDriverAgent({
      wdaPort: DEFAULT_WDA_PORT,
      wdaHost: '127.0.0.1',
      reportFileName: REPORT_FILE_NAME,
      autoPrintReportMsg: false,
      aiActionContext:
        'This test verifies iOS system UI. A smaller floating app preview card with visible space or background around it is the iOS App Switcher. A normal full-screen app is not the App Switcher.',
    });
  });

  afterAll(async () => {
    if (!agent) {
      return;
    }

    const reportFile = agent.reportFile;
    const modelCalls = agent.metrics.calls;
    let diagnosticsError: unknown;
    if (diagnosticsDir) {
      try {
        const resolvedDiagnosticsDir = path.resolve(diagnosticsDir);
        await mkdir(resolvedDiagnosticsDir, { recursive: true });
        const screenshot = await agent.interface.screenshotBase64();
        await Promise.all([
          writeFile(
            path.join(resolvedDiagnosticsDir, 'app-switcher-ai-e2e-final.png'),
            screenshotBuffer(screenshot),
          ),
          writeFile(
            path.join(
              resolvedDiagnosticsDir,
              'app-switcher-ai-e2e-agent-dump.json',
            ),
            `${agent.dumpDataString()}\n`,
            'utf8',
          ),
        ]);
      } catch (error) {
        diagnosticsError = error;
      }
    }

    let destroyError: unknown;
    try {
      await agent.destroy();
    } catch (error) {
      destroyError = error;
    }

    if (diagnosticsDir) {
      await writeFile(
        path.join(
          path.resolve(diagnosticsDir),
          'app-switcher-ai-e2e-metadata.json',
        ),
        `${JSON.stringify(
          {
            reportFile,
            modelCalls,
            diagnosticsError:
              diagnosticsError instanceof Error
                ? diagnosticsError.message
                : diagnosticsError,
            destroyError:
              destroyError instanceof Error
                ? destroyError.message
                : destroyError,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    }

    if (diagnosticsError) {
      throw diagnosticsError;
    }
    if (destroyError) {
      throw destroyError;
    }
  });

  it('uses aiAssert to verify the iOS system App Switcher is visible', async () => {
    if (!agent) {
      throw new Error('IOSAgent was not initialized');
    }

    // Reset the foreground app on every retry so appSwitcher() always starts
    // from a normal full-screen app instead of toggling an existing switcher.
    await agent.launch('com.apple.Preferences');
    await sleep(1000);
    await agent.appSwitcher();
    const modelCallsBeforeAssert = agent.metrics.calls;
    await agent.aiAssert(
      'The current screen is the iOS system App Switcher (multitasking view): at least one app appears as a smaller floating preview card with visible background or space around it. A normal full-screen app screen does not satisfy this assertion.',
    );
    expect(agent.metrics.calls).toBeGreaterThan(modelCallsBeforeAssert);
  });
});
