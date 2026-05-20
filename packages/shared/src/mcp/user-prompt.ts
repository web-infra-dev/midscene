import { z } from 'zod';
import type { UserPromptLike } from './types';

type PromptReferenceImage = { name: string; url: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReferenceImage(value: unknown): value is PromptReferenceImage {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.url === 'string'
  );
}

function validateImagesArray(raw: unknown[]): PromptReferenceImage[] {
  return raw.map((item, index) => {
    if (!isReferenceImage(item)) {
      throw new Error(
        `images[${index}]: expected an object with string fields "name" and "url".`,
      );
    }
    // White-list known fields so unrelated keys do not propagate to aiAssert.
    return { name: item.name, url: item.url };
  });
}

function parseImagesValue(raw: unknown): PromptReferenceImage[] {
  if (raw === undefined || raw === null) return [];

  if (Array.isArray(raw)) {
    return validateImagesArray(raw);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(
        'images: expected a JSON array of { name, url } objects (got a non-JSON string).',
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error(
        'images: expected a JSON array of { name, url } objects (got a non-array JSON value).',
      );
    }
    return validateImagesArray(parsed);
  }

  throw new Error(
    `images: expected an array or JSON string, got ${typeof raw}.`,
  );
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const v = trimmed.toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    throw new Error(
      `convertHttpImage2Base64: expected "true", "false", "1", or "0"; got ${JSON.stringify(value)}.`,
    );
  }
  throw new Error(
    `convertHttpImage2Base64: expected a boolean, got ${typeof value}.`,
  );
}

/**
 * Build a TUserPrompt-compatible value from the CLI/MCP `assert` input.
 *
 * Field names mirror the JS SDK (`prompt`, `images`, `convertHttpImage2Base64`)
 * so calls stay one-to-one with `agent.aiAssert({ prompt, images, ... })`. Each
 * image's `url` may be an http(s) URL, a `data:` URI, or a local file path —
 * `@midscene/shared/img/preProcessImageUrl` resolves all three forms at
 * model-call time, so the CLI does not need a separate local-file flag.
 *
 * Returns the bare prompt string when no images are supplied, preserving
 * existing behavior for plain text assertions.
 */
export function composeUserPrompt(input: {
  prompt: string;
  images?: unknown;
  convertHttpImage2Base64?: unknown;
}): UserPromptLike {
  const images = parseImagesValue(input.images);
  const convertFlag = coerceBoolean(input.convertHttpImage2Base64);

  if (images.length === 0 && convertFlag === undefined) {
    return input.prompt;
  }

  const payload: Exclude<UserPromptLike, string> = { prompt: input.prompt };
  if (images.length > 0) {
    payload.images = images;
  }
  if (convertFlag !== undefined) {
    payload.convertHttpImage2Base64 = convertFlag;
  }
  return payload;
}

/**
 * Zod schema fragment for the multimodal extras accepted by the `assert`
 * tool. Mixed into the tool's schema via `...promptInputExtraSchema`.
 */
export const promptInputExtraSchema = {
  images: z
    .union([
      z.string(),
      z.array(z.object({ name: z.string(), url: z.string() })),
    ])
    .optional()
    .describe(
      'Reference images. JSON array of { "name", "url" }. Each url may be an http(s) URL, a data: URI, or a local file path (resolved by @midscene/core).',
    ),
  convertHttpImage2Base64: z
    .union([z.boolean(), z.string()])
    .optional()
    .describe(
      'If true, convert http(s) image URLs to base64 before sending to the model.',
    ),
};
