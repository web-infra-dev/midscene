import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import type { StudioPlatformId } from '@shared/electron-contract';
import type { StudioPreviewConnectionState } from '../../playground/preview-discovery';
import { normalizeStudioPlatformId } from '../../playground/selectors';

const MOBILE_PREVIEW_ASPECT_RATIO = 9 / 19.5;
const MOBILE_PREVIEW_HORIZONTAL_GUTTER_PX = 24;
const MOBILE_PREVIEW_VERTICAL_GUTTER_PX = 56;

export function resolveStudioPreviewPlatform(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  formValues: Record<string, unknown>,
): StudioPlatformId | undefined {
  return (
    normalizeStudioPlatformId(runtimeInfo?.platformId) ||
    normalizeStudioPlatformId(runtimeInfo?.interface?.type) ||
    normalizeStudioPlatformId(formValues.platformId)
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
