/**
 * Live mode for the demo: a real Midscene web UI agent (puppeteer) on the
 * self-contained static shop in example/demo-app, with real model calls.
 *
 * Default model path: Midscene's CODEX APP-SERVER provider. When
 * MIDSCENE_MODEL_BASE_URL is unset and the `codex` CLI is on PATH, the demo
 * configures itself with:
 *
 *   MIDSCENE_MODEL_BASE_URL="codex://app-server"   (spawns `codex app-server`,
 *                                                   JSON-RPC over stdio, uses
 *                                                   the Codex CLI OAuth login —
 *                                                   no API key)
 *   MIDSCENE_MODEL_NAME="gpt-5.5"                  (override with env)
 *   MIDSCENE_MODEL_FAMILY="gpt-5"
 *
 * Prerequisites: `codex login` once (check `codex login status`). Any other
 * OpenAI-compatible endpoint still works by setting MIDSCENE_MODEL_* yourself.
 *
 * verify/soft/agent nodes use CodexGeneralAgent on the codex path (the Pi
 * default needs an HTTP endpoint and cannot speak codex://). Each scenario
 * gets a fresh browser so login/cart state never leaks between runs. Override
 * the page with DEMO_URL.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodexGeneralAgent } from '../../src/general-agent/codex-general-agent';
import { PiGeneralAgent } from '../../src/general-agent/pi-general-agent';
import type { GeneralAgentAdapter } from '../../src/general-agent/types';
import { createUIAgent } from '../../src/ui-agent/factory';

const CODEX_BASE_URL = 'codex://app-server';
const CODEX_DEFAULT_MODEL = 'gpt-5.5';
const CODEX_DEFAULT_FAMILY = 'gpt-5';

/**
 * Ensure model env is configured, preferring the codex app-server path.
 * Throws with concrete setup steps when nothing usable is found.
 */
export function ensureLiveModelEnv(env: NodeJS.ProcessEnv = process.env): {
  baseURL: string;
  isCodex: boolean;
} {
  if (!env.MIDSCENE_MODEL_BASE_URL) {
    if (!codexCliAvailable()) {
      throw new Error(
        [
          '[midscene] demo --live: no model configured and the `codex` CLI is not on PATH.',
          'Easiest path (no API key): install the Codex CLI, run `codex login`, and re-run.',
          'Alternative: export MIDSCENE_MODEL_BASE_URL / MIDSCENE_MODEL_API_KEY / MIDSCENE_MODEL_NAME / MIDSCENE_MODEL_FAMILY for an OpenAI-compatible endpoint.',
        ].join('\n'),
      );
    }
    env.MIDSCENE_MODEL_BASE_URL = CODEX_BASE_URL;
    env.MIDSCENE_MODEL_NAME ??= CODEX_DEFAULT_MODEL;
    env.MIDSCENE_MODEL_FAMILY ??= CODEX_DEFAULT_FAMILY;
    console.log(
      `[demo] using Midscene's codex app-server provider (model ${env.MIDSCENE_MODEL_NAME}, Codex CLI OAuth session — no API key).`,
    );
  }

  const baseURL = env.MIDSCENE_MODEL_BASE_URL;
  const isCodex = baseURL.trim().toLowerCase().startsWith('codex://');
  if (isCodex && !codexCliAvailable()) {
    throw new Error(
      '[midscene] demo --live: MIDSCENE_MODEL_BASE_URL points at codex:// but the `codex` CLI is not on PATH. Install it and run `codex login`.',
    );
  }
  return { baseURL, isCodex };
}

function codexCliAvailable(): boolean {
  const probe = spawnSync('codex', ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

export async function createLiveBundle() {
  const { isCodex } = ensureLiveModelEnv();

  const url =
    process.env.DEMO_URL ??
    pathToFileURL(join(__dirname, '../../example/demo-app/index.html')).href;

  const { agent, cleanup } = await createUIAgent(
    { type: 'web', options: { url } },
    { generateReport: true },
    process.env,
  );
  const general: GeneralAgentAdapter = isCodex
    ? new CodexGeneralAgent()
    : new PiGeneralAgent();

  return {
    uiAgent: agent,
    generalAgent: general,
    cleanup: async () => {
      await cleanup?.();
      await general.dispose?.();
    },
  };
}
