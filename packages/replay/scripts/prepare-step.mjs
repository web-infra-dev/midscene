import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { WebRecorder } from '../dist/es/tooling.mjs';
import { brief } from './record.mjs';
import { loadTest } from './test-runner.mjs';
import { describeWebPage } from './web-setup.mjs';

const finishMessage = 'REPLAY_PREPARATION_FINISHED';
export async function prepareStep(
  input,
  { caseName, step, record = false, out, configPath, onReady } = {},
) {
  if (!caseName?.trim() || !Number.isSafeInteger(step) || step < 1)
    throw new Error(
      'prepare-step requires --case NAME and --step N (starting at 1).',
    );
  if (record && !out) throw new Error('--record requires --out RECORDING_DIR.');
  const test = await loadTest();
  let prepared;
  let handoffFinished = false;
  let recorder;
  let attachment;
  let recording;
  const plan = await test.prepareTestRun({
    cwd: process.cwd(),
    testPath: resolve(input),
    configPath,
    caseName,
    retry: 0,
    async beforeAgentNode(ctx, agent) {
      if (
        ctx.scope !== 'case' ||
        ctx.case.phase !== 'steps' ||
        ctx.case.stepIndex !== step - 1
      )
        return;
      if (prepared)
        throw new Error(
          'PREPARE_TARGET_AMBIGUOUS: select one execution project.',
        );
      prepared = await describeWebPage(agent, ctx.context);
      if (record) {
        // The recorder uses Playwright; attach by exact target ID for either native host.
        const { chromium } = await import('playwright');
        attachment = await chromium.connectOverCDP(prepared.endpoint, {
          noDefaults: true,
        });
        let selected;
        for (const page of attachment
          .contexts()
          .flatMap((context) => context.pages())) {
          const session = await page.context().newCDPSession(page);
          try {
            if (
              (await session.send('Target.getTargetInfo')).targetInfo
                .targetId === prepared.targetId
            )
              selected = page;
          } finally {
            await session.detach();
          }
        }
        if (!selected)
          throw new Error(
            'PREPARE_PAGE_NOT_FOUND: active target is no longer available.',
          );
        recording = resolve(out);
        mkdirSync(dirname(recording), { recursive: true });
        mkdirSync(recording);
        recorder = new WebRecorder(selected, { captureAncestors: true });
        await recorder.start();
      }
      console.log(
        JSON.stringify(
          { status: 'ready', case: caseName, step, ...prepared, recording },
          null,
          2,
        ),
      );
      try {
        if (onReady)
          await onReady({ agent, context: ctx.context, ...prepared });
        else {
          const terminal = createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const cancel = new AbortController();
          terminal.once('SIGINT', () => cancel.abort());
          terminal.once('close', () => cancel.abort());
          const abort = () => cancel.abort(ctx.signal.reason);
          ctx.signal.addEventListener('abort', abort, { once: true });
          try {
            await terminal.question(
              '入口已准备好。操作完成后按 Enter 结束并释放资源；目标节点不会自动执行。\n',
              { signal: cancel.signal },
            );
          } finally {
            ctx.signal.removeEventListener('abort', abort);
            terminal.close();
          }
        }
      } finally {
        if (recorder) {
          await recorder.stop(recording);
          brief(recording, recording);
        }
        await recorder?.dispose();
        recorder = undefined;
        await attachment?.close();
        attachment = undefined;
      }
      handoffFinished = true;
      throw new Error(finishMessage);
    },
  });
  const targets = plan.projects.flatMap((project) =>
    project.invocations.flatMap((invocation) => invocation.document.cases),
  );
  if (targets.length !== 1 || targets[0].definition.steps.length < step)
    throw new Error(
      'PREPARE_TARGET_REQUIRED: exactly one selected Case and an existing step are required.',
    );
  // An authoring handoff can last longer than an ordinary test. Only its paused
  // node receives a long cooperative timeout; the source YAML stays unchanged.
  targets[0].definition.steps[step - 1].meta = {
    ...targets[0].definition.steps[step - 1].meta,
    timeoutMs: 86_400_000,
  };
  let result;
  try {
    result = await test.runPreparedTestProject(plan);
  } catch (error) {
    result = error.result;
    if (!result) throw error;
  } finally {
    await recorder?.dispose();
    await attachment?.close();
  }
  if (!prepared || !handoffFinished)
    throw new Error(
      `PREPARE_PREFIX_FAILED: target was not reached. See ${result?.reportPath ?? result?.summaryPath ?? 'native Test diagnostics'}`,
    );
  const cleanupScopes = [
    ...result.projects.map((project) => project.lifecycle),
    ...result.documents,
    ...result.cases.map((item) => item.run),
  ].filter(Boolean);
  if (
    result.errors?.length ||
    cleanupScopes.some(
      (scope) =>
        scope.teardownErrors?.length ||
        (scope.cleanup &&
          !['completed', 'not-required'].includes(scope.cleanup.status)) ||
        [...(scope.afterEach ?? []), ...(scope.afterAll ?? [])].some(
          (node) => node.status !== 'success',
        ),
    )
  )
    throw new Error(
      `PREPARE_CLEANUP_FAILED: see ${result.reportPath ?? result.summaryPath}`,
    );
  const outcome = {
    status: 'prepared-and-released',
    case: caseName,
    step,
    page: prepared,
    recording,
    report: result?.reportPath,
    note: 'Authoring only. The target and suffix were not executed; the native report records the intentional stop.',
  };
  if (recording)
    writeFileSync(
      join(recording, 'preparation.json'),
      JSON.stringify(outcome, null, 2),
    );
  return outcome;
}
