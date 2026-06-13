/**
 * `CodexGeneralAgent` — opt-in general agent (`generalAgent.type: 'codex'`):
 * spawns `codex exec` per step, prompt on stdin, reply read from the
 * `--output-last-message` file. Endpoint/key reuse injects a `midscene`
 * model provider via `-c` overrides; with a `codex://` or absent base URL it
 * gracefully degrades to plain `codex exec` (the user's `codex login`).
 */
import { promises as fs } from 'node:fs';
import type {
  GeneralAgent,
  GeneralAgentConfig,
  GeneralAgentRequest,
  GeneralAgentResult,
} from '../types';
import { ERROR_PREFIX } from '../types';
import {
  cliFailureError,
  planCommon,
  runCli,
  throwOnNonZeroExit,
  tmpFilePath,
  withScreenshotFile,
} from './cli-agent';
import {
  buildGeneralPrompt,
  pruneSentSkills,
  toGeneralResult,
} from './general-prompt';

const INSTALL_HINT =
  '`codex` CLI not found. Install it with `npm i -g @openai/codex`, then authenticate with `codex login` (or set the MIDSCENE_MODEL_* env vars).';

const AUTH_HINT =
  'This looks like an authentication failure. Run `codex login`, or check MIDSCENE_MODEL_API_KEY (or the key your endpoint expects), or pass credentials via `generalAgent.env`.';

/**
 * `-c key=value` values are TOML-parsed by codex. JSON string escaping is a
 * compatible subset of TOML basic strings for the URLs/identifiers we quote
 * here (`"`, `\`, control chars).
 */
function tomlString(value: string): string {
  return JSON.stringify(value);
}

type SandboxPolicy = 'read-only' | 'workspace-write' | 'danger-full-access';

interface CodexPlan {
  /** `-c` provider overrides; empty in the `codex login` degrade mode. */
  providerArgs: string[];
  /** -m value; undefined lets codex pick its configured default. */
  model?: string;
  sandbox: SandboxPolicy;
  /** `permissions: 'all'` must bypass approvals as well as sandboxing. */
  bypassApprovalsAndSandbox: boolean;
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs: number;
  sessionPerScenario: boolean;
}

function planCodex(config: GeneralAgentConfig, baseDir: string): CodexPlan {
  const common = planCommon(config, baseDir);
  const { resolved } = common;

  let sandbox: SandboxPolicy;
  switch (common.permissions) {
    case 'read-only':
      sandbox = 'read-only';
      break;
    case 'workspace':
      sandbox = 'workspace-write';
      break;
    case 'all':
      sandbox = 'danger-full-access';
      break;
    default: {
      const exhaustive: never = common.permissions;
      throw new Error(`${ERROR_PREFIX} unknown permissions: ${exhaustive}`);
    }
  }

  let providerArgs: string[] = [];
  let model = config.model;
  if (common.reuse && resolved.baseUrlKind === 'http') {
    model = config.model ?? resolved.modelName;
    if (!model) {
      throw new Error(
        `${ERROR_PREFIX} generalAgent (codex): the Midscene endpoint is set but no model name is — set MIDSCENE_MODEL_NAME or generalAgent.model.`,
      );
    }
    providerArgs = [
      '-c',
      `model_providers.midscene.name=${tomlString('Midscene model endpoint')}`,
      '-c',
      `model_providers.midscene.base_url=${tomlString(resolved.baseUrl)}`,
      '-c',
      `model_providers.midscene.wire_api=${tomlString('chat')}`,
      '-c',
      `model_provider=${tomlString('midscene')}`,
    ];
    if (resolved.apiKeyVar) {
      // env_key names the variable; codex reads the secret from the spawned
      // env, so the key itself stays out of argv.
      providerArgs.push(
        '-c',
        `model_providers.midscene.env_key=${tomlString(resolved.apiKeyVar)}`,
      );
    }
  }
  // No http(s) base URL (or reuse disabled): plain `codex exec` relying on
  // the user's `codex login` — the graceful degrade, including
  // MIDSCENE_MODEL_BASE_URL=codex://… setups.

  return {
    providerArgs,
    model,
    sandbox,
    bypassApprovalsAndSandbox: common.permissions === 'all',
    env: common.env,
    cwd: common.cwd,
    timeoutMs: common.timeoutMs,
    sessionPerScenario: common.sessionPerScenario,
  };
}

/** Extract the thread id from `--json` events ({"type":"thread.started"}). */
export function parseCodexThreadId(stdout: string): string | undefined {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const evt = event as { type?: unknown; thread_id?: unknown };
    if (evt.type === 'thread.started' && typeof evt.thread_id === 'string') {
      return evt.thread_id;
    }
  }
  return undefined;
}

export class CodexGeneralAgent implements GeneralAgent {
  private plan: CodexPlan;
  private sessionId?: string;
  /** Skill docs already in the session's context — not re-sent (see pruneSentSkills). */
  private sentSkills = new Set<string>();

  constructor(config: GeneralAgentConfig, baseDir: string) {
    this.plan = planCodex(config, baseDir);
  }

  async run(req: GeneralAgentRequest): Promise<GeneralAgentResult> {
    const { plan } = this;
    // Test-only override so unit tests can substitute a fixture script for
    // the real CLI. Deliberately NOT part of the public config schema.
    const bin = process.env.MIDSCENE_BDD_CODEX_BIN || 'codex';
    const lastMessageFile = tmpFilePath('.txt');
    const promptReq = this.sessionId
      ? pruneSentSkills(req, this.sentSkills)
      : req;

    const text = await withScreenshotFile(
      req.screenshotBase64,
      async (screenshotPath) => {
        const resumeId = plan.sessionPerScenario ? this.sessionId : undefined;
        const args = resumeId
          ? // `codex exec resume` does not support --cd/--sandbox (verified
            // against codex 0.139): the session keeps its original cwd, and
            // the sandbox is re-applied through the config key.
            [
              'exec',
              'resume',
              resumeId,
              '--json',
              '-o',
              lastMessageFile,
              '--skip-git-repo-check',
              ...(plan.bypassApprovalsAndSandbox
                ? ['--dangerously-bypass-approvals-and-sandbox']
                : ['-c', `sandbox_mode=${tomlString(plan.sandbox)}`]),
              ...(plan.model ? ['-c', `model=${tomlString(plan.model)}`] : []),
            ]
          : [
              'exec',
              '--json',
              '-o',
              lastMessageFile,
              '--cd',
              plan.cwd,
              '--skip-git-repo-check',
              ...(plan.bypassApprovalsAndSandbox
                ? ['--dangerously-bypass-approvals-and-sandbox']
                : ['--sandbox', plan.sandbox]),
              ...(plan.model ? ['-m', plan.model] : []),
            ];
        args.push(...plan.providerArgs);
        if (screenshotPath) args.push('-i', screenshotPath);
        args.push('-'); // prompt on stdin

        try {
          const outcome = await runCli({
            bin,
            args,
            env: plan.env,
            cwd: plan.cwd,
            timeoutMs: plan.timeoutMs,
            stdin: buildGeneralPrompt(promptReq),
            label: 'codex',
            installHint: INSTALL_HINT,
          });

          throwOnNonZeroExit('codex', outcome, AUTH_HINT);

          if (plan.sessionPerScenario && !this.sessionId) {
            this.sessionId = parseCodexThreadId(outcome.stdout);
          }

          let reply: string;
          try {
            reply = (await fs.readFile(lastMessageFile, 'utf8')).trim();
          } catch (error) {
            // Expected only when codex never wrote the file; anything else
            // (EACCES, …) is a real error and must not masquerade as an
            // empty reply.
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
            reply = '';
          }
          if (reply.length === 0) {
            throw cliFailureError(
              'codex',
              'wrote no final message (exit code 0) — treating as failure.',
              `${outcome.stdout}\n${outcome.stderr}`,
              AUTH_HINT,
            );
          }
          return reply;
        } finally {
          await fs.rm(lastMessageFile, { force: true });
        }
      },
    );

    // Only mark skills as in-context once session continuity is real: if no
    // session id was captured, the next run starts fresh and must re-send.
    if (this.sessionId) {
      for (const skill of req.skills) this.sentSkills.add(skill.name);
    }
    return toGeneralResult(req, text);
  }

  async dispose(): Promise<void> {
    this.sessionId = undefined;
    this.sentSkills.clear();
  }
}
