import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import type { StudioPreviewConnectionState } from '../../playground/preview-discovery';

type PreviewPlatform = 'android' | 'ios' | 'harmony' | 'computer' | 'web';

const MOBILE_PREVIEW_ASPECT_RATIO = 9 / 19.5;
const MOBILE_PREVIEW_HORIZONTAL_GUTTER_PX = 24;
const MOBILE_PREVIEW_VERTICAL_GUTTER_PX = 56;

function normalizePreviewPlatform(value: unknown): PreviewPlatform | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case 'android':
      return 'android';
    case 'ios':
      return 'ios';
    case 'harmony':
    case 'harmonyos':
    case 'harmony-os':
      return 'harmony';
    case 'computer':
    case 'desktop':
    case 'macos':
    case 'windows':
    case 'linux':
      return 'computer';
    case 'web':
    case 'browser':
      return 'web';
    default:
      return undefined;
  }
}

export function resolveStudioPreviewPlatform(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  formValues: Record<string, unknown>,
): PreviewPlatform | undefined {
  return (
    normalizePreviewPlatform(runtimeInfo?.platformId) ||
    normalizePreviewPlatform(runtimeInfo?.interface?.type) ||
    normalizePreviewPlatform(formValues.platformId)
  );
}

export function shouldUseMobilePreviewFrame(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  formValues: Record<string, unknown>,
): boolean {
  const platform = resolveStudioPreviewPlatform(runtimeInfo, formValues);
  return platform === 'android' || platform === 'ios' || platform === 'harmony';
}

export function shouldEnableMobilePreviewFrame(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  formValues: Record<string, unknown>,
  sessionConnected: boolean,
  previewStatus: StudioPreviewConnectionState,
): boolean {
  if (
    !sessionConnected ||
    !shouldUseMobilePreviewFrame(runtimeInfo, formValues)
  ) {
    return false;
  }

  const previewKind = runtimeInfo?.preview.kind;
  if (!previewKind || previewKind === 'none' || previewKind === 'custom') {
    return false;
  }

  return previewKind !== 'scrcpy' || previewStatus === 'connected';
}

export function fitMobilePreviewViewport(
  stageWidth: number,
  stageHeight: number,
): {
  width: number;
  height: number;
} {
  const availableWidth = Math.max(
    0,
    stageWidth - MOBILE_PREVIEW_HORIZONTAL_GUTTER_PX,
  );
  const availableHeight = Math.max(
    0,
    stageHeight - MOBILE_PREVIEW_VERTICAL_GUTTER_PX,
  );

  if (availableWidth === 0 || availableHeight === 0) {
    return {
      width: 0,
      height: 0,
    };
  }

  const heightLimitedWidth = availableHeight * MOBILE_PREVIEW_ASPECT_RATIO;
  const width = Math.min(availableWidth, heightLimitedWidth);

  return {
    width,
    height: width / MOBILE_PREVIEW_ASPECT_RATIO,
  };
}
