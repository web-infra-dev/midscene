import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import type { StudioPlatformId } from '@shared/electron-contract';
import { DEFAULT_STUDIO_WEB_VIEWPORT } from '@shared/web-viewport';
import type { StudioPreviewConnectionState } from '../../playground/preview-discovery';
import { normalizeStudioPlatformId } from '../../playground/selectors';

const MOBILE_PREVIEW_DEFAULT_ASPECT_RATIO = 9 / 19.5;
const MOBILE_PREVIEW_HORIZONTAL_GUTTER_PX = 24;
const MOBILE_PREVIEW_VERTICAL_GUTTER_PX = 56;

function resolvePositiveViewportDimension(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Keep the Web preview canvas tied to the session viewport, rather than the
 * currently decoded MJPEG frame. Form values use namespaced keys after a
 * Studio-created session starts, while setup callers may still use bare keys.
 */
export function resolveStudioWebPreviewAspectRatio(
  formValues: Record<string, unknown>,
): number {
  const width =
    resolvePositiveViewportDimension(formValues['web.viewportWidth']) ??
    resolvePositiveViewportDimension(formValues.viewportWidth) ??
    DEFAULT_STUDIO_WEB_VIEWPORT.width;
  const height =
    resolvePositiveViewportDimension(formValues['web.viewportHeight']) ??
    resolvePositiveViewportDimension(formValues.viewportHeight) ??
    DEFAULT_STUDIO_WEB_VIEWPORT.height;

  return width / height;
}

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

export function shouldUseDesktopPreviewPadding(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  formValues: Record<string, unknown>,
): boolean {
  const platform = resolveStudioPreviewPlatform(runtimeInfo, formValues);
  return platform === 'computer' || platform === 'web';
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
  aspectRatio: number = MOBILE_PREVIEW_DEFAULT_ASPECT_RATIO,
  options: {
    maxHeight?: number;
  } = {},
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
  const cappedAvailableHeight =
    typeof options.maxHeight === 'number' && Number.isFinite(options.maxHeight)
      ? Math.min(availableHeight, Math.max(0, options.maxHeight))
      : availableHeight;

  if (availableWidth === 0 || cappedAvailableHeight === 0) {
    return {
      width: 0,
      height: 0,
    };
  }

  const safeAspectRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : MOBILE_PREVIEW_DEFAULT_ASPECT_RATIO;

  const heightLimitedWidth = cappedAvailableHeight * safeAspectRatio;
  const width = Math.min(availableWidth, heightLimitedWidth);

  return {
    width,
    height: width / safeAspectRatio,
  };
}
