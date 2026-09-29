import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { ComputerAgent, ComputerDevice } from '../../src';
import {
  type RunningWindowsDesktopFixture,
  startWindowsDesktopFixture,
  stopWindowsDesktopFixture,
  waitForWindowsFixtureState,
} from './windows-desktop-fixture';

const RUN_LIVE_SWIPE =
  process.platform === 'win32' &&
  process.env.MIDSCENE_WINDOWS_DESKTOP_SWIPE === '1';
const REPORT_FILE_NAME = 'windows-desktop-swipe';
const REPORT_HTML_FILE_NAME = `${REPORT_FILE_NAME}.html`;

interface ReportTask {
  type?: string;
  subType?: string;
}

interface ReportDump {
  executions?: Array<{ tasks?: ReportTask[] }>;
}

describe.skipIf(!RUN_LIVE_SWIPE)('Windows desktop Swipe AI E2E', () => {
  it('plans one Swipe action and moves a real WinForms TrackBar', async () => {
    const diagnosticsEnv = process.env.MIDSCENE_WINDOWS_DIAGNOSTICS_DIR;
    if (!diagnosticsEnv) {
      throw new Error(
        'MIDSCENE_WINDOWS_DIAGNOSTICS_DIR is required for the Windows Swipe E2E',
      );
    }

    const diagnosticsDir = path.resolve(diagnosticsEnv);
    const evidenceFile = path.join(diagnosticsDir, 'swipe-evidence.json');
    const runDir = path.resolve(process.env.MIDSCENE_RUN_DIR || 'midscene_run');
    const reportFile = path.join(runDir, 'report', REPORT_HTML_FILE_NAME);
    let fixture: RunningWindowsDesktopFixture | undefined;
    let device: ComputerDevice | undefined;
    let agent: ComputerAgent<ComputerDevice> | undefined;
    const evidence: Record<string, unknown> = {
      platform: process.platform,
      diagnosticsDir,
      reportFile,
    };

    await rm(reportFile, { force: true });
    try {
      fixture = await startWindowsDesktopFixture(
        diagnosticsDir,
        'swipe-fixture',
      );
      evidence.fixture = fixture.metadata;
      expect(fixture.metadata.slider.width).toBeGreaterThan(100);
      expect(fixture.metadata.slider.height).toBeGreaterThan(20);

      device = new ComputerDevice({});
      await device.connect();
      agent = new ComputerAgent(device, {
        aiActionContext:
          'You are validating desktop pointer gestures in a Windows CI fixture.',
        groupName: 'Windows desktop Swipe AI E2E',
        groupDescription:
          'Model-planned Swipe action against a real WinForms TrackBar',
        reportFileName: REPORT_FILE_NAME,
        autoPrintReportMsg: false,
        generateReport: true,
        waitAfterAction: 300,
      });

      await agent.aiAct(
        'Drag the slider labeled "DRAG SLIDER TO THE RIGHT" all the way to the right.',
      );
      const swipedState = await waitForWindowsFixtureState(
        fixture,
        (state) => state.sliderValue >= 90,
      );
      expect(swipedState.sliderValue).toBeGreaterThanOrEqual(90);
      expect(agent.metrics.calls).toBeGreaterThan(0);

      const swipeDump = JSON.parse(agent.dumpDataString()) as ReportDump;
      const swipeActionTasks = (swipeDump.executions ?? [])
        .flatMap((execution) => execution.tasks ?? [])
        .filter(
          (task) => task.type === 'Action Space' && task.subType === 'Swipe',
        );
      expect(swipeActionTasks).toHaveLength(1);

      evidence.swipe = {
        finalValue: swipedState.sliderValue,
        modelCalls: agent.metrics.calls,
        swipeActionCount: swipeActionTasks.length,
      };

      const completedAgent = agent;
      await completedAgent.destroy();
      agent = undefined;
      device = undefined;
      expect(completedAgent.reportFile).toBe(reportFile);
      const reportHtml = await readFile(reportFile, 'utf8');
      expect(reportHtml).not.toContain('REPLACE_ME_WITH_REPORT_HTML');
    } catch (error) {
      evidence.error =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error);
      throw error;
    } finally {
      if (agent) {
        await agent.destroy().catch((error) => {
          evidence.agentDestroyError = String(error);
        });
      } else if (device) {
        await device.destroy().catch((error) => {
          evidence.deviceDestroyError = String(error);
        });
      }
      await stopWindowsDesktopFixture(fixture).catch((error) => {
        evidence.fixtureStopError = String(error);
      });
      await writeFile(
        evidenceFile,
        `${JSON.stringify(evidence, null, 2)}\n`,
        'utf8',
      );
    }
  });
});
