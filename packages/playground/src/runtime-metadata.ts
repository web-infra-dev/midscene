import {
  type PlaygroundPreviewCapability,
  type PlaygroundPreviewDescriptor,
  createMjpegPreviewDescriptor,
  createScrcpyPreviewDescriptor,
  createScreenshotPreviewDescriptor,
} from './platform';

export interface PlaygroundInterfaceInfo {
  type: string;
  description?: string;
}

export interface PlaygroundRuntimeInfo {
  platformId?: string;
  title?: string;
  description?: string;
  interface: PlaygroundInterfaceInfo;
  preview: PlaygroundPreviewDescriptor;
  executionUxHints: string[];
  metadata: Record<string, unknown>;
}

export interface PlaygroundCapabilitiesInfo {
  interfaceType: string;
  previewMode: PlaygroundPreviewDescriptor['kind'];
  previewCapabilities: PlaygroundPreviewCapability[];
  executionUxHints: string[];
}

export interface PlaygroundRuntimeMetadataInput {
  platformId?: string;
  title?: string;
  description?: string;
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
    PlaygroundRuntimeMetadataInput,
    | 'platformId'
    | 'title'
    | 'description'
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
  input: PlaygroundRuntimeMetadataInput,
): PlaygroundRuntimeInfo {
  const interfaceType = input.interfaceType || 'Unknown';

  return {
    platformId: input.platformId,
    title: input.title,
    description: input.description,
    interface: {
      type: interfaceType,
      description: input.interfaceDescription,
    },
    preview: resolvePreviewDescriptor(input),
    executionUxHints: normalizeExecutionUxHints(input.metadata),
    metadata: { ...(input.metadata || {}) },
  };
}

export function buildCapabilitiesInfo(
  runtimeInfo: PlaygroundRuntimeInfo,
): PlaygroundCapabilitiesInfo {
  return {
    interfaceType: runtimeInfo.interface.type,
    previewMode: runtimeInfo.preview.kind,
    previewCapabilities: runtimeInfo.preview.capabilities || [],
    executionUxHints: runtimeInfo.executionUxHints,
  };
}
