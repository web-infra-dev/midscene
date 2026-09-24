import type { IOSDeviceOpt } from '@midscene/core/device';

export function assertWdaConnectionOptions(
  options?: Pick<IOSDeviceOpt, 'wdaBaseUrl' | 'wdaHost' | 'wdaPort'>,
): void {
  if (
    options?.wdaBaseUrl !== undefined &&
    (options.wdaHost !== undefined || options.wdaPort !== undefined)
  ) {
    throw new Error(
      'wdaBaseUrl cannot be used with wdaHost or wdaPort. Choose one WDA connection method.',
    );
  }
}
