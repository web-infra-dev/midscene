import {
  type PlaygroundPreviewDescriptor,
  createMjpegPreviewDescriptor,
  createScrcpyPreviewDescriptor,
  createScreenshotPreviewDescriptor,
} from './platform';

export interface PlaygroundRuntimeInfo {
  /** Stable platform key, e.g. `android`, `ios`, `web`, `computer`. */
  platformId?: string;
  /** User-facing runtime title, e.g. `Midscene Android Playground`. */
  title?: string;
  /** Human-readable platform summary, e.g. `Android playground platform descriptor`. */
  platformDescription?: string;
  interface: {
    type: string;
    description?: string;
  };
  preview: PlaygroundPreviewDescriptor;
  executionUxHints: string[];
  metadata: Record<string, unknown>;
}

// Internal builder input: this keeps raw inference hints separate from the
// public, normalized PlaygroundRuntimeInfo shape.
interface BuildRuntimeInfoInput {
  platformId?: string;
  title?: string;
  platformDescription?: string;
  interfaceType?: string;
  interfaceDescription?: string;
  preview?: PlaygroundPreviewDescriptor;
  metadata?: Record<string, unknown>;
  supportsScreenshot?: boolean;
  mjpegStreamUrl?: string;
  scrcpyPort?: number;
}

export function normalizeExecutionUxHints(
  metadata?: Record<string, unknown>,
): string[] {
  if (!metadata) {
    return [];
  }

  const fromHints = metadata.executionUxHints;
  if (Array.isArray(fromHints)) {
    return fromHints.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  }

  const fromSingle = metadata.executionUx;
  if (typeof fromSingle === 'string' && fromSingle.length > 0) {
    return [fromSingle];
  }

  return [];
}

export function resolvePreviewDescriptor(
  input: Omit<
    BuildRuntimeInfoInput,
    | 'platformId'
    | 'title'
    | 'platformDescription'
    | 'interfaceType'
    | 'interfaceDescription'
    | 'metadata'
  >,
): PlaygroundPreviewDescriptor {
  if (input.preview) {
    return input.preview;
  }

  if (typeof input.scrcpyPort === 'number') {
    return createScrcpyPreviewDescriptor({
      scrcpyPort: input.scrcpyPort,
    });
  }

  if (input.mjpegStreamUrl) {
    return createMjpegPreviewDescriptor();
  }

  if (input.supportsScreenshot) {
    return createScreenshotPreviewDescriptor();
  }

  return {
    kind: 'none',
    capabilities: [],
  };
}

export function buildRuntimeInfo(
  input: BuildRuntimeInfoInput,
): PlaygroundRuntimeInfo {
  const interfaceType = input.interfaceType || 'Unknown';

  return {
    platformId: input.platformId,
    title: input.title,
    platformDescription: input.platformDescription,
    interface: {
      type: interfaceType,
      description: input.interfaceDescription,
    },
    preview: resolvePreviewDescriptor(input),
    executionUxHints: normalizeExecutionUxHints(input.metadata),
    metadata: { ...(input.metadata || {}) },
  };
}
