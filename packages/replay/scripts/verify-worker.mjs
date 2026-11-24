import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { digest, imageBytes } from '../dist/es/tooling.mjs';
import { trackModelRequests } from './metrics.mjs';
import { loadTest } from './test-runner.mjs';
import { guardCommonJs } from './verify-loader.mjs';
import { describeWebPage } from './web-setup.mjs';

const options = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { out, manifest, ...runOptions } = options;
register(new URL('./verify-loader.mjs', import.meta.url), { data: manifest });
guardCommonJs(manifest);
const metrics = trackModelRequests();
const events = [];
const evidence = [];
const starts = [];
const seen = new Set();
const snapshots = new Map();
mkdirSync(join(out, 'images'));
let result;
let failure;
try {
  const { runTestProject } = await loadTest(runOptions.cwd);
  result = await runTestProject({
    ...runOptions,
    replay: 'strict',
    retry: 0,
    resultDir: join(out, 'results'),
    onReplayEvent: (event) => events.push(event),
    async beforeAgentNode(ctx, agent) {
      const position = ctx.scope === 'case' ? ctx.case : ctx.document;
      const identity =
        ctx.scope === 'case' ? ctx.case.runId : ctx.document.documentRunId;
      snapshots.set(agent, agent.dump?.executions?.length ?? 0);
      if (!seen.has(identity)) {
        seen.add(identity);
        let session;
        try {
          session = await describeWebPage(agent, ctx.context);
        } catch (error) {
          session = {
            mode: 'custom',
            browserContext: 'unknown',
            tab: 'unknown',
            businessState: 'unknown',
            reason: error.message,
          };
        }
        starts.push({ scopeId: identity, ...session, phase: position.phase });
      }
      metrics.phase = `${identity}:${position.phase}:${position.stepIndex + 1}`;
    },
    async afterAgentNode(ctx, agent, outcome) {
      const position = ctx.scope === 'case' ? ctx.case : ctx.document;
      const records = (agent.dump?.executions ?? [])
        .slice(snapshots.get(agent) ?? 0)
        .flatMap((execution) =>
          execution.tasks.flatMap((task) => task.recorder ?? []),
        );
      const shot = records.findLast(
        (record) => record.type === 'screenshot',
      )?.screenshot;
      let image;
      if (shot?.base64) {
        const bytes = imageBytes(shot.base64);
        image = `images/${digest(bytes)}.${bytes[0] === 0xff ? 'jpg' : 'png'}`;
        writeFileSync(join(out, image), bytes);
      }
      evidence.push({
        scopeId:
          ctx.scope === 'case' ? ctx.case.runId : ctx.document.documentRunId,
        phase: position.phase,
        stepIndex: position.stepIndex,
        status: outcome.status,
        prompt: ctx.input.prompt ?? ctx.input.scenario,
        image,
      });
    },
  });
} catch (error) {
  result = error.result;
  failure = { message: error.message, stack: error.stack };
} finally {
  metrics.stop();
  writeFileSync(
    join(out, 'replay.json'),
    JSON.stringify(
      {
        result,
        events,
        evidence,
        starts,
        modelRequests: metrics.requests,
        error: failure,
      },
      null,
      2,
    ),
  );
}
if (failure || result?.status !== 'success') process.exitCode = 1;
