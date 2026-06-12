import type { TModelFamily } from '@midscene/shared/env';
import { normalJsonParser } from '../service-caller/json';
import type { ModelAdapterDefinition } from './types';

function parseNvidiaLocateResponse(raw: string): Record<string, unknown> | null {
  const boxMatch = raw.match(/<box>\s*([\s\S]*?)\s*<\/box>/i);
  if (!boxMatch) {
    return null;
  }

  const coordinates = Array.from(
    boxMatch[1].matchAll(/<\s*(-?\d+(?:\.\d+)?)\s*>/g),
    (match) => Number(match[1]),
  );

  if (coordinates.length !== 4) {
    throw new Error(`invalid nvidia box response: ${raw}`);
  }

  const refMatch = raw.match(/<ref>\s*([\s\S]*?)\s*<\/ref>/i);
  const ref = refMatch?.[1]?.trim();

  return {
    ...(ref ? { ref } : {}),
    bbox: coordinates,
  };
}

const nvidiaJsonParser: ModelAdapterDefinition['jsonParser'] = (
  raw,
  context,
) => {
  try {
    return normalJsonParser(raw, context);
  } catch (error) {
    const parsedLocateResponse = parseNvidiaLocateResponse(raw);
    if (parsedLocateResponse) {
      return parsedLocateResponse;
    }
    throw error;
  }
};

export const nvidiaAdapters = {
  nvidia: {
    jsonParser: nvidiaJsonParser,
    locate: {
      resultAdapter: {
        coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'nvidia'>;
