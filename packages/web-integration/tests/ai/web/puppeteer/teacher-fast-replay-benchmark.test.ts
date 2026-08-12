import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { PuppeteerAgent } from '@/puppeteer';
import { expect, it, vi } from 'vitest';
import { generateTeacherXpathMap } from './teacher-replay-utils';
import { createTestContext } from './test-utils';
import { launchPage } from './utils';

vi.setConfig({ testTimeout: 10 * 60 * 1000 });

const context = createTestContext();

type ExperimentRole = 'teacher' | 'replay';

function parseRole(value: string | undefined): ExperimentRole {
  if (value === 'teacher' || value === 'replay') return value;
  throw new Error(
    `Unknown TEACHER_FAST_REPLAY_ROLE "${value}". Expected "teacher" or "replay".`,
  );
}

function locateEvidence(value: unknown) {
  const evidence = {
    locateTasks: 0,
    xpathHits: 0,
    planHits: 0,
    aiLocateUsages: 0,
    resolvedXpaths: [] as string[],
    locatorPrompts: [] as string[],
  };
  const visit = (current: unknown) => {
    if (!current || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    const record = current as Record<string, unknown>;
    if (record.type === 'Planning' && record.subType === 'Locate') {
      evidence.locateTasks += 1;
      const hitBy = record.hitBy as
        | { from?: string; context?: { xpath?: string } }
        | undefined;
      if (hitBy?.from === 'User expected path') {
        evidence.xpathHits += 1;
        if (hitBy.context?.xpath) {
          evidence.resolvedXpaths.push(hitBy.context.xpath);
        }
      }
      if (hitBy?.from === 'Plan') evidence.planHits += 1;
      if (record.usage) evidence.aiLocateUsages += 1;

      const param = record.param as
        | { prompt?: string | { prompt?: string } }
        | undefined;
      const locatorPrompt =
        typeof param?.prompt === 'string'
          ? param.prompt
          : param?.prompt?.prompt;
      if (locatorPrompt) evidence.locatorPrompts.push(locatorPrompt);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return evidence;
}

function taskEvidence(dump: {
  executions?: Array<{ tasks?: Array<Record<string, unknown>> }>;
}) {
  const tasks =
    dump.executions?.flatMap((execution) => execution.tasks ?? []) ?? [];
  return {
    totalSteps: tasks.length,
    aiSteps: tasks.filter((task) => task.usage).length,
    planSteps: tasks.filter(
      (task) => task.type === 'Planning' && task.subType === 'Plan',
    ).length,
    locateSteps: tasks.filter(
      (task) => task.type === 'Planning' && task.subType === 'Locate',
    ).length,
    actionSteps: tasks.filter((task) => task.type === 'Action Space').length,
    actionTypes: tasks
      .filter((task) => task.type === 'Action Space')
      .map((task) => String(task.subType)),
  };
}

function classifyError(error: unknown): 'none' | 'transport' | 'model' {
  if (!error) return 'none';
  const message = error instanceof Error ? error.message : String(error);
  if (
    /connect timeout|etimedout|econnreset|socket hang up|fetch failed|network error/i.test(
      message,
    )
  ) {
    return 'transport';
  }
  return 'model';
}

it.skipIf(!process.env.TEACHER_FAST_REPLAY_ROLE)(
  'records one teacher-to-fast-replay login sample',
  async () => {
    const role = parseRole(process.env.TEACHER_FAST_REPLAY_ROLE);
    const round = process.env.TEACHER_FAST_REPLAY_ROUND ?? '1';
    const experimentId =
      process.env.TEACHER_FAST_REPLAY_EXPERIMENT_ID ?? 'teacher-fast-replay';
    const modelName = process.env.MIDSCENE_MODEL_NAME ?? 'unknown-model';
    const modelArtifactId = modelName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const artifactId = `${modelArtifactId}-${experimentId}-${role}-login-popup-r${round}`;
    const reportFileName = `teacher-fast-replay-${artifactId}`;
    const reportRoot = path.join(process.cwd(), 'midscene_run', 'report');
    const evidenceDir = path.join(reportRoot, 'teacher-fast-replay-evidence');
    await mkdir(evidenceDir, { recursive: true });

    const fixturePath = path.resolve(
      __dirname,
      '../playwright/__fixtures__/fast-login-popup/index.html',
    );
    const benchmarkPath = path.join(
      process.cwd(),
      'tests',
      'ai',
      'web',
      'puppeteer',
      'teacher-fast-replay-benchmark.test.ts',
    );
    const mapPath =
      role === 'replay' ? process.env.TEACHER_FAST_REPLAY_MAP_PATH : undefined;
    if (role === 'replay' && !mapPath) {
      throw new Error(
        'TEACHER_FAST_REPLAY_MAP_PATH is required for the replay role.',
      );
    }
    if (
      role === 'replay' &&
      process.env.MIDSCENE_MODEL_REASONING_ENABLED !== 'false'
    ) {
      throw new Error(
        'Replay requires MIDSCENE_MODEL_REASONING_ENABLED=false in addition to effort="fast".',
      );
    }

    const { originPage, reset } = await launchPage(
      pathToFileURL(fixturePath).href,
      { viewport: { width: 1440, height: 900 } },
    );
    context.resetFn = reset;
    await originPage.evaluate(() => {
      const targetWindow = window as typeof window & {
        __teacherReplayEvents: string[];
      };
      targetWindow.__teacherReplayEvents = [];
      const username = document.querySelector<HTMLInputElement>('#username');
      const password = document.querySelector<HTMLInputElement>('#password');
      const overlay = document.querySelector<HTMLElement>('#ad-overlay');
      const form = document.querySelector<HTMLFormElement>('#login-form');
      let usernameStarted = false;
      let passwordStarted = false;
      let advertisementOpened = false;

      username?.addEventListener('input', () => {
        if (!usernameStarted && username.value) {
          usernameStarted = true;
          targetWindow.__teacherReplayEvents.push('username-input-started');
        }
      });
      password?.addEventListener('input', () => {
        if (!passwordStarted && password.value) {
          passwordStarted = true;
          targetWindow.__teacherReplayEvents.push('password-input-started');
        }
      });
      if (overlay) {
        new MutationObserver(() => {
          if (!overlay.hidden && !advertisementOpened) {
            advertisementOpened = true;
            targetWindow.__teacherReplayEvents.push('advertisement-opened');
          } else if (overlay.hidden && advertisementOpened) {
            targetWindow.__teacherReplayEvents.push('advertisement-closed');
          }
        }).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
      }
      form?.addEventListener('submit', () => {
        targetWindow.__teacherReplayEvents.push('login-submitted');
      });
    });

    const agent = new PuppeteerAgent(originPage, {
      generateReport: true,
      persistExecutionDump: false,
      outputFormat: 'single-html',
      reportFileName,
      groupName: `Teacher to fast replay evidence: ${artifactId}`,
      groupDescription:
        'A dynamic advertisement interrupts a multi-step login workflow.',
      ...(role === 'teacher'
        ? {
            cache: {
              id: artifactId,
              strategy: 'write-only' as const,
              cacheDir: path.join(evidenceDir, 'teacher-cache'),
            },
          }
        : {}),
    });
    context.agent = agent;

    const startedAt = performance.now();
    let runError: unknown;
    try {
      await agent.aiAct(
        'Log in with username "demo-user" and password "demo-password".',
        {
          cacheable: role === 'teacher',
          effort: role === 'teacher' ? 'balance' : 'fast',
          ...(mapPath ? { loadElementXpaths: [mapPath] } : {}),
        },
      );
    } catch (error) {
      runError = error;
    }
    const wallTimeMs = Math.round(performance.now() - startedAt);
    const metrics = agent.metrics;
    const dump = agent.dumpDataString({ inlineScreenshots: true });
    const dumpObject = JSON.parse(dump);
    const locate = locateEvidence(dumpObject);
    const tasks = taskEvidence(dumpObject);
    const pageEvidence = await originPage.evaluate(() => {
      const targetWindow = window as typeof window & {
        __teacherReplayEvents: string[];
      };
      const overlay = document.querySelector<HTMLElement>('#ad-overlay');
      const success = document.querySelector<HTMLElement>('#success');
      return {
        loginState: document.body.dataset.loginState,
        username: document.querySelector<HTMLInputElement>('#username')?.value,
        password: document.querySelector<HTMLInputElement>('#password')?.value,
        overlayHidden: overlay?.hidden,
        successVisible: success
          ? getComputedStyle(success).display !== 'none'
          : false,
        events: targetWindow.__teacherReplayEvents,
      };
    });
    const openedIndex = pageEvidence.events.indexOf('advertisement-opened');
    const closedIndex = pageEvidence.events.indexOf('advertisement-closed');
    const submittedIndex = pageEvidence.events.indexOf('login-submitted');
    const interruptionObserved =
      openedIndex >= 0 &&
      closedIndex > openedIndex &&
      submittedIndex > closedIndex;
    const stateMatched =
      pageEvidence.loginState === 'signed-in' &&
      pageEvidence.username === 'demo-user' &&
      pageEvidence.password === 'demo-password' &&
      pageEvidence.overlayHidden === true &&
      pageEvidence.successVisible;
    const xpathReplayMatched =
      role === 'teacher' ||
      (locate.locateTasks > 0 &&
        locate.xpathHits === locate.locateTasks &&
        locate.aiLocateUsages === 0);

    await agent.destroy();
    context.agent = null;
    const generatedReportPath = path.join(reportRoot, `${reportFileName}.html`);
    const copiedReportPath = path.join(
      evidenceDir,
      `${artifactId}.report.html`,
    );
    await copyFile(generatedReportPath, copiedReportPath);
    const reportSha256 = createHash('sha256')
      .update(await readFile(copiedReportPath))
      .digest('hex');
    const teacherMapArtifact =
      role === 'teacher' && !runError && stateMatched && interruptionObserved
        ? await generateTeacherXpathMap(
            copiedReportPath,
            path.join(evidenceDir, 'teacher-maps', artifactId),
          )
        : undefined;
    await reset();
    context.resetFn = null;

    const errorClass = classifyError(runError);
    const evidence = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      gitCommit: process.env.TEACHER_FAST_REPLAY_COMMIT,
      experimentId,
      role,
      round,
      prompt: 'Log in with username "demo-user" and password "demo-password".',
      model: {
        name: modelName,
        family: process.env.MIDSCENE_MODEL_FAMILY,
        reasoningEnabled: process.env.MIDSCENE_MODEL_REASONING_ENABLED,
      },
      options: {
        effort: role === 'teacher' ? 'balance' : 'fast',
        cacheable: role === 'teacher',
        loadElementXpaths: role === 'replay',
        elementXpathFile: mapPath ? path.basename(mapPath) : undefined,
      },
      sourceEvidence: {
        fixtureSha256: createHash('sha256')
          .update(await readFile(fixturePath))
          .digest('hex'),
        benchmarkSha256: createHash('sha256')
          .update(await readFile(benchmarkPath))
          .digest('hex'),
        elementXpathFileSha256: mapPath
          ? createHash('sha256')
              .update(await readFile(mapPath))
              .digest('hex')
          : undefined,
      },
      wallTimeMs,
      metrics,
      taskEvidence: tasks,
      locateEvidence: locate,
      pageEvidence,
      interruptionObserved,
      stateMatched,
      xpathReplayMatched,
      errorClass,
      reportSha256,
      teacherMapArtifact: teacherMapArtifact
        ? {
            mapPath: path.relative(evidenceDir, teacherMapArtifact.mapPath),
            manifestPath: path.relative(
              evidenceDir,
              teacherMapArtifact.manifestPath,
            ),
            elementCount: teacherMapArtifact.elementCount,
            mapSha256: teacherMapArtifact.mapSha256,
            steps: teacherMapArtifact.steps,
          }
        : undefined,
      success:
        !runError && stateMatched && interruptionObserved && xpathReplayMatched,
      error:
        runError instanceof Error
          ? { name: runError.name, message: runError.message }
          : undefined,
    };

    await writeFile(
      path.join(evidenceDir, `${artifactId}.evidence.json`),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(evidenceDir, `${artifactId}.report-dump.json`),
      dump,
      'utf8',
    );

    if (runError) throw runError;
    expect(stateMatched).toBe(true);
    expect(interruptionObserved).toBe(true);
    expect(xpathReplayMatched).toBe(true);
  },
);
