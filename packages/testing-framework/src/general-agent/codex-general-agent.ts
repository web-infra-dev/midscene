/**
 * Codex-backed implementation of the swappable {@link GeneralAgentAdapter}.
 *
 * The default Pi general agent needs an OpenAI-compatible HTTP endpoint, so
 * it cannot use Midscene's codex app-server provider
 * (`MIDSCENE_MODEL_BASE_URL="codex://app-server"`, which spawns `codex
 * app-server` and speaks JSON-RPC over stdio using the Codex CLI's OAuth
 * session — see `@midscene/core`'s `service-caller/codex-app-server`). This
 * adapter routes `verify` / `soft` / `agent` nodes through the same provider
 * via core's public `callAI`, so the whole framework can run on a single
 * `codex login` with no API key.
 *
 * Differences from the Pi adapter (POC scope):
 *  - no tool runtime: the verdict is requested as a strict JSON object in the
 *    reply and parsed fail-closed (no `report_verdict` tool, no `$skill`
 *    loading — referenced skills are only named in the prompt);
 *  - the screenshot is written to a temp file and passed as a `file://`
 *    image_url, which the codex provider maps to a localImage input.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callAI, getModelRuntime } from '@midscene/core/ai-model';
import { globalModelConfigManager } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import type { Verdict } from '../types';
import type {
  GeneralAgentAdapter,
  GeneralAgentInput,
  GeneralAgentResult,
} from './types';

const debug = getDebug('testing-framework:codex-general-agent');
const warn = getDebug('testing-framework:codex-general-agent', {
  console: true,
});

const VERDICT_INSTRUCTIONS = `
You have no tools in this environment. After your analysis, end your reply
with the verdict as a single JSON object on its own line, exactly in this
shape (no markdown fence around it):

{"pass": true|false, "reason": "<human-readable rationale>"}

If you cannot confidently determine the result, report "pass": false.`;

export class CodexGeneralAgent implements GeneralAgentAdapter {
  private tempDir?: string;
  private screenshotCount = 0;

  async run(input: GeneralAgentInput): Promise<GeneralAgentResult> {
    const needsVerdict = input.kind === 'verify' || input.kind === 'soft';

    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [{ type: 'text', text: this.buildPrompt(input, needsVerdict) }];

    if (input.screenshotBase64) {
      const file = this.writeScreenshot(
        input.screenshotBase64,
        input.screenshotMediaType,
      );
      userContent.push({
        type: 'image_url',
        image_url: { url: `file://${file}` },
      });
    }

    const modelRuntime = getModelRuntime(
      globalModelConfigManager.getModelConfig('default'),
    );
    const result = await callAI(
      [{ role: 'user', content: userContent }],
      modelRuntime,
    );

    const text = result.content?.trim() ?? '';
    debug('codex run finished', { kind: input.kind, chars: text.length });

    if (!needsVerdict) {
      return { text };
    }
    const verdict = extractVerdict(text);
    if (!verdict) {
      warn(
        `codex general agent reply contained no parseable verdict JSON (kind=${input.kind}); the engine treats this as fail-closed.`,
      );
    }
    return { text, verdict };
  }

  async dispose(): Promise<void> {
    if (this.tempDir) {
      rmSync(this.tempDir, { recursive: true, force: true });
      this.tempDir = undefined;
    }
  }

  private buildPrompt(input: GeneralAgentInput, needsVerdict: boolean): string {
    const parts = [input.context];
    if (input.referencedSkills.length > 0) {
      parts.push(
        `\nThis task references the following skills (not loadable in this environment, judge from the screenshot and history): ${input.referencedSkills.map((s) => `$${s}`).join(', ')}.`,
      );
    }
    if (needsVerdict) {
      parts.push(VERDICT_INSTRUCTIONS);
    }
    return parts.join('\n');
  }

  private writeScreenshot(base64: string, mediaType?: string): string {
    if (!this.tempDir) {
      this.tempDir = mkdtempSync(join(tmpdir(), 'midscene-codex-ga-'));
    }
    const ext = mediaType === 'image/jpeg' ? 'jpg' : 'png';
    const file = join(
      this.tempDir,
      `screenshot-${++this.screenshotCount}.${ext}`,
    );
    writeFileSync(file, Buffer.from(base64, 'base64'));
    return file;
  }
}

/** Parse the last `{"pass": ..., "reason": ...}` object in the reply. */
export function extractVerdict(text: string): Verdict | undefined {
  const candidates = text.match(/\{[^{}]*"pass"[^{}]*\}/g);
  if (!candidates) return undefined;
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (typeof parsed.pass === 'boolean') {
        return {
          pass: parsed.pass,
          reason:
            typeof parsed.reason === 'string' && parsed.reason.trim()
              ? parsed.reason
              : '(no reason given)',
          evidence: parsed.evidence,
        };
      }
    } catch {
      // try the previous candidate
    }
  }
  return undefined;
}
