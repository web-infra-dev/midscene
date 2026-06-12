/**
 * `OpencodeGeneralAgent` — default general agent: spawns the `opencode` CLI
 * (`opencode run`) per step. Zero-config endpoint/key reuse: when the
 * Midscene model env points at an http(s) endpoint, a `midscene` provider is
 * injected via the `OPENCODE_CONFIG_CONTENT` env var (opencode merges it
 * over the user's config files). The API key is referenced as
 * `{env:<VAR>}` so the secret never appears in config text.
 */
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
  withScreenshotFile,
} from './cli-agent';
import {
  buildGeneralPrompt,
  pruneSentSkills,
  toGeneralResult,
} from './general-prompt';

const INSTALL_HINT =
  "`opencode` CLI not found. Install it with `npm i -g opencode-ai` (or see https://opencode.ai). To use Codex instead set `generalAgent.type: 'codex'`.";

const AUTH_HINT =
  'This looks like an authentication failure. Check MIDSCENE_MODEL_API_KEY (or the key your endpoint expects), run `opencode auth login`, or pass credentials via `generalAgent.env`.';

interface OpencodePlan {
  /** -m value, always `provider/model`. */
  model: string;
  /** JSON for the OPENCODE_CONFIG_CONTENT env var. */
  configContent: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs: number;
  skipPermissions: boolean;
  sessionPerScenario: boolean;
}

/**
 * Resolve everything that can fail at construction time: model env reuse,
 * model id mapping, permission policy. Throws config errors eagerly so a
 * misconfigured run fails before any scenario starts.
 */
function planOpencode(
  config: GeneralAgentConfig,
  baseDir: string,
): OpencodePlan {
  const common = planCommon(config, baseDir);
  const { resolved } = common;
  const explicitModel = config.model;

  const generated: Record<string, unknown> = {
    share: 'disabled',
    autoupdate: false,
  };
  let skipPermissions = false;
  switch (common.permissions) {
    case 'read-only':
      generated.permission = { edit: 'deny', bash: 'deny' };
      break;
    case 'workspace':
      break; // opencode's defaults
    case 'all':
      skipPermissions = true;
      break;
    default: {
      const exhaustive: never = common.permissions;
      throw new Error(`${ERROR_PREFIX} unknown permissions: ${exhaustive}`);
    }
  }

  // Three exclusive model cases; each binds a non-nullable `model`.
  let model: string;
  if (explicitModel?.includes('/')) {
    // Explicit provider/model: opencode's own provider config (its auth or
    // generalAgent.env) — the Midscene provider is NOT injected.
    model = explicitModel;
  } else if (common.reuse && resolved.baseUrlKind === 'http') {
    const bareName = explicitModel ?? resolved.modelName;
    if (!bareName) {
      throw new Error(
        `${ERROR_PREFIX} generalAgent (opencode): the Midscene endpoint is set but no model name is — set MIDSCENE_MODEL_NAME or generalAgent.model.`,
      );
    }
    generated.provider = {
      midscene: {
        npm: '@ai-sdk/openai-compatible',
        options: {
          baseURL: resolved.baseUrl,
          // {env:VAR} defers the secret to the spawned env — the key never
          // appears in the generated config text.
          ...(resolved.apiKeyVar
            ? { apiKey: `{env:${resolved.apiKeyVar}}` }
            : {}),
        },
        models: { [bareName]: {} },
      },
    };
    model = `midscene/${bareName}`;
  } else if (resolved.baseUrlKind === 'codex') {
    throw new Error(
      `${ERROR_PREFIX} generalAgent (opencode): MIDSCENE_MODEL_BASE_URL is '${resolved.baseUrl}', which only Codex understands. Either set generalAgent.type: 'codex', or point opencode at a model with generalAgent.model ('provider/model') + generalAgent.env.`,
    );
  } else {
    throw new Error(
      `${ERROR_PREFIX} generalAgent (opencode): no usable model endpoint. Either set the MIDSCENE_MODEL_* env vars (http(s) endpoint), or set generalAgent.model ('provider/model') + generalAgent.env for a CLI-native setup, or provide generalAgent.factory.`,
    );
  }
  // Config-level default; the explicit -m on argv is what actually selects.
  generated.model = model;

  return {
    model,
    configContent: JSON.stringify(generated),
    env: common.env,
    cwd: common.cwd,
    timeoutMs: common.timeoutMs,
    skipPermissions,
    sessionPerScenario: common.sessionPerScenario,
  };
}

/** Parse `--format json` JSONL events: final text + the session id. */
export function parseOpencodeJsonEvents(stdout: string): {
  text: string;
  sessionId?: string;
} {
  const texts: string[] = [];
  let sessionId: string | undefined;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!event || typeof event !== 'object') continue;
    const evt = event as {
      type?: unknown;
      sessionID?: unknown;
      part?: { text?: unknown };
    };
    if (!sessionId && typeof evt.sessionID === 'string') {
      sessionId = evt.sessionID;
    }
    if (evt.type === 'text' && typeof evt.part?.text === 'string') {
      texts.push(evt.part.text);
    }
  }
  return { text: texts.join('\n\n'), sessionId };
}

export class OpencodeGeneralAgent implements GeneralAgent {
  private plan: OpencodePlan;
  private sessionId?: string;
  /** Skill docs already in the session's context — not re-sent (see pruneSentSkills). */
  private sentSkills = new Set<string>();

  constructor(config: GeneralAgentConfig, baseDir: string) {
    this.plan = planOpencode(config, baseDir);
  }

  async run(req: GeneralAgentRequest): Promise<GeneralAgentResult> {
    const { plan } = this;
    // Test-only override so unit tests can substitute a fixture script for
    // the real CLI. Deliberately NOT part of the public config schema.
    const bin = process.env.MIDSCENE_BDD_OPENCODE_BIN || 'opencode';
    const promptReq = this.sessionId
      ? pruneSentSkills(req, this.sentSkills)
      : req;

    const text = await withScreenshotFile(
      req.screenshotBase64,
      async (screenshotPath) => {
        const args = ['run', '--dir', plan.cwd, '-m', plan.model];
        if (plan.skipPermissions) args.push('--dangerously-skip-permissions');
        if (plan.sessionPerScenario) {
          // JSON events carry the session id (verified against opencode
          // 1.15.x: every event has a top-level sessionID).
          args.push('--format', 'json');
          if (this.sessionId) args.push('-s', this.sessionId);
        }
        if (screenshotPath) args.push('-f', screenshotPath);
        args.push(buildGeneralPrompt(promptReq));

        const outcome = await runCli({
          bin,
          args,
          env: { ...plan.env, OPENCODE_CONFIG_CONTENT: plan.configContent },
          cwd: plan.cwd,
          timeoutMs: plan.timeoutMs,
          label: 'opencode',
          installHint: INSTALL_HINT,
        });

        throwOnNonZeroExit('opencode', outcome, AUTH_HINT);
        // opencode has documented exit-0-on-error bugs: also sniff stderr
        // `Error:` lines and treat an empty reply as failure.
        const hasErrorLine = outcome.stderr
          .split('\n')
          .some((line) => line.trim().startsWith('Error:'));
        if (hasErrorLine) {
          throw cliFailureError(
            'opencode',
            'reported an error despite exit code 0.',
            `${outcome.stdout}\n${outcome.stderr}`,
            AUTH_HINT,
          );
        }

        let replyText: string;
        if (plan.sessionPerScenario) {
          const parsed = parseOpencodeJsonEvents(outcome.stdout);
          if (!this.sessionId && parsed.sessionId) {
            this.sessionId = parsed.sessionId;
          }
          replyText = parsed.text.trim();
        } else {
          replyText = outcome.stdout.trim();
        }

        if (replyText.length === 0) {
          // Include stdout: in session mode the JSON event stream is the
          // useful diagnostic even when no text part was produced.
          throw cliFailureError(
            'opencode',
            'produced no output (exit code 0) — treating as failure.',
            `${outcome.stdout}\n${outcome.stderr}`,
            AUTH_HINT,
          );
        }
        return replyText;
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
