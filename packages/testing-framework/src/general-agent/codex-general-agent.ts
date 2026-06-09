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

    let screenshotFile: string | undefined;
    if (input.screenshotBase64) {
      screenshotFile = this.writeScreenshot(
        input.screenshotBase64,
        input.screenshotMediaType,
      );
      userContent.push({
        type: 'image_url',
        image_url: { url: `file://${screenshotFile}` },
      });
    }

    // Lazy imports: `@midscene/core/ai-model` pulls in heavy image/runtime
    // dependencies that callers of this package should not pay for unless a
    // codex-backed general agent is actually used.
    const [{ callAI, getModelRuntime }, { globalModelConfigManager }] =
      await Promise.all([
        import('@midscene/core/ai-model'),
        import('@midscene/shared/env'),
      ]);
    const modelRuntime = getModelRuntime(
      globalModelConfigManager.getModelConfig('default'),
    );
    let result: Awaited<ReturnType<typeof callAI>>;
    try {
      result = await callAI(
        [{ role: 'user', content: userContent }],
        modelRuntime,
      );
    } finally {
      // The provider has consumed the image once the call settles; delete it
      // so long runs don't accumulate one file per step until dispose().
      if (screenshotFile) rmSync(screenshotFile, { force: true });
    }

    const text = result.content.trim();
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
  const candidates = jsonObjectCandidates(text);
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (!candidates[i].includes('"pass"')) continue;
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

/**
 * Brace-balanced scan for top-level `{...}` substrings. Unlike a
 * `[^{}]*`-style regex, this matches verdicts whose fields contain nested
 * objects (e.g. structured `evidence`).
 */
function jsonObjectCandidates(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (ch === '\\') j++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          out.push(text.slice(i, j + 1));
          i = j; // resume after this object; nested braces stay inside it
          break;
        }
      }
    }
  }
  return out;
}
