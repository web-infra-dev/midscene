/**
 * General coding agent for `# @agent` / `$skill` steps.
 *
 * Exports: `VERDICT_INSTRUCTIONS`, `buildGeneralPrompt`, `extractVerdict`,
 * `CallAiGeneralAgent`. Built on core's `callAI`, so any OpenAI-compatible
 * endpoint works, including `MIDSCENE_MODEL_BASE_URL=codex://app-server`
 * (Codex CLI OAuth). Core imports are lazy so pure prompt/verdict logic is
 * testable without the model stack.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import type { ModelConfigManager } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { renderSkillsForPrompt } from '../skills';
import type {
  GeneralAgent,
  GeneralAgentRequest,
  GeneralAgentResult,
} from '../types';

export const VERDICT_INSTRUCTIONS = [
  'You have no tools available; reason only from the information given above.',
  'End your reply with a single-line JSON verdict: {"pass": true|false, "reason": "..."}.',
  'Verdicts are fail-closed: if you are unsure or lack evidence, report {"pass": false, "reason": "..."} explaining what is missing.',
].join('\n');

/**
 * Compose the prompt: step prompt (data table / doc string are already merged
 * in by the router), then skills, then verdict instructions for asserts.
 */
export function buildGeneralPrompt(req: GeneralAgentRequest): string {
  const parts: string[] = [req.prompt];
  if (req.skills.length > 0) {
    parts.push(renderSkillsForPrompt(req.skills));
  }
  if (req.kind === 'assert') {
    parts.push(VERDICT_INSTRUCTIONS);
  }
  return parts.join('\n\n');
}

/**
 * Find the last top-level `{...}` candidate in `text` that parses to an
 * object with a boolean `pass`. Brace-balanced scan: survives nested objects
 * and braces inside JSON strings, unlike a naive regex.
 */
export function extractVerdict(
  text: string,
): { pass: boolean; reason: string } | undefined {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      // Quotes in surrounding prose (depth 0) must not poison the scan.
      if (depth > 0) inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (!candidate.includes('"pass"')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { pass?: unknown }).pass === 'boolean'
    ) {
      const reason = (parsed as { reason?: unknown }).reason;
      return {
        pass: (parsed as { pass: boolean }).pass,
        reason:
          typeof reason === 'string' && reason.trim().length > 0
            ? reason
            : '(no reason given)',
      };
    }
  }
  return undefined;
}

type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

let tmpImageSeq = 0;

export class CallAiGeneralAgent implements GeneralAgent {
  private isolatedManager?: ModelConfigManager;

  constructor(private opts: { modelEnv?: Record<string, string> } = {}) {}

  /**
   * With modelEnv, resolve through an ISOLATED ModelConfigManager seeded from
   * process.env + overrides: mutating process.env would either be silently
   * ignored (the global manager caches after its first use — usually a UI
   * step) or leak the override into the UI agent's model resolution.
   */
  private async resolveModelConfig() {
    const envModule = await import('@midscene/shared/env');
    if (!this.opts.modelEnv) {
      return envModule.globalModelConfigManager.getModelConfig('default');
    }
    if (!this.isolatedManager) {
      const seeded: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) seeded[key] = value;
      }
      Object.assign(seeded, this.opts.modelEnv);
      this.isolatedManager = new envModule.ModelConfigManager(seeded);
    }
    return this.isolatedManager.getModelConfig('default');
  }

  async run(req: GeneralAgentRequest): Promise<GeneralAgentResult> {
    const { callAI, getModelRuntime } = await import('@midscene/core/ai-model');

    const modelConfig = await this.resolveModelConfig();
    const runtime = getModelRuntime(modelConfig);

    const content: UserContentPart[] = [
      { type: 'text', text: buildGeneralPrompt(req) },
    ];

    let tmpImagePath: string | undefined;
    if (req.screenshotBase64) {
      const base64 = req.screenshotBase64.replace(/^data:[^,]*,/, '');
      tmpImageSeq += 1;
      tmpImagePath = path.join(
        getMidsceneRunSubDir('tmp'),
        `bdd-agent-${process.pid}-${tmpImageSeq}.png`,
      );
      await fs.writeFile(tmpImagePath, Buffer.from(base64, 'base64'));
      // codex:// maps file:// image_url parts to localImage turn inputs;
      // file:// keeps parity with core's handling of local screenshots.
      content.push({
        type: 'image_url',
        image_url: { url: `file://${tmpImagePath}` },
      });
    }

    let text: string;
    try {
      const result = await callAI([{ role: 'user', content }], runtime);
      text = result.content;
    } finally {
      if (tmpImagePath) {
        await fs.rm(tmpImagePath, { force: true });
      }
    }

    if (req.kind === 'assert') {
      const verdict = extractVerdict(text);
      if (!verdict) {
        const warn = getDebug('bdd:general-agent', { console: true });
        warn(
          'general agent reply contained no JSON verdict; the engine treats this fail-closed (assertion fails)',
        );
      }
      return { text, verdict };
    }

    return { text };
  }

  async dispose(): Promise<void> {
    // No-op: the codex:// connection manager lives in @midscene/core.
  }
}
