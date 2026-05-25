import { z } from 'zod';
import type { UserPromptLike } from './types';

type PromptReferenceImage = { name: string; url: string };

function normalizeStringList(raw: unknown, fieldName: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(raw)) {
    return raw.map((item, index) => {
      if (typeof item !== 'string') {
        throw new Error(`${fieldName}[${index}]: expected a string.`);
      }
      return item.trim();
    });
  }
  throw new Error(
    `${fieldName}: expected a string or string array, got ${typeof raw}.`,
  );
}

function composeImages(input: {
  image?: unknown;
  imageName?: unknown;
}): PromptReferenceImage[] {
  const urls = normalizeStringList(input.image, 'image');
  const names = normalizeStringList(input.imageName, 'imageName');

  if (urls.length !== names.length) {
    throw new Error(
      `image/imageName: expected the same number of --image and --image-name values, got ${urls.length} image(s) and ${names.length} image name(s).`,
    );
  }

  return urls.map((url, index) => ({ name: names[index], url }));
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

export function composeUserPrompt(input: {
  prompt: string;
  image?: unknown;
  imageName?: unknown;
  convertHttpImage2Base64?: unknown;
}): UserPromptLike {
  const images = composeImages({
    image: input.image,
    imageName: input.imageName,
  });
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

export const promptInputExtraSchema = {
  image: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Reference image URL/path. Repeat --image for multiple images.'),
  imageName: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Reference image name. Repeat --image-name; must align with --image order.',
    ),
  convertHttpImage2Base64: z
    .union([z.boolean(), z.string()])
    .optional()
    .describe(
      'If true, convert http(s) image URLs to base64 before sending to the model.',
    ),
};
